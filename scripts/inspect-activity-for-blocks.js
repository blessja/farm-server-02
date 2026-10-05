// Read-only: does any other collection hold evidence of past activity on
// Block 15 or Block 9? Looks at PieceworkWorker blocks[] and WorkerActivity.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

const TARGETS = ["Block 15", "Block 9"];

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-activity-for-blocks.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const db = conn.db;

  console.log("collections in this database:");
  const cols = await db.listCollections().toArray();
  console.log("  " + cols.map((c) => c.name).join(", "));

  const targets = process.argv.slice(3);
  const names = targets.length ? targets : TARGETS;

  for (const name of names) {
    console.log("\n" + "=".repeat(66));
    console.log(`ACTIVITY EVIDENCE FOR ${name}`);

    // PieceworkWorker: per-worker per-block rows worked.
    if (cols.some((c) => c.name === "pieceworkworkers")) {
      const workers = await db.collection("pieceworkworkers").find({}).toArray();
      let hits = 0;
      workers.forEach((w) => {
        const blocks = Array.isArray(w.blocks) ? w.blocks : [];
        const b = blocks.find((x) => x.block_name === name);
        if (!b) return;
        hits++;
        const rows = Array.isArray(b.rows) ? b.rows : [];
        const total = rows.reduce((a, r) => a + (Number(r.stock_count) || 0), 0);
        const dates = rows.map((r) => r.date).filter(Boolean).map(String).sort();
        console.log(`  ${w.workerID || w.name}: ${rows.length} rows, stock_count sum=${total}` +
          (dates.length ? `, dates ${dates[0]} .. ${dates[dates.length - 1]}` : ", no dates"));
        console.log(`     labels: ${rows.slice(0, 12).map((r) => r.row_number).join(", ")}${rows.length > 12 ? " ..." : ""}`);
      });
      console.log(`  => ${hits} of ${workers.length} piecework workers have touched ${name}`);
    }

    // Any collection with a block_name field, generic sweep.
    for (const c of cols) {
      if (c.name === "blocks") continue;
      let n = 0;
      try {
        n = await db.collection(c.name).countDocuments({ block_name: name });
        if (!n) n = await db.collection(c.name).countDocuments({ blockName: name });
        if (!n && Array.isArray(c.options)) { /* noop */ }
      } catch (e) { continue; }
      if (n) console.log(`  collection "${c.name}": ${n} docs reference ${name}`);
    }
  }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });