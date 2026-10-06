// Export one block as JSON for manual review/comparison.
// Read-only. Writes exports/<block>-<db>.json
//
// Usage: node scripts/export-block-json.js <dbName> "Block 12"
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const OUT_DIR = path.join(__dirname, "..", "exports");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  const dbName = process.argv[2];
  const target = process.argv[3];
  if (!dbName || !target) {
    console.error('usage: node scripts/export-block-json.js <dbName> "Block 12"');
    process.exit(1);
  }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" }).asPromise();
  const doc = await conn.db.collection("blocks").findOne({ block_name: target });
  if (!doc) throw new Error(target + " not found in " + dbName);
  await conn.close();

  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  const baseMap = {};
  const forSort = [];
  for (const r of rows) {
    const m = /^(\d+)([AB])$/.exec(String(r.row_number));
    if (!m) { forSort.push({ row_number: String(r.row_number), malformed: true, stock_count: r.stock_count }); continue; }
    const n = Number(m[1]);
    (baseMap[n] = baseMap[n] || {})[m[2]] = {
      row_number: String(r.row_number),
      stock_count: Number(r.stock_count) || 0,
      worker_name: r.worker_name || "",
      remaining_stock_count: r.remaining_stock_count === undefined ? null : r.remaining_stock_count,
    };
  }

  const declared = Number(doc.total_rows) || 0;
  const bases = [];
  let sum = 0;
  const missing = [];
  const mismatched = [];
  for (let i = 1; i <= declared; i++) {
    const e = baseMap[i] || {};
    const a = e.A || null;
    const b = e.B || null;
    const av = a ? a.stock_count : null;
    const bv = b ? b.stock_count : null;
    const pair = (av || 0) + (bv || 0);
    sum += pair;
    if (!a) missing.push(i + "A");
    if (!b) missing.push(i + "B");
    if (a && b && av !== bv) mismatched.push({ base: i, A: av, B: bv, diff: av - bv });
    bases.push({
      base: i,
      A: a ? a.stock_count : null,
      B: b ? b.stock_count : null,
      pair_sum: pair,
      status: !a || !b ? "MISSING" : av !== bv ? "A/B MISMATCH" : "ok",
      A_worker: a ? a.worker_name : null,
      B_worker: b ? b.worker_name : null,
    });
  }

  const out = {
    exported_at: new Date().toISOString(),
    database: dbName,
    block_name: doc.block_name,
    variety: doc.variety,
    year_planted: doc.year_planted,
    rootstock: doc.rootstock,
    size_ha: doc.size_ha,
    __v: doc.__v,
    summary: {
      declared_total_stocks: Number(doc.total_stocks) || 0,
      declared_total_rows: declared,
      row_count: rows.length,
      expected_row_count: declared * 2,
      rows_sum: sum,
      gap_rows_sum_minus_total_stocks: sum - (Number(doc.total_stocks) || 0),
      vines_per_ha_declared: Number(doc.size_ha) ? Math.round((Number(doc.total_stocks) / Number(doc.size_ha)) * 10) / 10 : null,
      vines_per_ha_rows: Number(doc.size_ha) ? Math.round((sum / Number(doc.size_ha)) * 10) / 10 : null,
      missing_labels: missing,
      a_b_mismatches: mismatched,
      malformed_rows: forSort,
    },
    bases: bases,
    bases_compact: bases.map((b) => [b.base, b.A, b.B]),
    rows_raw: rows.map((r) => ({ row_number: String(r.row_number), stock_count: r.stock_count, worker_name: r.worker_name || "", remaining_stock_count: r.remaining_stock_count })),
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, doc.block_name.replace(/\s+/g, "").toLowerCase() + "-" + dbName + ".json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log("wrote " + file + " (" + fs.statSync(file).size + " bytes)");
  console.log("rows " + out.summary.row_count + "/" + out.summary.expected_row_count +
    "  sum " + sum + "  total_stocks " + out.summary.declared_total_stocks +
    "  gap " + out.summary.gap_rows_sum_minus_total_stocks +
    "  missing " + (missing.length || "none") + "  mismatch " + (mismatched.length || "none"));
})().catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });
