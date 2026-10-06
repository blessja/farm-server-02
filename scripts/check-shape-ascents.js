require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  const conn = await mongoose.createConnection(uriFor(process.argv[2]), { readPreference: "primary" }).asPromise();
  const blocks = await conn.db.collection("blocks").find({}, { projection: { block_name: 1, rows: 1, __v: 1 } }).sort({ block_name: 1 }).toArray();

  for (const b of blocks) {
    const A = {};
    for (const r of b.rows) {
      const m = /^(\d+)A$/.exec(String(r.row_number));
      if (m) A[Number(m[1])] = Number(r.stock_count) || 0;
    }
    const keys = Object.keys(A).map(Number).sort((x, y) => x - y);
    let best = [], cur = [];
    for (const k of keys) {
      if (!cur.length || A[k] > A[cur[cur.length - 1]]) cur.push(k);
      else { if (cur.length > best.length) best = cur; cur = [k]; }
    }
    if (cur.length > best.length) best = cur;
    // smoothness: count of strict descents vs ascents along consecutive bases
    let asc = 0, desc = 0;
    for (let i = 1; i < keys.length; i++) {
      const d = A[keys[i]] - A[keys[i - 1]];
      if (d > 0) asc++; else if (d < 0) desc++;
    }
    console.log(
      b.block_name.padEnd(9) +
      ` __v=${String(b.__v).padStart(4)}` +
      ` ascents=${String(asc).padStart(3)} descents=${String(desc).padStart(3)}` +
      ` longestASC=${best.length} bases=[${best.slice(0, 14).join(",")}] vals=[${best.slice(0, 14).map((k) => A[k]).join(",")}]`
    );
  }
  await conn.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
