// Read-only forensics on Block 15 (all-zero stock_count) and Block 9
// (total_stocks far below row sum). No writes, no repair logic.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function halves(rows) {
  const out = {};
  rows.forEach((r) => {
    const m = /^(\d+)([AB])$/.exec(String(r.row_number));
    if (!m) return;
    out[m[1]] = out[m[1]] || {};
    out[m[1]][m[2]] = r;
  });
  return out;
}

function showRow(label, r) {
  if (!r) return `${label}: <absent>`;
  const jobs = Array.isArray(r.active_jobs) ? r.active_jobs : [];
  return [
    `${label}: stock_count=${JSON.stringify(r.stock_count)}`,
    `bunches=${JSON.stringify(r.bunches)}`,
    `remaining=${JSON.stringify(r.remaining_stock_count)}`,
    `worker_id=${JSON.stringify(r.worker_id)}`,
    `worker_name=${JSON.stringify(r.worker_name)}`,
    `job_type=${JSON.stringify(r.job_type)}`,
    `start_time=${JSON.stringify(r.start_time)}`,
    `time_spent=${JSON.stringify(r.time_spent)}`,
    `checkin_by=${JSON.stringify(r.checkin_recorded_by)}`,
    `active_jobs=${jobs.length ? JSON.stringify(jobs) : "[]"}`,
    `has_id=${!!r._id}`,
  ].join("  ");
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-block-anomalies.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  const all = await coll.find({}).toArray();

  // ---- sibling context: same variety / year as 15 and 9, for comparison ----
  console.log("=".repeat(70));
  console.log("ALL BLOCKS AT A GLANCE");
  console.log("block".padEnd(10), "variety".padEnd(20), "yr".padEnd(5),
    "decl_rows".padEnd(10), "len(rows)".padEnd(9), "total_stocks".padEnd(13),
    "sum".padEnd(7), "diff".padEnd(8), "zeroRows");
  all.forEach((b) => {
    const rows = b.rows || [];
    const sum = rows.reduce((a, r) => a + (Number(r.stock_count) || 0), 0);
    const zeros = rows.filter((r) => !(Number(r.stock_count) > 0)).length;
    console.log(
      String(b.block_name).padEnd(10),
      String(b.variety).padEnd(20),
      String(b.year_planted).padEnd(5),
      String(b.total_rows).padEnd(10),
      String(rows.length).padEnd(9),
      String(b.total_stocks).padEnd(13),
      String(sum).padEnd(7),
      String((b.total_stocks || 0) - sum).padEnd(8),
      zeros ? `${zeros}/${rows.length}` : "0"
    );
  });

  // ---- Block 15 ----
  const b15 = all.find((b) => b.block_name === "Block 15");
  console.log("\n" + "=".repeat(70));
  console.log("BLOCK 15 — full document keys");
  console.log(Object.keys(b15).join(", "));
  console.log("metadata:", JSON.stringify({
    block_name: b15.block_name, variety: b15.variety, year_planted: b15.year_planted,
    rootstock: b15.rootstock, total_stocks: b15.total_stocks, total_rows: b15.total_rows,
    size_ha: b15.size_ha,
  }));

  const r15 = b15.rows || [];
  console.log(`\nrows=${r15.length}  total_rows=${b15.total_rows}`);
  console.log(`if 6284 were spread over ${r15.length} rows, avg = ${(6284 / r15.length).toFixed(2)}`);
  console.log(`if 6284 were spread over ${b15.total_rows} base rows (2 halves each), avg per row entry = ${(6284 / (b15.total_rows * 2)).toFixed(2)}`);

  // Every distinct shape of a row subdocument in 15.
  const shapes = {};
  r15.forEach((r) => { const k = Object.keys(r).sort().join(","); shapes[k] = (shapes[k] || 0) + 1; });
  console.log("\ndistinct row subdocument key-shapes in Block 15:");
  Object.entries(shapes).forEach(([k, n]) => console.log(`  ${n}x  {${k}}`));

  console.log("\nsample rows from Block 15:");
  ["1A", "1B", "2A", "30A", "59A", "59B"].forEach((l) =>
    console.log("  " + showRow(l, r15.find((r) => r.row_number === l)))
  );

  // Compare against the closest sibling: same variety, or same year, whichever exists.
  const sibs = all.filter((b) => b.block_name !== "Block 15" &&
    (b.variety === b15.variety || b.year_planted === b15.year_planted));
  console.log(`\nsibling blocks (same variety or same year as 15): ${sibs.map((b) => b.block_name).join(", ") || "none"}`);
  sibs.forEach((b) => {
    const rows = b.rows || [];
    const sum = rows.reduce((a, r) => a + (Number(r.stock_count) || 0), 0);
    console.log(`  ${b.block_name}: variety=${b.variety} yr=${b.year_planted} rows=${rows.length} ` +
      `total_stocks=${b.total_stocks} sum=${sum} avg=${(sum / (rows.length || 1)).toFixed(2)} size_ha=${b.size_ha}`);
    const s = rows.find((r) => r.worker_id);
    console.log("     a row that has worker activity: " + showRow(s ? s.row_number : "none", s));
  });

  // ---- Block 9 ----
  const b9 = all.find((b) => b.block_name === "Block 9");
  console.log("\n" + "=".repeat(70));
  console.log("BLOCK 9");
  console.log(Object.keys(b9).join(", "));
  console.log("metadata:", JSON.stringify({
    block_name: b9.block_name, variety: b9.variety, year_planted: b9.year_planted,
    rootstock: b9.rootstock, total_stocks: b9.total_stocks, total_rows: b9.total_rows,
    size_ha: b9.size_ha,
  }));
  const r9 = b9.rows || [];
  const h9 = halves(r9);
  let aSum = 0, bSum = 0;
  Object.values(h9).forEach((p) => {
    if (p.A) aSum += Number(p.A.stock_count) || 0;
    if (p.B) bSum += Number(p.B.stock_count) || 0;
  });
  const sum9 = aSum + bSum;
  console.log(`rows=${r9.length}  A-half sum=${aSum}  B-half sum=${bSum}  combined=${sum9}`);
  console.log(`total_stocks=${b9.total_stocks}`);
  console.log(`  vs A-sum only:  ${b9.total_stocks - aSum}`);
  console.log(`  vs B-sum only:  ${b9.total_stocks - bSum}`);
  console.log(`  vs combined:    ${b9.total_stocks - sum9}`);
  console.log(`  combined/2 = ${(sum9 / 2).toFixed(1)}   2*total_stocks = ${b9.total_stocks * 2}`);
  console.log(`  if 3A were 66 (matching 3B), combined would be ${sum9 - 23 + 66} (diff vs 2x total_stocks = ${2 * b9.total_stocks - (sum9 - 23 + 66)})`);

  console.log("\nbase-3 rows verbatim:");
  console.log("  " + showRow("3A", h9["3"] && h9["3"].A));
  console.log("  " + showRow("3B", h9["3"] && h9["3"].B));
  console.log("\nneighbours of base 3 for comparison:");
  ["1", "2", "4", "5"].forEach((n) => {
    console.log("  " + showRow(n + "A", h9[n] && h9[n].A));
    console.log("  " + showRow(n + "B", h9[n] && h9[n].B));
  });

  // Does the per-base combined sum follow a smooth taper? That tells us if
  // total_stocks was ever in the same units as the rows.
  console.log("\nper-base combined stock, first 12 bases:");
  const bases = Object.keys(h9).map(Number).sort((x, y) => x - y);
  bases.slice(0, 12).forEach((n) => {
    const p = h9[n];
    console.log(`  base ${n}: A=${p.A ? p.A.stock_count : "-"} B=${p.B ? p.B.stock_count : "-"} ` +
      `combined=${(Number(p.A && p.A.stock_count) || 0) + (Number(p.B && p.B.stock_count) || 0)}`);
  });
  const combinedPerBase = bases.map((n) => (Number(h9[n].A && h9[n].A.stock_count) || 0) + (Number(h9[n].B && h9[n].B.stock_count) || 0));
  console.log(`per-base combined: min=${Math.min(...combinedPerBase)} max=${Math.max(...combinedPerBase)} avg=${(combinedPerBase.reduce((a, c) => a + c, 0) / combinedPerBase.length).toFixed(1)}`);
  console.log(`total_stocks / bases = ${(b9.total_stocks / bases.length).toFixed(1)}  <-- compare to that avg`);

  // Storage order vs sorted order, to see if 3A was edited in place.
  console.log("\nBlock 9 rows in STORAGE order (first 10):");
  r9.slice(0, 10).forEach((r, i) => console.log(`  [${i}] ${r.row_number} = ${JSON.stringify(r.stock_count)}`));

  // Any worker activity at all in 9 and 15?
  const act = (rows) => rows.filter((r) => (r.worker_id || (Array.isArray(r.active_jobs) && r.active_jobs.length) || r.job_type)).length;
  console.log(`\nrows showing worker activity: Block 15 = ${act(r15)}/${r15.length}, Block 9 = ${act(r9)}/${r9.length}`);
  console.log(`rows with remaining_stock_count != null: Block 15 = ${r15.filter((r) => r.remaining_stock_count != null).length}, Block 9 = ${r9.filter((r) => r.remaining_stock_count != null).length}`);
  console.log(`rows with bunches > 0: Block 15 = ${r15.filter((r) => (Number(r.bunches) || 0) > 0).length}, Block 9 = ${r9.filter((r) => (Number(r.bunches) || 0) > 0).length}`);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });