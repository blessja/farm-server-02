require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const target = process.argv[3] || "Block 12";

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  const conn = await mongoose.createConnection(uriFor(process.argv[2]), { readPreference: "primary" }).asPromise();
  const b = await conn.db.collection("blocks").findOne({ block_name: target });
  const A = {}, B = {};
  for (const r of b.rows) {
    const m = /^(\d+)([AB])$/.exec(String(r.row_number));
    if (!m) continue;
    (m[2] === "A" ? A : B)[Number(m[1])] = Number(r.stock_count) || 0;
  }
  const bases = Object.keys(A).concat(Object.keys(B)).map(Number);
  const hi = Math.max(...bases);
  console.log(`${target}  total_rows=${b.total_rows} total_stocks=${b.total_stocks}`);
  console.log("base   A    B   pair  note");
  let tot = 0;
  for (let i = 1; i <= hi; i++) {
    const a = A[i], c = B[i];
    const ps = (a || 0) + (c || 0);
    tot += ps;
    let note = "";
    if (a === undefined || c === undefined) note = "  MISSING SIDE";
    else if (a !== c) note = "  A/B DIFF";
    else if (i > 1 && i < hi) {
      const pa = A[i - 1], na = A[i + 1];
      if (pa !== undefined && na !== undefined) {
        const exp = (pa + na) / 2;
        const dev = a - exp;
        if (Math.abs(dev) >= 3) note = `  dev ${dev > 0 ? "+" : ""}${dev.toFixed(1)} vs neighbours`;
      }
    }
    console.log(String(i).padStart(4) + String(a).padStart(6) + String(c).padStart(5) + String(ps).padStart(6) + note);
  }
  console.log("sum    " + tot);
  await conn.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
