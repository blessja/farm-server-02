// Compare a JSON block file against the live DB document. Read-only.
//
// Usage: node scripts/compare-block-json.js <dbName> <file.json> ["Block 12"]
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function index(rows) {
  const map = {};
  for (const r of rows || []) map[String(r.row_number)] = Number(r.stock_count) || 0;
  return map;
}

(async () => {
  const dbName = process.argv[2];
  const file = process.argv[3];
  if (!dbName || !file) {
    console.error('usage: node scripts/compare-block-json.js <dbName> <file.json> ["Block 12"]');
    process.exit(1);
  }
  const mine = JSON.parse(fs.readFileSync(file, "utf8"));
  const label = process.argv[4] || mine.block_name;
  if (!label) { console.error("cannot determine block name"); process.exit(1); }

  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" }).asPromise();
  const doc = await conn.db.collection("blocks").findOne({ block_name: label });
  await conn.close();
  if (!doc) throw new Error(label + " not found in " + dbName);

  const a = index(mine.rows);
  const b = index(doc.rows);
  const all = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(
    (x, y) => (parseInt(x) - parseInt(y)) || x.localeCompare(y)
  );

  const sumA = Object.values(a).reduce((s, v) => s + v, 0);
  const sumB = Object.values(b).reduce((s, v) => s + v, 0);

  console.log("=== " + label + " ===");
  console.log("file: " + file);
  console.log("");
  console.log("field              file            db");
  console.log("block_name         " + String(mine.block_name).padEnd(15) + doc.block_name);
  console.log("variety            " + String(mine.variety).padEnd(15) + doc.variety);
  console.log("year_planted       " + String(mine.year_planted).padEnd(15) + doc.year_planted);
  console.log("rootstock          " + String(mine.rootstock).padEnd(15) + doc.rootstock);
  console.log("size_ha            " + String(mine.size_ha).padEnd(15) + doc.size_ha);
  console.log("total_rows         " + String(mine.total_rows).padEnd(15) + doc.total_rows);
  console.log("total_stocks       " + String(mine.total_stocks).padEnd(15) + doc.total_stocks);
  console.log("row count          " + String((mine.rows || []).length).padEnd(15) + (doc.rows || []).length);
  console.log("row sum            " + String(sumA).padEnd(15) + sumB);
  console.log("");
  console.log("file: sum " + sumA + " vs total_stocks " + mine.total_stocks + " -> " +
    (sumA === Number(mine.total_stocks) ? "MATCH" : "MISMATCH " + (sumA - Number(mine.total_stocks))));
  console.log("db:   sum " + sumB + " vs total_stocks " + doc.total_stocks + " -> " +
    (sumB === Number(doc.total_stocks) ? "MATCH" : "MISMATCH " + (sumB - Number(doc.total_stocks))));
  console.log("");

  const diffs = [];
  for (const k of all) {
    const inA = k in a, inB = k in b;
    if (!inA) diffs.push({ row: k, file: "(absent)", db: b[k], kind: "only in db" });
    else if (!inB) diffs.push({ row: k, file: a[k], db: "(absent)", kind: "only in file" });
    else if (a[k] !== b[k]) diffs.push({ row: k, file: a[k], db: b[k], delta: a[k] - b[k], kind: "value" });
  }

  console.log("differing rows: " + diffs.length);
  if (diffs.length) {
    console.log("");
    console.log("row      file      db     delta   note");
    for (const d of diffs) {
      console.log(
        String(d.row).padEnd(8) +
        String(d.file).padStart(7) +
        String(d.db).padStart(9) +
        String(d.delta === undefined ? "" : d.delta).padStart(8) + "   " + d.kind
      );
    }
    const onlyVal = diffs.filter((d) => d.kind === "value");
    const totalDelta = onlyVal.reduce((s, d) => s + d.delta, 0);
    console.log("");
    console.log("net delta on shared rows: " + totalDelta);
  }

  // per-base side by side where values differ
  const baseRe = /^(\d+)([AB])$/;
  const bases = {};
  for (const d of diffs) {
    const m = baseRe.exec(d.row);
    if (m) (bases[m[1]] = bases[m[1]] || []).push(d);
  }
  if (Object.keys(bases).length) {
    console.log("");
    console.log("affected bases:");
    for (const n of Object.keys(bases).map(Number).sort((x, y) => x - y)) {
      const items = bases[n];
      console.log("  base " + n + ": " + items.map((d) => d.row + " file=" + d.file + " db=" + d.db).join(" | "));
    }
  }
})().catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });
