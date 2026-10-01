// Read-only: does any worker record reference Block 17 rows that no longer
// exist in the Block document? Catches orphaned piecework after row deletions.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");
const Block = require("../models/Block");
const PieceworkWorker = require("../models/PieceworkWorker");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primaryPreferred" });
  await conn.asPromise();
  const BlockM = conn.model("Block", Block.schema);
  const PWM = conn.model("PieceworkWorker", PieceworkWorker.schema);

  const block = await BlockM.findOne({ block_name: "Block 17" }).lean().exec();
  const existing = new Set((block.rows || []).map((r) => String(r.row_number)));

  const workers = await PWM.find({ "blocks.block_name": "Block 17" }).lean().exec();
  console.log("=== Block 17 worker records: " + workers.length + " ===");

  const orphanRefs = [];
  workers.forEach((w) => {
    (w.blocks || []).forEach((b) => {
      if (b.block_name !== "Block 17") return;
      (b.rows || []).forEach((r) => {
        const label = String(r.row_number);
        if (!existing.has(label)) {
          orphanRefs.push({
            workerID: w.workerID,
            workerName: w.worker_name || w.workerName,
            row: label,
            stock_count: r.stock_count,
            date: r.date,
            recorded_by: r.recorded_by,
          });
        }
      });
    });
  });

  console.log("\n=== ORPHANED references (row missing from Block 17 doc): " + orphanRefs.length + " ===");
  orphanRefs.forEach((o) =>
    console.log(`  worker ${o.workerID} (${o.workerName}) -> row ${o.row} stock=${o.stock_count} date=${o.date} by=${o.recorded_by || "-"}`)
  );

  const labels = [...new Set(orphanRefs.map((o) => o.row))].sort();
  console.log("\n  distinct orphaned row labels: " + (labels.length ? labels.join(", ") : "none"));

  // Also: rows present in Block 17 but absent from every worker record.
  const referenced = new Set();
  workers.forEach((w) =>
    (w.blocks || []).forEach((b) =>
      (b.rows || []).forEach((r) => referenced.add(String(r.row_number)))
    )
  );
  const noWork = [...existing].filter((l) => !referenced.has(l) && l.length < 6).sort();
  console.log("\n=== Block 17 rows with NO worker record: " + noWork.length + " ===");
  console.log("  " + noWork.join(", "));

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });