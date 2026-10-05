// Read-only: pin down the two open questions from the Block 15 / Block 9
// investigation, and check the operational impact in the check-out path.
//
//  A. Block 15: is stock_count a real 0 or an absent value? And is bunches
//     present at all (check-out divides by it)?
//  B. Block 9 base 3: which of 3A=23 / 3B=66 fits the taper, and what does each
//     choice imply for total_stocks?
//  C. What the app does when a worker checks out of a Block 15 row.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-block15-9-final.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const db = conn.db;
  const all = await db.collection("blocks").find({}).toArray();

  // ---------- A. Block 15 field-level ----------
  const b15 = all.find((b) => b.block_name === "Block 15");
  console.log("A. BLOCK 15 — raw BSON types");
  const types = {};
  (b15.rows || []).forEach((r) => {
    Object.keys(r).forEach((k) => {
      const t = r[k] === null ? "null" : Array.isArray(r[k]) ? "array" : typeof r[k];
      types[k] = types[k] || {};
      types[k][t] = (types[k][t] || 0) + 1;
    });
  });
  Object.entries(types).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(24)} ${Object.entries(v).map(([t, n]) => `${t}=${n}`).join("  ")}`));
  console.log(`\n  distinct stock_count values: ${[...new Set((b15.rows || []).map((r) => JSON.stringify(r.stock_count)))].join(", ")}`);
  console.log(`  distinct bunches values:      ${[...new Set((b15.rows || []).map((r) => JSON.stringify(r.bunches)))].join(", ")}`);
  console.log(`  distinct remaining_stock_count: ${[...new Set((b15.rows || []).map((r) => JSON.stringify(r.remaining_stock_count)))].join(", ")}`);

  // Same fingerprint on a healthy block, for comparison.
  const b17 = all.find((b) => b.block_name === "Block 17");
  console.log(`\n  Block 17 for comparison (healthy):`);
  console.log(`    distinct stock_count: ${[...new Set(b17.rows.map((r) => JSON.stringify(r.stock_count)))].slice(0, 8).join(", ")} ...`);
  console.log(`    distinct bunches:    ${[...new Set(b17.rows.map((r) => JSON.stringify(r.bunches)))].join(", ")}`);
  console.log(`    has bunches key:     ${b17.rows.filter((r) => "bunches" in r).length}/${b17.rows.length}`);

  // ---------- B. Block 9 base 3 ----------
  const b9 = all.find((b) => b.block_name === "Block 9");
  const h = {};
  (b9.rows || []).forEach((r) => {
    const m = /^(\d+)([AB])$/.exec(String(r.row_number));
    if (!m) return;
    h[m[1]] = h[m[1]] || {};
    h[m[1]][m[2]] = Number(r.stock_count) || 0;
  });
  const bases = Object.keys(h).map(Number).sort((x, y) => x - y);
  const val = (n) => (h[n].A === h[n].B ? h[n].A : null);

  console.log("\nB. BLOCK 9 — is the row-length taper symmetric?");
  console.log("   base   A     B    pair   mirror(base 43-n)");
  bases.forEach((n) => {
    const mirror = 43 - n;
    const mv = h[mirror] ? val(mirror) : null;
    const p = val(n);
    console.log(`  ${String(n).padStart(5)} ${String(h[n].A).padStart(4)} ${String(h[n].B).padStart(5)} ` +
      `${String(p === null ? "MISMATCH" : p).padStart(7)}   ${mv === null ? "-" : mv}`);
  });

  const diffs = bases.filter((n) => h[n].A !== h[n].B);
  console.log(`\n  mismatched bases: ${diffs.join(", ") || "none"}`);
  const aSum = bases.reduce((a, n) => a + h[n].A, 0);
  const bSum = bases.reduce((a, n) => a + h[n].B, 0);
  console.log(`  A-sum=${aSum}  B-sum=${bSum}  combined=${aSum + bSum}  total_stocks=${b9.total_stocks}`);
  console.log(`  B-sum == total_stocks ? ${bSum === b9.total_stocks ? "YES, exact" : "no, off " + (b9.total_stocks - bSum)}`);
  console.log(`  A-sum == total_stocks ? ${aSum === b9.total_stocks ? "YES, exact" : "no, off " + (b9.total_stocks - aSum)}`);

  const v23 = aSum - 23 + 66, v66 = aSum + 66 - 23; // placeholder, recompute below
  void v23; void v66;
  const combinedIf3A66 = bSum + aSum - 23 + 66;
  const combinedIf3A23 = bSum + aSum;
  console.log(`  if 3A = 66 (match B): A-sum=${aSum - 23 + 66}, combined=${combinedIf3A66}, ` +
    `2*total_stocks=${2 * b9.total_stocks} -> ${combinedIf3A66 === 2 * b9.total_stocks ? "EXACTLY 2x total_stocks" : "diff " + (2 * b9.total_stocks - combinedIf3A66)}`);
  console.log(`  if 3A = 23 (keep A):  A-sum=${aSum}, combined=${combinedIf3A23}, ` +
    `${combinedIf3A23 === 2 * b9.total_stocks ? "EXACTLY 2x total_stocks" : "diff " + (2 * b9.total_stocks - combinedIf3A23)}`);

  // Extrapolate base 3 from the head ramp, ignoring 3A/3B.
  const head = [1, 2, 4, 5, 6].map((n) => val(n));
  console.log(`\n  head ramp 1,2,4,5,6 = ${head.join(", ")}`);
  const tailRamp = [39, 40, 41, 42].map((n) => val(n));
  console.log(`  tail ramp 39..42    = ${tailRamp.join(", ")} (decreasing toward the end)`);
  console.log(`  linear extrapolation of the head ramp to base 3: ~${head[0] + (head[1] - head[0]) / (2 - 1)}`);
  console.log(`  note the head ramp itself has a jump from base 2 to base 4, so base 3 is`);
  console.log(`  the transition point and the taper does not settle it either way.`);

  // ---------- C. check-out impact ----------
  console.log("\nC. CHECK-OUT IMPACT (workerController.checkOutWorkers)");
  console.log("   guard at line 87: `else if (stockCount > row.stock_count) -> 400`");
  [0, 1, 5, 50].forEach((sc) => {
    console.log(`   Block 15, worker reports ${String(sc).padStart(3)} done: stockCount > row.stock_count(0) ? ` +
      `${sc > 0 ? "YES -> HTTP 400 'Stock count exceeds available stocks'" : "no"}`);
  });
  console.log(`   avgBunchesPerStock = row.bunches / row.stock_count, guarded by stock_count > 0`);
  console.log(`   Block 15: stock_count=0 so the guard short-circuits to 0, bunchesWorked=0.`);
  console.log(`   A worker could never record work on any Block 15 row: 0 is the ceiling.`);
  const b1 = all.find((b) => b.block_name === "Block 1");
  console.log(`\n   Block 1 row 1A as a working example: stock_count=${b1.rows[0].stock_count}, bunches=${JSON.stringify(b1.rows[0].bunches)}`);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });