// Targeted production corrections from the farm owner's review.
//
//   Block 1  delete row 44B (19 vines)          sum 4682 -> 4663 = total_stocks
//   Block 2  delete row 57B (67 vines)          sum 7912 -> 7845 = total_stocks
//   Block 7  row 37B 94 -> 92 (owner: both halves 92)  sum 7760 -> 7758, total_stocks follows
//   Block 4  total_rows 44 -> 45 (45A exists, owner: no 45B)
//   Block 5  total_rows 36 -> 37 (37A exists, owner: no 37B)
//   Block 8  total_stocks 1338 -> 1388 (rows already sum to 1388)
//   Block 16 total_stocks 8086 -> 8096 (rows already sum to 8096)
//
// Every block is asserted against a fresh read before writing; the update
// filter carries _id + old total_stocks + old row count so a concurrent
// change makes matchedCount != 1 and we stop.
//
// Dry run by default. Pass --apply to write.
//
// Usage:
//   node scripts/fix-block-totals.js farm-managment
//   node scripts/fix-block-totals.js farm-managment --apply
//   node scripts/fix-block-totals.js farm-managment --apply "Block 1"
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

const PLAN = [
  {
    block_name: "Block 1",
    expect_rows: 88, expect_sum: 4682, expect_total_stocks: 4663, expect_total_rows: 44,
    deleteRows: ["44B"],
    post_sum: 4663, post_total_stocks: 4663, post_total_rows: 44, post_rows: 87,
  },
  {
    block_name: "Block 2",
    expect_rows: 114, expect_sum: 7912, expect_total_stocks: 7845, expect_total_rows: 57,
    deleteRows: ["57B"],
    post_sum: 7845, post_total_stocks: 7845, post_total_rows: 57, post_rows: 113,
  },
  {
    block_name: "Block 7",
    expect_rows: 84, expect_sum: 7760, expect_total_stocks: 7760, expect_total_rows: 42,
    setRows: [{ row_number: "37B", stock_count: 92 }],
    setTotalStocks: 7758,
    post_sum: 7758, post_total_stocks: 7758, post_total_rows: 42, post_rows: 84,
  },
  {
    block_name: "Block 4",
    expect_rows: 89, expect_sum: 5280, expect_total_stocks: 5280, expect_total_rows: 44,
    setTotalRows: 45,
    post_sum: 5280, post_total_stocks: 5280, post_total_rows: 45, post_rows: 89,
  },
  {
    block_name: "Block 5",
    expect_rows: 73, expect_sum: 5540, expect_total_stocks: 5540, expect_total_rows: 36,
    setTotalRows: 37,
    post_sum: 5540, post_total_stocks: 5540, post_total_rows: 37, post_rows: 73,
  },
  {
    block_name: "Block 8",
    expect_rows: 22, expect_sum: 1388, expect_total_stocks: 1338, expect_total_rows: 11,
    setTotalStocks: 1388,
    post_sum: 1388, post_total_stocks: 1388, post_total_rows: 11, post_rows: 22,
  },
  {
    block_name: "Block 16",
    expect_rows: 156, expect_sum: 8096, expect_total_stocks: 8086, expect_total_rows: 78,
    setTotalStocks: 8096,
    post_sum: 8096, post_total_stocks: 8096, post_total_rows: 78, post_rows: 156,
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

function sumOf(rows) {
  return rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) {
    console.error("usage: node scripts/fix-block-totals.js <dbName> [--apply] [\"Block N\" ...]");
    process.exit(1);
  }
  const filters = process.argv.filter((a) => /^Block \d+$/.test(a));
  const selected = filters.length ? PLAN.filter((p) => filters.includes(p.block_name)) : PLAN;
  if (filters.length && selected.length !== filters.length) {
    const known = PLAN.map((p) => p.block_name);
    throw new Error("Unknown block(s): " + filters.filter((f) => !known.includes(f)).join(", ") +
      " (in this plan: " + known.join(", ") + ")");
  }

  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primary",
    writeConcern: { w: "majority" },
  });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  const backups = [];
  const results = [];
  let stop = false;

  for (const plan of selected) {
    const label = plan.block_name;
    if (stop) { results.push({ label, status: "SKIPPED", reason: "earlier block failed" }); continue; }
    try {
      const doc = await coll.findOne({ block_name: label });
      if (!doc) throw new Error("not found in " + dbName);
      const rows = Array.isArray(doc.rows) ? doc.rows : [];

      const malformed = rows.filter(isMalformed);
      if (malformed.length) throw new Error("refusing: " + malformed.length + " malformed entries");

      const labels = rows.map((r) => String(r.row_number));
      const dupes = {};
      labels.forEach((l) => { dupes[l] = (dupes[l] || 0) + 1; });
      const dupeList = Object.keys(dupes).filter((k) => dupes[k] > 1);
      if (dupeList.length) throw new Error("refusing: duplicate labels " + dupeList.join(", "));

      const sumBefore = sumOf(rows);
      const tsBefore = Number(doc.total_stocks) || 0;
      const trBefore = Number(doc.total_rows) || 0;

      // --- pre-state assertions ---
      if (rows.length !== plan.expect_rows) throw new Error(`pre-state drift: rows ${rows.length} != ${plan.expect_rows}`);
      if (sumBefore !== plan.expect_sum) throw new Error(`pre-state drift: sum ${sumBefore} != ${plan.expect_sum}`);
      if (tsBefore !== plan.expect_total_stocks) throw new Error(`pre-state drift: total_stocks ${tsBefore} != ${plan.expect_total_stocks}`);
      if (trBefore !== plan.expect_total_rows) throw new Error(`pre-state drift: total_rows ${trBefore} != ${plan.expect_total_rows}`);

      // --- build the new rows array ---
      let newRows = rows.slice();
      const notes = [];

      for (const label2 of plan.deleteRows || []) {
        const idx = newRows.findIndex((r) => String(r.row_number) === label2);
        if (idx < 0) throw new Error("refusing: row to delete not found -> " + label2);
        const victim = newRows[idx];
        notes.push(`delete ${label2} (stock=${victim.stock_count}, worker='${victim.worker_name}', rem=${victim.remaining_stock_count})`);
        newRows.splice(idx, 1);
      }

      for (const t of plan.setRows || []) {
        const idx = newRows.findIndex((r) => String(r.row_number) === t.row_number);
        if (idx < 0) throw new Error("refusing: row to update not found -> " + t.row_number);
        const before = Number(newRows[idx].stock_count);
        if (!Number.isInteger(t.stock_count) || t.stock_count < 0) throw new Error("refusing: bad stock_count for " + t.row_number);
        notes.push(`set ${t.row_number} stock ${before} -> ${t.stock_count}`);
        newRows[idx] = Object.assign({}, newRows[idx], { stock_count: t.stock_count });
      }

      const newTotalStocks = plan.setTotalStocks != null ? plan.setTotalStocks : tsBefore;
      const newTotalRows = plan.setTotalRows != null ? plan.setTotalRows : trBefore;
      if (plan.setTotalStocks != null) notes.push(`total_stocks ${tsBefore} -> ${newTotalStocks}`);
      if (plan.setTotalRows != null) notes.push(`total_rows ${trBefore} -> ${newTotalRows}`);

      const sumAfter = sumOf(newRows);
      if (sumAfter !== plan.post_sum) throw new Error(`refusing: resulting sum ${sumAfter} != planned ${plan.post_sum}`);
      if (newTotalStocks !== plan.post_total_stocks) throw new Error(`refusing: resulting total_stocks ${newTotalStocks} != planned ${plan.post_total_stocks}`);
      if (newTotalRows !== plan.post_total_rows) throw new Error(`refusing: resulting total_rows ${newTotalRows} != planned ${plan.post_total_rows}`);
      if (newRows.length !== plan.post_rows) throw new Error(`refusing: resulting rows ${newRows.length} != planned ${plan.post_rows}`);
      if (sumAfter !== newTotalStocks) throw new Error(`refusing: resulting sum ${sumAfter} != total_stocks ${newTotalStocks}`);

      console.log("=== " + label + " / " + dbName + " ===");
      console.log("  rows:          " + rows.length + " -> " + newRows.length);
      console.log("  stock sum:     " + sumBefore + " -> " + sumAfter);
      console.log("  total_stocks:  " + tsBefore + " -> " + newTotalStocks);
      console.log("  total_rows:    " + trBefore + " -> " + newTotalRows);
      notes.forEach((n) => console.log("  change:        " + n));

      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safe = label.replace(/\s+/g, "").toLowerCase();
      const backupFile = path.join(BACKUP_DIR, safe + "-fixtotals-" + dbName + "-" + stamp + ".json");
      fs.writeFileSync(backupFile, JSON.stringify(doc, null, 2));
      backups.push(backupFile);
      console.log("  BACKUP:        " + backupFile + " (" + fs.statSync(backupFile).size + " bytes)");

      if (!APPLY) { console.log("  DRY RUN - nothing changed.\n"); results.push({ label, status: "DRY RUN" }); continue; }

      const update = { rows: newRows };
      if (plan.setTotalStocks != null) update.total_stocks = newTotalStocks;
      if (plan.setTotalRows != null) update.total_rows = newTotalRows;

      const res = await coll.updateOne(
        { _id: doc._id, total_stocks: tsBefore, total_rows: trBefore, rows: { $size: rows.length } },
        { $set: update },
        { writeConcern: { w: "majority" } }
      );
      console.log("  update matched: " + res.matchedCount + ", modified: " + res.modifiedCount);
      if (res.matchedCount !== 1) {
        stop = true;
        results.push({ label, status: "FAILED", reason: "matchedCount != 1, document changed concurrently" });
        console.log("  FAILED: matchedCount != 1. Stopping.\n");
        continue;
      }

      const after = await coll.findOne({ _id: doc._id });
      const afterRows = Array.isArray(after.rows) ? after.rows : [];
      const afterLabels = afterRows.map((r) => String(r && r.row_number));
      const afterSet = new Set(afterLabels);
      const aDupes = {};
      afterLabels.forEach((l) => { aDupes[l] = (aDupes[l] || 0) + 1; });
      const aDupeList = Object.keys(aDupes).filter((k) => aDupes[k] > 1);
      const afterSum = sumOf(afterRows);
      const declared = Number(after.total_rows) || 0;

      const missing = [];
      for (let n = 1; n <= declared; n++) {
        if (!afterSet.has(n + "A")) missing.push(n + "A");
        if (!afterSet.has(n + "B")) missing.push(n + "B");
      }
      const beyond = afterLabels.filter((l) => { const m = /^(\d+)A?$/.exec(l); return m && Number(m[1]) > declared; });

      const ok =
        afterRows.length === plan.post_rows &&
        afterSum === plan.post_sum &&
        Number(after.total_stocks) === plan.post_total_stocks &&
        Number(after.total_rows) === plan.post_total_rows &&
        aDupeList.length === 0 &&
        afterRows.filter(isMalformed).length === 0;

      console.log("\n  --- verification ---");
      console.log("  rows after:          " + afterRows.length + " (planned " + plan.post_rows + ")");
      console.log("  stock sum after:     " + afterSum + " (planned " + plan.post_sum + ")");
      console.log("  total_stocks after:  " + after.total_stocks);
      console.log("  total_rows after:    " + after.total_rows);
      console.log("  sum == total_stocks: " + (afterSum === after.total_stocks ? "YES" : "NO, diff " + (after.total_stocks - afterSum)));
      console.log("  duplicate labels:    " + (aDupeList.length ? aDupeList.join(", ") : "none"));
      console.log("  malformed entries:   " + afterRows.filter(isMalformed).length);
      console.log("  missing in 1.." + declared + ":      " + (missing.length ? missing.join(", ") : "none"));
      console.log("  beyond total_rows:   " + (beyond.length ? beyond.join(", ") : "none"));
      (plan.deleteRows || []).forEach((l) => console.log("  " + l + " removed:    " + (afterSet.has(l) ? "NO, STILL PRESENT" : "yes")));
      (plan.setRows || []).forEach((t) => {
        const r = afterRows.find((x) => String(x && x.row_number) === t.row_number);
        console.log("  " + t.row_number + " stock now:  " + (r && r.stock_count) + (r && r.stock_count === t.stock_count ? " (ok)" : " (MISMATCH)"));
      });
      console.log("  rollback source:     " + backupFile);
      console.log("");
      results.push({ label, status: ok ? "OK" : "VERIFY FAILED", reason: ok ? undefined : "see output above" });
      if (!ok) stop = true;
    } catch (e) {
      stop = true;
      results.push({ label, status: "FAILED", reason: e.message });
      console.log("=== " + label + " FAILED: " + e.message + "\n");
    }
  }

  console.log("=".repeat(70));
  console.log(APPLY ? "APPLY MODE" : "DRY RUN - no writes performed");
  results.forEach((r) => console.log("  " + r.label.padEnd(9) + r.status.padEnd(14) + (r.reason || "")));
  if (APPLY) { console.log("\nbackups:"); backups.forEach((b) => console.log("  " + b)); }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });