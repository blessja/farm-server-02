require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const { resolveMongoUri } = require("../config/db");
const Worker = require("../models/Worker");

async function main() {
  await mongoose.connect(resolveMongoUri(), { serverSelectionTimeoutMS: 10000 });
  const workers = await Worker.find().lean();
  const dist = {};
  let totalRows = 0;
  workers.forEach((w) =>
    (w.blocks || []).forEach((b) =>
      (b.rows || []).forEach((r) => {
        totalRows += 1;
        const jt = (r.job_type || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
        dist[jt] = (dist[jt] || 0) + 1;
      })
    )
  );
  console.log("Worker docs:", workers.length, "| total row entries:", totalRows);
  console.log("job type distribution:");
  Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([jt, n]) => console.log("  " + jt + ": " + n));
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });