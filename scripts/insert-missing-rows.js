// Insert missing rows into Blocks 4, 5, 18 and 19 (production).
//
// No total_stocks changes: every block's declared total already equals the
// post-insert sum, verified as a precondition before any write.
//
// All rows inserted UNTOUCHED: remaining_stock_count = null, no worker fields,
// no active_jobs, no checkin_recorded_by - matching the existing untouched-row
// field shape so the app treats them as never checked out.
//
// Dry run by default. Pass --apply to write.
//
// Usage:
//   node scripts/insert-missing-rows.js farm-managment
//   node scripts/insert-missing-rows.js farm-managment --apply
//   node scripts/insert-missing-rows.js farm-managment --apply "Block 18"
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

// Pre-state figures come from scripts/audit-blocks-integrity.js and are
// re-asserted against a fresh read before writing.
const PLAN = [
  {
    block_name: "Block 4",
    expect_rows: 88,
    expect_sum: 5219,
    expect_total_stocks: 5280,
    insert: [{ row_number: "30B", stock_count: 61 }],
  },
  {
    block_name: "Block 5",
    expect_rows: 72,
    expect_sum: 5461,
    expect_total_stocks: 5540,
    insert: [{ row_number: "3A", stock_count: 79 }],
  },
  {
    block_name: "Block 18",
    expect_rows: 128,
    expect_sum: 6486,
    expect_total_stocks: 6810,
    insert: [
      { row_number: "6B", stock_count: 54 },
      { row_number: "20B", stock_count: 54 },
      { row_number: "51A", stock_count: 54 },
      { row_number: "51B", stock_count: 54 },
      { row_number: "52A", stock_count: 54 },
      { row_number: "53A", stock_count: 54 },
    ],
  },
  {
    block_name: "Block 19",
    expect_rows: 36,
    expect_sum: 1500,
    expect_total_stocks: 1656,
    insert: [
      { row_number: "3A", stock_count: 38 },
      { row_number: "3B", stock_count: 38 },
      { row_number: "15A", stock_count: 43 },
      { row_number: "17B", stock_count: 37 },
    ],
  },
];

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

