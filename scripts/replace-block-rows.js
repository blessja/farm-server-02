// Replace a block's rows + totals from a JSON file (owner-supplied corrected block).
//
// Dry run by default. Pass --apply to write.
//
// Usage:
//   node scripts/replace-block-rows.js <dbName> <file.json> ["Block 12"]
//   node scripts/replace-block-rows.js <dbName> <file.json> "Block 12" --apply
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

// expected live state, read fresh before writing (must not have drifted)
const PRE = {
  "Block 12": { rows: 166, sum: 9888, total_stocks: 9620, total_rows: 83 },
  "Block 15": { rows: 118, sum: 0, total_stocks: 6284, total_rows: 59 },
};

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}
function sumOf(rows) {
  return rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
}
function isMalformed(r) {
  const v = r && r.row_number;
  return !(typeof v === "string" && v.length <= 6 && /^\d+[AB]?$/.test(v));
}

(async () => {
  const [dbName, file] = process.argv.slice(2).filter((a) => !a.startsWith("--") && !/^Block \d+$/.test(a));
  const argBlock = process.argv.slice(2).find((a) => /^Block \d+$/.test(a));
  if (!dbName || !file) {
    console.error('usage: node scripts/replace-block-rows.js <dbName> <file.json> ["Block 12"] [--apply]');
    process.exit(1);
  }

  const mine = JSON.parse(fs.readFileSync(file, "utf8"));
  const label = argBlock || mine.block_name;
  if (!label) { console.error("cannot determine block name"); process.exit(1); }

  const newRows = (mine.rows || []).map((r) => Object.assign({}, r));
  if (!newRows.length) throw new Error("file has no rows");
  const malformed = newRows.filter(isMalformed);
  if (malformed.length) throw new Error("refusing: " + malformed.length + " malformed label(s) in file");
  const labels = newRows.map((r) => String(r.row_number));
  const dupes = {};
  labels.forEach((l) => { dupes[l] = (dupes[l] || 0) + 1; });
  const dupeList = Object.keys(dupes).filter((k) => dupes[k] > 1);
  if (dupeList.length) throw new Error("refusing: duplicate labels in file: " + dupeList.join(", "));

  const newSum = sumOf(newRows);
  const newTotalStocks = Number(mine.total_stocks);
  const newTotalRows = Number(mine.total_rows);
  if (newSum !== newTotalStocks) throw new Error(`refusing: file row sum ${newSum} != file total_stocks ${newTotalStocks} (total_stocks must equal row sum)`);
  if (!Number.isInteger(newTotalRows) || newTotalRows <= 0) throw new Error(`refusing: bad total_rows ${mine.total_rows}`);
  if (newTotalRows * 2 !== newRows.length) throw new Error(`refusing: total_rows ${newTotalRows} * 2 != row count ${newRows.length}`);
  const wantLabels = new Set(labels);
  const gaps = [];
  for (let n = 1; n <= newTotalRows; n++) {
    if (!wantLabels.has(n + "A")) gaps.push(n + "A");
    if (!wantLabels.has(n + "B")) gaps.push(n + "B");
  }
  if (gaps.length) throw new Error("refusing: file missing rows for 1.." + newTotalRows + ": " + gaps.join(", "));
  const byLabel = {};
  newRows.forEach((r) => { byLabel[String(r.row_number)] = Number(r.stock_count) || 0; });
  const mirrorBad = [];
  for (let n = 1; n <= newTotalRows; n++) if (byLabel[n + "A"] !== byLabel[n + "B"]) mirrorBad.push(n);
  if (mirrorBad.length) throw new Error("refusing: file A/B mirror breaks at base(s): " + mirrorBad.join(", "));
  const halfA = newRows.filter((r) => /[AB]$/.test(String(r.row_number)) && /A$/.test(String(r.row_number)))
    .reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
  const WANT = { rows: newRows.length, sum: newSum, total_stocks: newTotalStocks, total_rows: newTotalRows };
  console.log("  file half-sum: " + halfA + " x2 = " + halfA * 2);

  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primary",
    writeConcern: { w: "majority" },
  });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  const doc = await coll.findOne({ block_name: label });
  if (!doc) throw new Error(label + " not found in " + dbName);
  const oldRows = Array.isArray(doc.rows) ? doc.rows : [];
  const oldSum = sumOf(oldRows);
  const oldTS = Number(doc.total_stocks) || 0;
  const oldTR = Number(doc.total_rows) || 0;

  console.log("=== " + label + " / " + dbName + " ===");
  console.log("  rows:          " + oldRows.length + " -> " + newRows.length);
  console.log("  stock sum:     " + oldSum + " -> " + newSum);
  console.log("  total_stocks:  " + oldTS + " -> " + newTotalStocks);
  console.log("  total_rows:    " + oldTR + " -> " + newTotalRows);
  console.log("  source file:   " + file);

  const EXPECT = PRE[label];
  if (!EXPECT) throw new Error("no pre-state expectation for " + label + " — add it to PRE in this script");
  if (oldRows.length !== EXPECT.rows) throw new Error(`pre-state drift: rows ${oldRows.length} != ${EXPECT.rows}`);
  if (oldSum !== EXPECT.sum) throw new Error(`pre-state drift: sum ${oldSum} != ${EXPECT.sum}`);
  if (oldTS !== EXPECT.total_stocks) throw new Error(`pre-state drift: total_stocks ${oldTS} != ${EXPECT.total_stocks}`);
  if (oldTR !== EXPECT.total_rows) throw new Error(`pre-state drift: total_rows ${oldTR} != ${EXPECT.total_rows}`);

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = label.replace(/\s+/g, "").toLowerCase();
  const backupFile = path.join(BACKUP_DIR, safe + "-replacerows-" + dbName + "-" + stamp + ".json");
  fs.writeFileSync(backupFile, JSON.stringify(doc, null, 2));
  console.log("  BACKUP:        " + backupFile + " (" + fs.statSync(backupFile).size + " bytes)");

  if (!APPLY) { console.log("  DRY RUN - nothing changed."); await conn.close(); process.exit(0); }

  const res = await coll.updateOne(
    { _id: doc._id, total_stocks: oldTS, total_rows: oldTR, rows: { $size: oldRows.length } },
    { $set: { rows: newRows, total_stocks: newTotalStocks, total_rows: newTotalRows, variety: doc.variety } },
    { writeConcern: { w: "majority" } }
  );
  console.log("  update matched: " + res.matchedCount + ", modified: " + res.modifiedCount);
  if (res.matchedCount !== 1) {
    console.log("  FAILED: matchedCount != 1. Document changed concurrently. Rollback: " + backupFile);
    await conn.close();
    process.exit(1);
  }

  const after = await conn.db.collection("blocks").findOne({ _id: doc._id });
  const afterRows = Array.isArray(after.rows) ? after.rows : [];
  const afterLabels = afterRows.map((r) => String(r && r.row_number));
  const aSet = new Set(afterLabels);
  const aDupes = {};
  afterLabels.forEach((l) => { aDupes[l] = (aDupes[l] || 0) + 1; });
  const aDupeList = Object.keys(aDupes).filter((k) => aDupes[k] > 1);
  const afterSum = sumOf(afterRows);
  const declared = Number(after.total_rows) || 0;
  const missing = [];
  for (let n = 1; n <= declared; n++) {
    if (!aSet.has(n + "A")) missing.push(n + "A");
    if (!aSet.has(n + "B")) missing.push(n + "B");
  }
  const beyond = afterLabels.filter((l) => { const m = /^(\d+)A?$/.exec(l); return m && Number(m[1]) > declared; });
  const mismatches = [];
  for (let n = 1; n <= declared; n++) {
    const a = afterRows.find((r) => String(r && r.row_number) === n + "A");
    const b = afterRows.find((r) => String(r && r.row_number) === n + "B");
    if (a && b && Number(a.stock_count) !== Number(b.stock_count)) mismatches.push(n);
  }
  const ok =
    afterRows.length === WANT.rows &&
    afterSum === WANT.sum &&
    Number(after.total_stocks) === WANT.total_stocks &&
    Number(after.total_rows) === WANT.total_rows &&
    aDupeList.length === 0 &&
    afterRows.filter(isMalformed).length === 0 &&
    missing.length === 0 &&
    beyond.length === 0 &&
    mismatches.length === 0;

  console.log("\n  --- verification ---");
  console.log("  rows after:          " + afterRows.length + " (wanted " + WANT.rows + ")");
  console.log("  stock sum after:     " + afterSum + " (wanted " + WANT.sum + ")");
  console.log("  total_stocks after:  " + after.total_stocks);
  console.log("  total_rows after:    " + after.total_rows);
  console.log("  sum == total_stocks: " + (afterSum === after.total_stocks ? "YES" : "NO, diff " + (after.total_stocks - afterSum)));
  console.log("  duplicate labels:    " + (aDupeList.length ? aDupeList.join(", ") : "none"));
  console.log("  malformed entries:   " + afterRows.filter(isMalformed).length);
  console.log("  missing in 1.." + declared + ":       " + (missing.length ? missing.join(", ") : "none"));
  console.log("  beyond total_rows:   " + (beyond.length ? beyond.join(", ") : "none"));
  console.log("  A/B mismatches:      " + (mismatches.length ? mismatches.join(", ") : "none"));
  console.log("  variety preserved:   " + JSON.stringify(after.variety));
  console.log("  rollback source:     " + backupFile);
  console.log("\n" + (ok ? "OK" : "VERIFY FAILED"));
  await conn.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });
