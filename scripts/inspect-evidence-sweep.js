// Read-only: broad evidence sweep. For every collection, report doc count and
// how many docs mention "Block 15" / "Block 9" anywhere in the document.
// No writes.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

const NEEDLES = ["Block 15", "Block 9"];

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-evidence-sweep.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const db = conn.db;
  const cols = await db.listCollections().toArray();

  for (const c of cols) {
    const total = await db.collection(c.name).countDocuments();
    const line = [`${c.name}`.padEnd(26), `docs=${total}`.padEnd(10)];
    // Client-side scan: $where is blocked on this Atlas tier. Counts are small
    // enough in this database to walk each collection once.
    const hits = Object.fromEntries(NEEDLES.map((n) => [n, 0]));
    if (total > 0) {
      const cursor = db.collection(c.name).find({});
      for await (const doc of cursor) {
        const s = JSON.stringify(doc);
        for (const needle of NEEDLES) if (s.includes(needle)) hits[needle]++;
      }
    }
    NEEDLES.forEach((needle) => line.push(`${needle}=${hits[needle]}`));
    console.log(line.join("  "));
  }

  // workeractivities + rows are the two that could hold per-row history.
  for (const name of ["workeractivities", "rows", "stocks", "bunches"]) {
    if (!cols.some((c) => c.name === name)) continue;
    console.log("\n" + "=".repeat(66));
    console.log(`sample of "${name}"`);
    const docs = await db.collection(name).find({}).limit(3).toArray();
    docs.forEach((d, i) => console.log(`  [${i}] ${JSON.stringify(d).slice(0, 400)}`));
    if (!docs.length) console.log("  (empty)");
  }

  console.log("\n" + "=".repeat(66));
  console.log("pieceworkworkers: total docs and any rows referencing our blocks");
  const pw = await db.collection("pieceworkworkers").countDocuments();
  console.log(`  pieceworkworkers count=${pw}`);
  if (pw) {
    const all = await db.collection("pieceworkworkers").find({}).limit(5).toArray();
    all.forEach((d, i) => console.log(`  [${i}] workerID=${d.workerID} blocks=${JSON.stringify((d.blocks || []).map((b) => b.block_name))}`));
  }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });