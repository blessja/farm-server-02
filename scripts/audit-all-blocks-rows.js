// Read-only: full per-block row completeness audit (production or dev).
// For each block, checks every base row 1..total_rows for its A and B halves,
// and reconciles the stock sum against total_stocks.
//
// No writes.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function isMalformed(r) {
  const v = r && r.row_number;
  return !(typeof v === "string" && v.length <= 6 && /^\d+[AB]?$/.test(v));
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");
  const blocks = await coll.find({}).toArray();
  blocks.sort((a, b) =>
    String(a.block_name).localeCompare(String(b.block_name), undefined, { numeric: true })
  );

  let blocksWithMissing = 0;
  let blocksWithStockGap = 0;
  const report = [];

  for (const b of blocks) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const labels = rows.map((r) => String(r && r.row_number));
    const labelSet = new Set(labels);
    const declared = Number(b.total_rows) || 0;
    const declaredStocks = Number(b.total_stocks) || 0;
    const sum = rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);

    const missing = [];
    for (let n = 1; n <= declared; n++) {
      if (!labelSet.has(n + "A")) missing.push(n + "A");
      if (!labelSet.has(n + "B")) missing.push(n + "B");
    }

    const dupes = {};
    labels.filter((l) => /^[0-9]+[AB]?$/.test(l)).forEach((l) => { dupes[l] = (dupes[l] || 0) + 1; });
    const dupeList = Object.keys(dupes).filter((k) => dupes[k] > 1);

    const malformed = rows.filter(isMalformed).length;

    // Rows beyond the declared range (e.g. total_rows says 44 but a 45 exists).
    const extraBases = [...new Set(labels.map((l) => parseInt(l, 10)).filter((n) => Number.isFinite(n) && n > declared))]
      .sort((x, y) => x - y);

    // A/B pairs whose counts disagree - useful context when a row is missing.
    const byBase = {};
    rows.forEach((r) => {
      const l = String(r && r.row_number);
      const m = /^(\d+)([AB])$/.exec(l);
      if (!m) return;
      byBase[m[1]] = byBase[m[1]] || {};
      byBase[m[1]][m[2]] = Number(r.stock_count) || 0;
    });

    const stockGap = declaredStocks - sum;
    const zeroStockRows = rows.filter((r) => (Number(r && r.stock_count) || 0) === 0).length;

    const issues = [];
    if (missing.length) issues.push(`${missing.length} missing`);
    if (dupeList.length) issues.push(`${dupeList.length} dup`);
    if (malformed) issues.push(`${malformed} malformed`);
    if (extraBases.length) issues.push(`extra bases ${extraBases.join(",")}`);
    if (stockGap !== 0) issues.push(`stock gap ${stockGap > 0 ? "+" : ""}${stockGap}`);
    if (zeroStockRows) issues.push(`${zeroStockRows} zero-stock`);

    if (missing.length || dupeList.length || malformed || extraBases.length) blocksWithMissing++;
    if (stockGap !== 0) blocksWithStockGap++;

    report.push({ b, missing, dupeList, malformed, extraBases, stockGap, sum, declaredStocks, declared, rowCount: rows.length, byBase, zeroStockRows });
  }

  console.log("=== FULL PER-BLOCK AUDIT: " + dbName + " ===\n");
  report.forEach((r) => {
    const name = String(r.b.block_name).padEnd(9);
    const stockDiff = r.declaredStocks - r.sum;
    const flagMissing = r.missing.length ? "MISSING" : "ok";
    console.log(
      `${name} rows=${String(r.rowCount).padStart(4)}  declared=${String(r.declared).padStart(3)}  ` +
      `sum=${String(r.sum).padStart(6)} vs total_stocks=${String(r.declaredStocks).padStart(6)} ` +
      `(${stockDiff > 0 ? "+" : ""}${stockDiff})  [${flagMissing}]`
    );
    if (r.missing.length) {
      console.log(`         MISSING (${r.missing.length}): ${r.missing.join(", ")}`);
      // For each missing row, show the partner's count as a candidate.
      const hints = r.missing.map((l) => {
        const n = parseInt(l, 10);
        const half = l.slice(-1);
        const partner = r.byBase[n] && r.byBase[n][half === "A" ? "B" : "A"];
        return partner !== undefined ? `${l}~${partner}` : `${l}~?`;
      });
      console.log(`         partner count: ${hints.join("  ")}`);
      const cand = r.missing.map((l) => {
        const n = parseInt(l, 10);
        const half = l.slice(-1);
        const p = r.byBase[n] && r.byBase[n][half === "A" ? "B" : "A"];
        return p || 0;
      });
      console.log(`         if partner-matched, sum would gain +${cand.reduce((a, c) => a + c, 0)} -> ${r.sum + cand.reduce((a, c) => a + c, 0)}`);
    }
    if (r.dupeList.length) console.log(`         DUPES: ${r.dupeList.join(", ")}`);
    if (r.malformed) console.log(`         MALFORMED: ${r.malformed}`);
    if (r.extraBases.length) console.log(`         BASES BEYOND total_rows: ${r.extraBases.join(", ")}`);
    if (r.zeroStockRows) console.log(`         ZERO-STOCK ROWS: ${r.zeroStockRows}`);
  });

  console.log(`\n=== SUMMARY ===`);
  console.log(`  blocks total:              ${report.length}`);
  console.log(`  blocks with missing rows:  ${blocksWithMissing}`);
  console.log(`  blocks with stock gap:     ${blocksWithStockGap}`);
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });