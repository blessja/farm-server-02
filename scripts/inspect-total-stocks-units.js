// Read-only: figure out the unit convention for total_stocks across all
// blocks. For each block compare total_stocks against the A-half sum, the
// B-half sum, the combined sum, and count how many A/B pairs are identical.
// No writes.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-total-stocks-units.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const all = await conn.db.collection("blocks").find({}).toArray();

  console.log("block".padEnd(10), "A".padEnd(7), "B".padEnd(7), "comb".padEnd(7),
    "total_stocks".padEnd(13), "==A".padEnd(5), "==B".padEnd(5), "==comb".padEnd(7),
    "pairsAeqB".padEnd(10), "pairPct");
  for (const b of all) {
    const h = {};
    (b.rows || []).forEach((r) => {
      const m = /^(\d+)([AB])$/.exec(String(r.row_number));
      if (!m) return;
      h[m[1]] = h[m[1]] || {};
      h[m[1]][m[2]] = Number(r.stock_count) || 0;
    });
    const pairs = Object.values(h);
    let a = 0, bsum = 0, eq = 0, both = 0;
    pairs.forEach((p) => {
      a += p.A || 0;
      bsum += p.B || 0;
      if (p.A != null && p.B != null) { both++; if (p.A === p.B) eq++; }
    });
    const comb = a + bsum;
    const ts = Number(b.total_stocks) || 0;
    const pct = both ? ((eq / both) * 100).toFixed(0) : "-";
    console.log(
      String(b.block_name).padEnd(10),
      String(a).padEnd(7), String(bsum).padEnd(7), String(comb).padEnd(7),
      String(ts).padEnd(13),
      (ts === a ? "YES" : "-").padEnd(5),
      (ts === bsum ? "YES" : "-").padEnd(5),
      (ts === comb ? "YES" : "-").padEnd(7),
      `${eq}/${both}`.padEnd(10),
      pct + "%"
    );
  }

  // For the "total_stocks == one half" blocks, is the matching half the same
  // half everywhere, or does it switch? And is 3A in Block 9 the only break?
  const b9 = all.find((x) => x.block_name === "Block 9");
  if (b9) {
    const h = {};
    (b9.rows || []).forEach((r) => {
      const m = /^(\d+)([AB])$/.exec(String(r.row_number));
      if (!m) return;
      h[m[1]] = h[m[1]] || {};
      h[m[1]][m[2]] = Number(r.stock_count) || 0;
    });
    const diffs = Object.keys(h).filter((n) => h[n].A != null && h[n].B != null && h[n].A !== h[n].B)
      .sort((x, y) => x - y);
    console.log(`\nBlock 9 mismatched bases: ${diffs.join(", ") || "none"}`);
    diffs.forEach((n) => console.log(`  base ${n}: A=${h[n].A} B=${h[n].B}  A-B=${h[n].A - h[n].B}`));
    const aEx = a => a; void aEx;
    const sumIfAeqB = Object.keys(h).reduce((acc, n) =>
      acc + (h[n].B != null ? h[n].B * 2 : 0), 0);
    console.log(`Block 9 sum if every A mirrored its B: ${sumIfAeqB}  (2 * total_stocks = ${2 * b9.total_stocks})`);
    console.log(`Block 9 A-sum if every A mirrored its B: ${sumIfAeqB / 2}  (total_stocks = ${b9.total_stocks})`);
  }

  // Whether the *lower* half count in Block 15's neighbours suggests a taper.
  const b15 = all.find((x) => x.block_name === "Block 15");
  if (b15) {
    console.log(`\nBlock 15 total_rows=${b15.total_rows} rows=${b15.rows.length} total_stocks=${b15.total_stocks}`);
    console.log(`  6284 / ${b15.total_rows} bases = ${(b15.total_stocks / b15.total_rows).toFixed(2)} per base`);
    console.log(`  6284 / ${b15.rows.length} halves = ${(b15.total_stocks / b15.rows.length).toFixed(2)} per half`);
    const b9d = all.find((x) => x.block_name === "Block 9");
    console.log(`  Block 9 for scale: ${b9d.total_stocks} over ${b9d.total_rows} bases = ${(b9d.total_stocks / b9d.total_rows).toFixed(2)} per base, size_ha=${b9d.size_ha}`);
    console.log(`  Block 15 size_ha=${b15.size_ha}, year=${b15.year_planted}, variety=${b15.variety}`);
    const dens = all.map((x) => ({ n: x.block_name, s: x.size_ha, t: x.total_stocks, d: x.size_ha ? x.total_stocks / x.size_ha : 0 }))
      .sort((p, q) => q.d - p.d);
    console.log("\n  stocks per hectare, all blocks:");
    dens.forEach((d) => console.log(`    ${d.n}: ${d.t}/${d.s}ha = ${d.d.toFixed(0)}/ha`));
  }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });