// Read-only: stock_count distribution for Block 17 + what closes the gap
// to the declared total_stocks (and to 11890).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function sortKey(label) {
  const m = /^(\d+)([AB]?)$/.exec(String(label));
  if (!m) return [Infinity, "Z"];
  return [Number(m[1]), m[2] === "A" ? 0 : m[2] === "B" ? 1 : 2];
}
function cmp(a, b) {
  const [na, sa] = sortKey(a);
  const [nb, sb] = sortKey(b);
  if (na !== nb) return na - nb;
  return sa - sb;
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");
  const doc = await coll.findOne({ block_name: "Block 17" });
  const rows = [...(doc.rows || [])].sort((a, b) => cmp(a.row_number, b.row_number));

  const sum = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
  console.log("=== Block 17 stock distribution (" + dbName + ") ===");
  console.log("  rows: " + rows.length);
  console.log("  stock sum: " + sum);
  console.log("  declared total_stocks: " + doc.total_stocks);
  console.log("  gap to declared: " + (doc.total_stocks - sum));
  console.log("  gap to 11890:    " + (11890 - sum));

  const dist = {};
  rows.forEach((r) => {
    const v = Number(r.stock_count) || 0;
    (dist[v] = dist[v] || []).push(r.row_number);
  });
  console.log("\n=== stock_count values, ascending ===");
  Object.keys(dist).map(Number).sort((a, b) => a - b).forEach((v) => {
    console.log(`  ${String(v).padStart(4)}  x${String(dist[v].length).padStart(3)}   ${dist[v].join(" ")}`);
  });

  console.log("\n=== rows NOT equal to 73 ===");
  rows.filter((r) => (Number(r.stock_count) || 0) !== 73).forEach((r) => {
    console.log(`  ${String(r.row_number).padStart(4)}  stock=${r.stock_count}`);
  });

  // Which pairs should be symmetric? A/B of the same base row often share a count.
  console.log("\n=== A/B pairs that differ ===");
  const byBase = {};
  rows.forEach((r) => {
    const b = parseInt(r.row_number, 10);
    byBase[b] = byBase[b] || {};
    byBase[b][r.row_number.slice(-1)] = r.stock_count;
  });
  Object.keys(byBase).map(Number).sort((a, b) => a - b).forEach((b) => {
    const p = byBase[b];
    if (p.A != null && p.B != null && p.A !== p.B) {
      console.log(`  base ${b}: ${p.A}A=${p.A} vs ${p.A}B=${p.B}  (diff ${p.B - p.A})`);
    }
  });

  // What single/two-row change closes each target gap?
  console.log("\n=== gap analysis ===");
  [doc.total_stocks, 11890].forEach((target) => {
    const gap = target - sum;
    console.log(`  target ${target}: gap ${gap}` +
      (gap <= 0 ? " (already met or exceeded)" : ` -> e.g. 2 rows of ${gap / 2}, or ${gap} on one row`));
  });

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });