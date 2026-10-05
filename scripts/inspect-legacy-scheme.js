// Read-only: test the hypothesis that total_stocks was written BEFORE rows were
// split into A/B halves, i.e. it originally counted one entry per base row.
//
// There is a legacy `rows` collection holding a pre-split block document with
// integer row_numbers. If it lines up base-for-base with the A/B pairs in the
// `blocks` collection, the doubling hypothesis is confirmed and Block 9's
// total_stocks is simply an un-doubled leftover.
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
  if (!dbName) { console.error("usage: node inspect-legacy-scheme.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const db = conn.db;

  // --- the legacy doc ---
  const legacy = await db.collection("rows").find({}).toArray();
  console.log(`legacy "rows" collection: ${legacy.length} docs`);
  legacy.forEach((d) => {
    console.log(`  block_name=${JSON.stringify(d.block_name)} variety=${JSON.stringify(d.variety)} ` +
      `total_rows=${d.total_rows} total_stocks=${d.total_stocks} rows=${(d.rows || []).length}`);
    const nums = (d.rows || []).map((r) => r.row_number);
    console.log(`    row_number typeof: ${[...new Set(nums.map((n) => typeof n))].join(",")}`);
    const sum = (d.rows || []).reduce((a, r) => a + (Number(r.stock_count) || 0), 0);
    console.log(`    sum of stock_count = ${sum}   (declared total_stocks = ${d.total_stocks})  match=${sum === d.total_stocks}`);
  });

  // --- does it line up with the modern block? ---
  for (const d of legacy) {
    const modernName = String(d.block_name).replace(/^Blok\s*/i, "Block ");
    const modern = await db.collection("blocks").findOne({ block_name: modernName });
    console.log(`\nlegacy "${d.block_name}" vs modern "${modernName}": ${modern ? "found" : "NOT FOUND"}`);
    if (!modern) continue;

    const legacyRows = {};
    (d.rows || []).forEach((r) => { legacyRows[String(r.row_number)] = Number(r.stock_count) || 0; });
    const h = halvesOf(modern.rows || []);

    let match = 0, mismatch = 0, missingInLegacy = 0;
    const details = [];
    Object.keys(h).map(Number).sort((a, c) => a - c).forEach((n) => {
      const lv = legacyRows[String(n)];
      const pair = h[n];
      if (lv === undefined) { missingInLegacy++; return; }
      const a = pair.A, b = pair.B;
      if (lv === a && lv === b) match++;
      else { mismatch++; details.push(`base ${n}: legacy=${lv} A=${a} B=${b}`); }
    });
    console.log(`  bases where legacy value == both A and B: ${match}`);
    console.log(`  mismatched: ${mismatch}   absent from legacy: ${missingInLegacy}`);
    details.slice(0, 15).forEach((s) => console.log(`    ${s}`));
    if (details.length > 15) console.log(`    ... and ${details.length - 15} more`);

    const legacySum = (d.rows || []).reduce((a, r) => a + (Number(r.stock_count) || 0), 0);
    let aSum = 0, bSum = 0;
    Object.values(h).forEach((p) => { aSum += p.A || 0; bSum += p.B || 0; });
    console.log(`  legacy sum = ${legacySum}`);
    console.log(`  modern A-sum = ${aSum}, B-sum = ${bSum}, combined = ${aSum + bSum}`);
    console.log(`  modern total_stocks = ${modern.total_stocks}`);
    console.log(`  legacy sum vs A-sum: ${legacySum === aSum ? "EXACT" : legacySum - aSum}`);
    console.log(`  legacy sum x 2 = ${legacySum * 2}  vs combined ${aSum + bSum} (diff ${aSum + bSum - legacySum * 2})`);
    console.log(`  legacy sum x 2 = ${legacySum * 2}  vs total_stocks ${modern.total_stocks} (diff ${modern.total_stocks - legacySum * 2})`);
  }

  // --- the farm-wide test of the doubling hypothesis ---
  // For every block: is total_stocks closer to combined, or to half of combined?
  console.log("\n" + "=".repeat(66));
  console.log("DOES total_stocks TRACK combined (doubled) OR half (pre-split)?");
  console.log("block".padEnd(10), "combined".padEnd(10), "total_stocks".padEnd(13),
    "ts-combined".padEnd(13), "ts-half".padEnd(10), "verdict");
  const all = await db.collection("blocks").find({}).toArray();
  all.forEach((b) => {
    const h = halvesOf(b.rows || []);
    let a = 0, bb = 0;
    Object.values(h).forEach((p) => { a += p.A || 0; bb += p.B || 0; });
    const comb = a + bb;
    const ts = Number(b.total_stocks) || 0;
    const dComb = ts - comb;
    const dHalf = ts - comb / 2;
    // A block with rows still missing will read short either way; flag those.
    const expectedRows = (Number(b.total_rows) || 0) * 2;
    const rowShort = expectedRows - (b.rows || []).length;
    const verdict = rowShort > 0
      ? `rows missing (${rowShort}), can't tell`
      : Math.abs(dComb) <= Math.abs(dHalf) ? "doubled (combined)" : "PRE-SPLIT (half)";
    console.log(
      String(b.block_name).padEnd(10), String(comb).padEnd(10), String(ts).padEnd(13),
      String(dComb).padEnd(13), String(dHalf.toFixed(1)).padEnd(10), verdict
    );
  });

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });