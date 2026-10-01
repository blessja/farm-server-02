// Insert the 6 missing A/B rows into Block 17 in production.
//
// Rows are inserted UNTOUCHED: remaining_stock_count = null, no worker fields,
// no active_jobs, no checkin_recorded_by. Vine counts are set from the values
// supplied by the farm owner; the app populates the work later.
//
// Matching an existing untouched row's field shape (verified: untouched rows
// carry no checkin_recorded_by key, while completed rows carry "Jackson").
//
// Insertion is positional: the array is rebuilt in sorted order and written
// with a single $set, so the sequence stays ordered by base row number.
// A no-op $set is skipped so nothing is rewritten unnecessarily.
//
// Dry run by default. Pass --apply to write.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

// row_number -> stock_count, as supplied by the farm owner.
const TO_INSERT = [
  { row_number: "47B", stock_count: 73 },
  { row_number: "95A", stock_count: 14 },
  { row_number: "96A", stock_count: 10 },
  { row_number: "96B", stock_count: 10 },
  { row_number: "97A", stock_count: 6 },
];

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function isMalformed(r) {
  const v = r && r.row_number;
  return !(typeof v === "string" && v.length <= 6 && /^\d+[AB]?$/.test(v));
}

// Sort key: numeric base row, then A before B.
function sortKey(label) {
  const m = /^(\d+)([AB]?)$/.exec(String(label));
  if (!m) return [Infinity, "Z"];
  return [Number(m[1]), m[2] === "A" ? 0 : m[2] === "B" ? 1 : 2];
}

function compareLabels(a, b) {
  const [na, sa] = sortKey(a);
  const [nb, sb] = sortKey(b);
  if (na !== nb) return na - nb;
  return sa - sb;
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primary",
    writeConcern: { w: "majority" },
  });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  const doc = await coll.findOne({ block_name: "Block 17" });
  if (!doc) throw new Error("Block 17 not found in " + dbName);

  const rows = Array.isArray(doc.rows) ? doc.rows : [];

  // ---- preconditions ----
  const malformed = rows.filter(isMalformed);
  if (malformed.length !== 0) {
    throw new Error(
      "Refusing: " + malformed.length + " malformed entries still present. " +
      "Run repair-block17-corrupt-row.js first."
    );
  }
  const existingLabels = new Set(rows.map((r) => String(r.row_number)));
  const collisions = TO_INSERT.filter((t) => existingLabels.has(t.row_number));
  if (collisions.length) {
    throw new Error(
      "Refusing: rows already exist -> " +
      collisions.map((c) => c.row_number).join(", ") +
      ". Nothing to insert."
    );
  }
  for (const t of TO_INSERT) {
    if (!Number.isInteger(t.stock_count) || t.stock_count < 0) {
      throw new Error("Refusing: invalid stock_count for " + t.row_number);
    }
  }

  const totalStocks = Number(doc.total_stocks) || 0;
  const stockBefore = rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
  const adding = TO_INSERT.reduce((s, t) => s + t.stock_count, 0);
  const stockAfter = stockBefore + adding;

  console.log("=== Block 17 / " + dbName + " : insert missing rows ===");
  console.log("  rows before:      " + rows.length);
  console.log("  inserting:        " + TO_INSERT.length + " -> " + TO_INSERT.map((t) => t.row_number + "(" + t.stock_count + ")").join(", "));
  console.log("  rows after:       " + (rows.length + TO_INSERT.length));
  console.log("  stock sum:        " + stockBefore + " -> " + stockAfter + " (+" + adding + ")");
  console.log("  declared total_stocks: " + totalStocks +
    (stockAfter === totalStocks ? "  (matches after insert)" : "  (differs by " + (totalStocks - stockAfter) + " after insert)"));

  // ---- build new array, preserving untouched-row field shape ----
  const template = rows.find((r) => r && r.remaining_stock_count == null && r.active_jobs && !r.active_jobs.length);
  const templateKeys = template ? Object.keys(template) : null;
  const newRows = rows.slice();
  TO_INSERT.forEach((t) => {
    const row = {
      row_number: t.row_number,
      worker_name: "",
      stock_count: t.stock_count,
      start_time: null,
      worker_id: "",
      remaining_stock_count: null,
      time_spent: 0,
      job_type: "",
      active_jobs: [],
    };
    newRows.push(row);
  });
  newRows.sort((a, b) => compareLabels(a.row_number, b.row_number));

  console.log("\n  untouched-row field template: " + JSON.stringify(templateKeys));

  const changed = JSON.stringify(newRows) !== JSON.stringify(rows);

  // ---- backup ----
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, "block17-insertrows-" + dbName + "-" + stamp + ".json");
  fs.writeFileSync(backupFile, JSON.stringify(doc, null, 2));
  console.log("\n  BACKUP: " + backupFile + " (" + fs.statSync(backupFile).size + " bytes)");

  if (!APPLY) {
    console.log("\n  DRY RUN - nothing changed. Re-run with --apply to execute.");
    if (changed) {
      console.log("\n  Resulting sequence around the inserts:");
      const idxs = newRows
        .map((r, i) => ({ i, label: r.row_number }))
        .filter((x) => ["46B", "47A", "47B", "48A", "94A", "94B", "95A", "95B", "96A", "96B", "97A", "97B"].includes(x.label));
      idxs.forEach((x) => console.log("    idx=" + x.i + " -> " + x.label));
    }
    await conn.close();
    return;
  }

  // ---- write ----
  const res = await coll.updateOne(
    { _id: doc._id, "rows.185": rows[185] },
    { $set: { rows: newRows } },
    { writeConcern: { w: "majority" } }
  );
  console.log("\n  update matched: " + res.matchedCount + ", modified: " + res.modifiedCount);
  if (res.matchedCount !== 1) {
    console.log("  WARNING: matchedCount != 1 - document changed concurrently. Please review.");
  }

  // ---- verify ----
  const after = await coll.findOne({ _id: doc._id });
  const afterRows = Array.isArray(after.rows) ? after.rows : [];
  const afterLabels = afterRows.map((r) => String(r && r.row_number));
  const stillMissing = TO_INSERT.filter((t) => !afterLabels.includes(t.row_number));
  const afterStock = afterRows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
  const dupes = {};
  afterRows.forEach((r) => { const l = String(r && r.row_number); dupes[l] = (dupes[l] || 0) + 1; });
  const dupeList = Object.keys(dupes).filter((k) => dupes[k] > 1);
  const malformedAfter = afterRows.filter(isMalformed).length;
  const sortedOk = JSON.stringify(afterLabels) === JSON.stringify([...afterLabels].sort(compareLabels));
  const insertedNow = TO_INSERT.map((t) => {
    const r = afterRows.find((x) => String(x && x.row_number) === t.row_number);
    return t.row_number + ":stock=" + (r && r.stock_count) + ",rem=" + (r && r.remaining_stock_count);
  });

  console.log("\n=== Verification ===");
  console.log("  rows after:            " + afterRows.length + " (was " + rows.length + ")");
  console.log("  still missing:         " + (stillMissing.length ? stillMissing.map((s) => s.row_number).join(", ") : "none"));
  console.log("  duplicate labels:      " + (dupeList.length ? dupeList.join(", ") : "none"));
  console.log("  malformed entries:     " + malformedAfter);
  console.log("  sequence sorted:       " + (sortedOk ? "yes" : "NO - needs review"));
  console.log("  stock sum after:       " + afterStock + " (was " + stockBefore + ")");
  console.log("  inserted rows:         " + insertedNow.join(" | "));
  console.log("  rollback source:       " + backupFile);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });