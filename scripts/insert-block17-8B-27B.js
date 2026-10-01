// Insert missing rows 8B and 27B into Block 17 (production) and set
// total_stocks to 11890.
//
// Both rows inserted UNTOUCHED: remaining_stock_count = null, no worker fields,
// no active_jobs, no checkin_recorded_by - matching the existing untouched-row
// field shape so the app treats them as never checked out.
// Counts (73 each) mirror the A-partner values (8A=73, 27A=73).
//
// total_stocks is corrected 11908 -> 11890, which is the reconciled sum once
// these two rows are in place.
//
// Dry run by default. Pass --apply to write.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

const TO_INSERT = [
  { row_number: "8B", stock_count: 73 },
  { row_number: "27B", stock_count: 73 },
];
const NEW_TOTAL_STOCKS = 11890;

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function isMalformed(r) {
  const v = r && r.row_number;
  return !(typeof v === "string" && v.length <= 6 && /^\d+[AB]?$/.test(v));
}

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
    throw new Error("Refusing: " + malformed.length + " malformed entries present.");
  }
  const labels = new Set(rows.map((r) => String(r.row_number)));
  const collisions = TO_INSERT.filter((t) => labels.has(t.row_number));
  if (collisions.length) {
    throw new Error("Refusing: rows already exist -> " + collisions.map((c) => c.row_number).join(", "));
  }
  for (const t of TO_INSERT) {
    if (!Number.isInteger(t.stock_count) || t.stock_count < 0) {
      throw new Error("Refusing: invalid stock_count for " + t.row_number);
    }
  }
  const adding = TO_INSERT.reduce((s, t) => s + t.stock_count, 0);
  const stockBefore = rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
  const stockAfter = stockBefore + adding;
  if (stockAfter !== NEW_TOTAL_STOCKS) {
    throw new Error(
      "Refusing: resulting sum " + stockAfter + " != target total_stocks " +
      NEW_TOTAL_STOCKS + ". Would leave block inconsistent."
    );
  }

  const newRows = rows.slice();
  TO_INSERT.forEach((t) => {
    newRows.push({
      row_number: t.row_number,
      worker_name: "",
      stock_count: t.stock_count,
      start_time: null,
      worker_id: "",
      remaining_stock_count: null,
      time_spent: 0,
      job_type: "",
      active_jobs: [],
    });
  });
  newRows.sort((a, b) => compareLabels(a.row_number, b.row_number));

  console.log("=== Block 17 / " + dbName + " ===");
  console.log("  rows before:        " + rows.length + " -> " + newRows.length);
  console.log("  inserting:          " + TO_INSERT.map((t) => t.row_number + "(" + t.stock_count + ")").join(", "));
  console.log("  stock sum:          " + stockBefore + " -> " + stockAfter);
  console.log("  total_stocks:       " + doc.total_stocks + " -> " + NEW_TOTAL_STOCKS);
  console.log("  consistent after:   " + (stockAfter === NEW_TOTAL_STOCKS ? "yes, sum == total_stocks" : "NO"));

  const seq = newRows.map((r, i) => ({ i, label: r.row_number }));
  console.log("\n  resulting order around inserts:");
  ["7A", "7B", "8A", "8B", "9A", "26A", "26B", "27A", "27B", "28A", "28B"].forEach((l) => {
    const hit = seq.find((x) => x.label === l);
    console.log("    idx=" + (hit ? hit.i : "-") + " -> " + l);
  });

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, "block17-insert8B27B-" + dbName + "-" + stamp + ".json");
  fs.writeFileSync(backupFile, JSON.stringify(doc, null, 2));
  console.log("\n  BACKUP: " + backupFile + " (" + fs.statSync(backupFile).size + " bytes)");

  if (!APPLY) {
    console.log("\n  DRY RUN - nothing changed. Re-run with --apply to execute.");
    await conn.close();
    return;
  }

  const res = await coll.updateOne(
    { _id: doc._id, total_stocks: doc.total_stocks },
    { $set: { rows: newRows, total_stocks: NEW_TOTAL_STOCKS } },
    { writeConcern: { w: "majority" } }
  );
  console.log("\n  update matched: " + res.matchedCount + ", modified: " + res.modifiedCount);
  if (res.matchedCount !== 1) {
    console.log("  WARNING: matchedCount != 1 - document changed concurrently. Review needed.");
  }

  const after = await coll.findOne({ _id: doc._id });
  const afterRows = Array.isArray(after.rows) ? after.rows : [];
  const afterLabels = afterRows.map((r) => String(r && r.row_number));
  const stillMissing = TO_INSERT.filter((t) => !afterLabels.includes(t.row_number));
  const dupes = {};
  afterLabels.forEach((l) => { dupes[l] = (dupes[l] || 0) + 1; });
  const dupeList = Object.keys(dupes).filter((k) => dupes[k] > 1);
  const afterStock = afterRows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
  const sortedOk = JSON.stringify(afterLabels) === JSON.stringify([...afterLabels].sort(compareLabels));

  // Full completeness re-check, not just the two rows.
  const declared = Number(after.total_rows) || 0;
  const labelSet = new Set(afterLabels);
  const anyMissing = [];
  for (let n = 1; n <= declared; n++) {
    if (!labelSet.has(n + "A")) anyMissing.push(n + "A");
    if (!labelSet.has(n + "B")) anyMissing.push(n + "B");
  }

  console.log("\n=== Verification ===");
  console.log("  rows after:          " + afterRows.length + " (expected " + declared * 2 + ")");
  console.log("  8B / 27B present:    " + (stillMissing.length === 0 ? "yes" : "NO -> " + stillMissing.map((s) => s.row_number).join(", ")));
  console.log("  full 1.." + declared + " completeness: " + (anyMissing.length ? "MISSING " + anyMissing.join(", ") : "complete, no missing halves"));
  console.log("  duplicate labels:    " + (dupeList.length ? dupeList.join(", ") : "none"));
  console.log("  malformed entries:   " + afterRows.filter(isMalformed).length);
  console.log("  sequence sorted:     " + (sortedOk ? "yes" : "NO"));
  console.log("  stock sum after:     " + afterStock);
  console.log("  total_stocks after:  " + after.total_stocks);
  console.log("  sum == total_stocks: " + (afterStock === after.total_stocks ? "YES" : "NO, diff " + (after.total_stocks - afterStock)));
  TO_INSERT.forEach((t) => {
    const r = afterRows.find((x) => String(x && x.row_number) === t.row_number);
    console.log("  " + t.row_number + ": stock=" + (r && r.stock_count) + ", rem=" + (r && r.remaining_stock_count) + ", worker='" + (r && r.worker_name) + "'");
  });
  console.log("  rollback source:     " + backupFile);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });