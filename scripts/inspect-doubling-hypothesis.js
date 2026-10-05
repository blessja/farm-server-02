// Read-only confirmation of the doubling hypothesis, plus the downstream
// impact. Two questions:
//
//  1. Was total_stocks written BEFORE rows were split into A/B halves?
//     A pre-split block had one entry per base row, so its total_stocks would
//     equal the per-half sum. If so, blocks whose total_stocks still sits at
//     the per-half value are leftovers that were never doubled.
//
//  2. What does the app actually return for a block whose total_stocks and row
//     sum disagree? getRemainingStocks computes total_stocks - sum(rows).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function halvesOf(rows) {
  const h = {};
  rows.forEach((r) => {
    const m = /^(\d+)([AB])$/.exec(String(r.row_number));
    if (!m) return;
    h[m[1]] = h[m[1]] || {};
    h[m[1]][m[2]] = Number(r.stock_count) || 0;
  });
  return h;
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-doubling-hypothesis.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const db = conn.db;
  const all = await db.collection("blocks").find({}).toArray();

  // --- 1. the legacy doc is the direct witness ---
  const legacy = await db.collection("rows").find({}).toArray();
  console.log("WITNESS: legacy pre-split document in the `rows` collection");
  legacy.forEach((d) => {
    const name = String(d.block_name).replace(/^Blok\s*/i, "Block ");
    const modern = all.find((b) => b.block_name === name);
    const h = halvesOf(modern ? modern.rows : []);
    let a = 0;
    Object.values(h).forEach((p) => { a += p.A || 0; });
    console.log(`  legacy block_name=${JSON.stringify(d.block_name)} declared total_stocks=${d.total_stocks}`);
    console.log(`  modern ${name} total_stocks=${modern.total_stocks}`);
    console.log(`  modern per-half (A) sum=${a}`);
    console.log(`  legacy declared total_stocks == modern per-half sum ? ${d.total_stocks === a ? "YES - exact" : "no"}`);
    console.log(`  modern total_stocks == 2 x per-half sum ? ${modern.total_stocks === a * 2 ? "YES - exact" : `no (${modern.total_stocks} vs ${a * 2}, diff ${modern.total_stocks - a * 2})`}`);
  });

  // --- 2. classify every block: is total_stocks pre-split or doubled? ---
  console.log("\n" + "=".repeat(72));
  console.log("CLASSIFICATION: which unit is total_stocks in?");
  console.log("block".padEnd(9), "perHalf".padEnd(9), "combined".padEnd(10),
    "total_stocks".padEnd(13), "ts-perHalf".padEnd(11), "ts-combined".padEnd(13),
    "missing".padEnd(8), "verdict");
  const verdicts = {};
  all.forEach((b) => {
    const h = halvesOf(b.rows || []);
    let a = 0, bb = 0, bases = 0;
    Object.values(h).forEach((p) => {
      bases++;
      if (p.A != null) a += p.A;
      if (p.B != null) bb += p.B;
    });
    const comb = a + bb;
    const ts = Number(b.total_stocks) || 0;
    const missing = (Number(b.total_rows) || 0) * 2 - (b.rows || []).length;
    // Pre-split total_stocks would be between perHalf and combined depending
    // on how much work has been done, so use the ratio to the combined sum.
    const ratio = comb ? ts / comb : 0;
    let verdict;
    if (!comb) verdict = "rows empty";
    else if (missing > 0) verdict = "missing rows, ambiguous";
    else if (ratio > 0.8) verdict = "DOUBLED";
    else if (ratio > 0.4 && ratio < 0.6) verdict = "PRE-SPLIT (never doubled)";
    else verdict = "other";
    verdicts[b.block_name] = verdict;
    console.log(
      String(b.block_name).padEnd(9), String(a).padEnd(9), String(comb).padEnd(10),
      String(ts).padEnd(13), String(ts - a).padEnd(11), String(ts - comb).padEnd(13),
      String(missing).padEnd(8), verdict
    );
  });

  // --- 3. downstream impact of getRemainingStocks ---
  console.log("\n" + "=".repeat(72));
  console.log("getRemainingStocks() returns total_stocks - sum(rows.stock_count):");
  all.forEach((b) => {
    const rows = b.rows || [];
    const sum = rows.reduce((acc, r) => acc + (Number(r.stock_count) || 0), 0);
    const rem = (Number(b.total_stocks) || 0) - sum;
    const bad = rem < 0 ? "  <-- NEGATIVE, app shows nonsense" : "";
    console.log(`  ${String(b.block_name).padEnd(9)} total_stocks=${String(b.total_stocks).padEnd(7)} sum=${String(sum).padEnd(7)} remaining=${String(rem).padStart(7)}${bad}`);
  });

  // --- 4. Block 15 density test: is 6284 pre-split or doubled? ---
  console.log("\n" + "=".repeat(72));
  console.log("BLOCK 15: which reading of 6284 is consistent with the farm?");
  const b15 = all.find((b) => b.block_name === "Block 15");
  const dens = all
    .filter((b) => b.block_name !== "Block 15" && verdicts[b.block_name] === "DOUBLED" && b.size_ha)
    .map((b) => ({ n: b.block_name, d: b.total_stocks / b.size_ha }))
    .sort((x, y) => x.d - y.d);
  console.log(`  known-doubled blocks, stocks/ha: ${dens.map((x) => `${x.n}=${x.d.toFixed(0)}`).join(", ")}`);
  const lo = dens[0].d, hi = dens[dens.length - 1].d;
  console.log(`  range across those: ${lo.toFixed(0)} .. ${hi.toFixed(0)} /ha`);
  console.log(`  Block 15 size_ha=${b15.size_ha}, declared 6284`);
  console.log(`    if 6284 is DOUBLED  -> ${(6284 / b15.size_ha).toFixed(0)}/ha  ` +
    `${(6284 / b15.size_ha) >= lo * 0.9 && (6284 / b15.size_ha) <= hi * 1.1 ? "IN RANGE" : "out of range"}`);
  console.log(`    if 6284 is PRE-SPLIT -> ${(6284 / 2 / b15.size_ha).toFixed(0)}/ha  ` +
    `${(6284 / 2 / b15.size_ha) >= lo * 0.9 && (6284 / 2 / b15.size_ha) <= hi * 1.1 ? "IN RANGE" : "OUT OF RANGE"}`);
  console.log(`  per-base avg if doubled: ${(6284 / 2 / b15.total_rows).toFixed(1)}`);
  console.log(`  per-base avg for comparison: Block 9 = ${(all.find((b) => b.block_name === "Block 9").total_stocks / all.find((b) => b.block_name === "Block 9").total_rows).toFixed(1)} (pre-split reading)`);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });