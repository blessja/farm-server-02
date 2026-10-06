require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  const conn = await mongoose.createConnection(uriFor(process.argv[2]), { readPreference: "primary" }).asPromise();
  const blocks = await conn.db.collection("blocks").find({}).sort({ block_name: 1 }).toArray();
  console.log("block    size_ha  total_stocks   rowsSum   stocks/ha  rows/ha  total_rows");
  const dens = [];
  for (const b of blocks) {
    const s = (b.rows || []).reduce((a, r) => a + (Number(r.stock_count) || 0), 0);
    const ha = Number(b.size_ha) || 0;
    const d1 = ha ? b.total_stocks / ha : 0;
    const d2 = ha ? s / ha : 0;
    dens.push([b.block_name, d1, d2]);
    console.log(
      b.block_name.padEnd(9) +
      String(b.size_ha).padStart(8) +
      String(b.total_stocks).padStart(13) +
      String(s).padStart(10) +
      String(d1.toFixed(0)).padStart(11) +
      String(d2.toFixed(0)).padStart(9) +
      String(b.total_rows).padStart(12)
    );
  }
  const clean = dens.filter(([n, d]) => !["Block 12", "Block 13", "Block 15", "Block 9"].includes(n));
  const mean = clean.reduce((a, x) => a + x[1], 0) / clean.length;
  const sd = Math.sqrt(clean.reduce((a, x) => a + (x[1] - mean) ** 2, 0) / clean.length);
  console.log(`\ndeclared density across healthy blocks: mean ${mean.toFixed(0)}/ha  sd ${sd.toFixed(0)}`);
  for (const [n, d1, d2] of dens) {
    const z1 = (d1 - mean) / sd;
    console.log(`${n.padEnd(9)} declared z=${z1.toFixed(2).padStart(6)}   rowsSum z=${((d2 - mean) / sd).toFixed(2).padStart(6)}`);
  }
  await conn.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