function makeRow(t) {
  return {
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
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) {
    console.error("usage: node scripts/insert-missing-rows.js <dbName> [--apply] [\"Block N\" ...]");
    process.exit(1);
  }
  const filters = process.argv.filter((a) => /^Block \d+$/.test(a));
  const selected = filters.length
    ? PLAN.filter((p) => filters.includes(p.block_name))
    : PLAN;
  if (filters.length && selected.length !== filters.length) {
    const known = PLAN.map((p) => p.block_name);
    const unknown = filters.filter((f) => !known.includes(f));
    throw new Error("Unknown block(s) in plan: " + unknown.join(", ") + " (known: " + known.join(", ") + ")");
  }

  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primary",
    writeConcern: { w: "majority" },
  });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  const backups = [];
  const results = [];
  let stopAll = false;

  for (const plan of selected) {
    const label = plan.block_name;
    if (stopAll) {
      results.push({ label, status: "SKIPPED", reason: "an earlier block failed" });
      continue;
    }
    try {
      const doc = await coll.findOne({ block_name: label });
      if (!doc) throw new Error("not found in " + dbName);

      const rows = Array.isArray(doc.rows) ? doc.rows : [];
      const malformed = rows.filter(isMalformed);
      if (malformed.length !== 0) {
        throw new Error("refusing: " + malformed.length + " malformed entries present");
      }

      const labels = rows.map((r) => String(r.row_number));
      const set = new Set(labels);
      const dupes = {};
      labels.forEach((l) => { dupes[l] = (dupes[l] || 0) + 1; });
      const dupeList = Object.keys(dupes).filter((k) => dupes[k] > 1);
      if (dupeList.length) throw new Error("refusing: duplicate labels " + dupeList.join(", "));

      const collisions = plan.insert.filter((t) => set.has(t.row_number));
      if (collisions.length) {
        throw new Error("refusing: rows already exist -> " + collisions.map((c) => c.row_number).join(", "));
      }
      for (const t of plan.insert) {
        if (!Number.isInteger(t.stock_count) || t.stock_count < 0) {
          throw new Error("refusing: invalid stock_count for " + t.row_number);
        }
      }

      // --- pre-state assertions against the fresh read ---
      const sumBefore = rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
      const ts = Number(doc.total_stocks) || 0;
      if (rows.length !== plan.expect_rows) {
        throw new Error("pre-state drift: rows " + rows.length + " != expected " + plan.expect_rows);
      }
      if (sumBefore !== plan.expect_sum) {
        throw new Error("pre-state drift: sum " + sumBefore + " != expected " + plan.expect_sum);
      }
      if (ts !== plan.expect_total_stocks) {
        throw new Error("pre-state drift: total_stocks " + ts + " != expected " + plan.expect_total_stocks);
      }

      const adding = plan.insert.reduce((s, t) => s + t.stock_count, 0);
      const sumAfter = sumBefore + adding;
      if (sumAfter !== ts) {
        throw new Error("refusing: resulting sum " + sumAfter + " != total_stocks " + ts);
      }

      const newRows = rows.concat(plan.insert.map(makeRow));
      newRows.sort((a, b) => compareLabels(a.row_number, b.row_number));

      const declared = Number(doc.total_rows) || 0;
      console.log("=== " + label + " / " + dbName + " ===");
      console.log("  rows before:      " + rows.length + " -> " + newRows.length + " (expected " + declared * 2 + ")");
      console.log("  inserting:        " + plan.insert.map((t) => t.row_number + "(" + t.stock_count + ")").join(", "));
      console.log("  stock sum:        " + sumBefore + " -> " + sumAfter);
      console.log("  total_stocks:     " + ts + " (unchanged)");
      console.log("  sum == total:     " + (sumAfter === ts ? "yes" : "NO"));

      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safe = label.replace(/\s+/g, "").toLowerCase();
      const backupFile = path.join(BACKUP_DIR, safe + "-insertrows-" + dbName + "-" + stamp + ".json");
      fs.writeFileSync(backupFile, JSON.stringify(doc, null, 2));
      backups.push(backupFile);
      console.log("  BACKUP:           " + backupFile + " (" + fs.statSync(backupFile).size + " bytes)");

      if (!APPLY) {
        console.log("  DRY RUN - nothing changed.\n");
        results.push({ label, status: "DRY RUN" });
        continue;
      }

      // Guard: _id + expected old total_stocks + expected old row count.
      const res = await coll.updateOne(
        { _id: doc._id, total_stocks: ts, rows: { $size: rows.length } },
        { $set: { rows: newRows } },
        { writeConcern: { w: "majority" } }
      );
      console.log("  update matched:   " + res.matchedCount + ", modified: " + res.modifiedCount);
      if (res.matchedCount !== 1) {
        stopAll = true;
        results.push({ label, status: "FAILED", reason: "matchedCount != 1, document changed concurrently" });
        console.log("  FAILED: matchedCount != 1. Stopping before later blocks.\n");
        continue;
      }

      const after = await coll.findOne({ _id: doc._id });
      const afterRows = Array.isArray(after.rows) ? after.rows : [];
      const afterLabels = afterRows.map((r) => String(r && r.row_number));
      const afterSet = new Set(afterLabels);
      const stillMissing = plan.insert.filter((t) => !afterSet.has(t.row_number));
      const aDupes = {};
      afterLabels.forEach((l) => { aDupes[l] = (aDupes[l] || 0) + 1; });
      const aDupeList = Object.keys(aDupes).filter((k) => aDupes[k] > 1);
      const sumReal = afterRows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
      const sortedOk = JSON.stringify(afterLabels) === JSON.stringify([...afterLabels].sort(compareLabels));

      // Full completeness across the declared range.
      const missingHalves = [];
      for (let n = 1; n <= declared; n++) {
        if (!afterSet.has(n + "A")) missingHalves.push(n + "A");
        if (!afterSet.has(n + "B")) missingHalves.push(n + "B");
      }
      const beyond = [...new Set(afterLabels.map((l) => parseInt(l, 10)).filter(Number.isFinite))]
        .filter((n) => n > declared)
        .sort((a, c) => a - c);

      const ok =
        stillMissing.length === 0 &&
        aDupeList.length === 0 &&
        afterRows.filter(isMalformed).length === 0 &&
        sortedOk &&
        sumReal === after.total_stocks &&
        missingHalves.length === 0;

      console.log("\n  --- verification ---");
      console.log("  rows after:          " + afterRows.length + " (expected " + declared * 2 + ")");
      console.log("  inserted present:    " + (stillMissing.length === 0 ? "yes" : "NO -> " + stillMissing.map((s) => s.row_number).join(", ")));
      console.log("  1.." + declared + " completeness:   " + (missingHalves.length ? "MISSING " + missingHalves.join(", ") : "complete, no missing halves"));
      console.log("  duplicate labels:    " + (aDupeList.length ? aDupeList.join(", ") : "none"));
      console.log("  malformed entries:   " + afterRows.filter(isMalformed).length);
      console.log("  sequence sorted:     " + (sortedOk ? "yes" : "NO"));
      console.log("  stock sum after:     " + sumReal);
      console.log("  total_stocks after:  " + after.total_stocks);
      console.log("  sum == total_stocks: " + (sumReal === after.total_stocks ? "YES" : "NO, diff " + (after.total_stocks - sumReal)));
      if (beyond.length) {
        console.log("  NOTE: base(s) beyond total_rows=" + declared + " still present: " + afterLabels.filter((l) => beyond.includes(parseInt(l, 10))).join(", ") + " (not modified)");
      }
      plan.insert.forEach((t) => {
        const r = afterRows.find((x) => String(x && x.row_number) === t.row_number);
        console.log("  " + t.row_number + ": stock=" + (r && r.stock_count) + ", rem=" + (r && r.remaining_stock_count) + ", worker='" + (r && r.worker_name) + "'");
      });
      console.log("  rollback source:     " + backupFile);
      console.log("");
      results.push({ label, status: ok ? "OK" : "VERIFY FAILED", reason: ok ? undefined : "see verification output above" });
      if (!ok) stopAll = true;
    } catch (e) {
      stopAll = true;
      results.push({ label, status: "FAILED", reason: e.message });
      console.log("=== " + label + " FAILED: " + e.message + "\n");
    }
  }

  console.log("=".repeat(70));
  console.log(APPLY ? "APPLY MODE" : "DRY RUN - no writes performed");
  results.forEach((r) => console.log("  " + r.label.padEnd(9) + r.status.padEnd(14) + (r.reason || "")));
  if (APPLY) {
    console.log("\nbackups:");
    backups.forEach((b) => console.log("  " + b));
  }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });