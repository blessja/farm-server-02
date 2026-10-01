// Read-only: find rows in Block 17 that actually carry piecework records,
// and inspect the trailing / odd entries.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");
const Block = require("../models/Block");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primaryPreferred" });
  await conn.asPromise();
  const BlockM = conn.model("Block", Block.schema);
  const block = await BlockM.findOne({ block_name: "Block 17" }).lean().exec();
  const rows = Array.isArray(block.rows) ? block.rows : [];

  const real = [];
  rows.forEach((r, idx) => {
    const rem = r.remaining_stock_count;
    const hasRem = rem !== undefined && rem !== null;
    if (hasRem || (r.active_jobs || []).length > 0) {
      real.push({
        idx,
        row_number: r.row_number,
        stock: r.stock_count,
        rem,
        worker_id: r.worker_id,
        worker_name: r.worker_name,
        job_type: r.job_type,
        active: (r.active_jobs || []).length,
        time_spent: r.time_spent,
        checkin_by: r.checkin_recorded_by,
        start_time: r.start_time,
      });
    }
  });

  console.log("=== Entries with remaining_stock_count or active_jobs: " + real.length + " ===");
  real.forEach((r) => {
    console.log(
      `  idx=${r.idx} row=${JSON.stringify(r.row_number)} stock=${r.stock} rem=${r.rem} worker=${r.worker_id || "-"} name=${r.worker_name || "-"} job=${r.job_type || "-"} active=${r.active} mins=${r.time_spent} by=${r.checkin_by || "-"} start=${r.start_time || "-"}`
    );
  });

  console.log("\n=== Last 4 entries in array (raw) ===");
  rows.slice(-4).forEach((r, i) => {
    console.log("  idx=" + (rows.length - 4 + i) + " " + JSON.stringify(r));
  });
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });