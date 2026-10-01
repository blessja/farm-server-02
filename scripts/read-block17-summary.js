// Read-only summary of Block 17 row duplication structure.
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
  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primaryPreferred",
  });
  await conn.asPromise();
  const BlockM = conn.model("Block", Block.schema);
  const block = await BlockM.findOne({ block_name: "Block 17" }).lean().exec();
  const rows = Array.isArray(block.rows) ? block.rows : [];

  const counts = {};
  const bad = [];
  const hasWork = [];
  rows.forEach((r, idx) => {
    const n = parseInt(String(r.row_number).trim(), 10);
    if (!Number.isFinite(n)) {
      bad.push({ idx, row_number: r.row_number, stock_count: r.stock_count, rem: r.remaining_stock_count, worker_id: r.worker_id, job_type: r.job_type, active: (r.active_jobs || []).length });
      return;
    }
    counts[n] = (counts[n] || 0) + 1;
    const worked =
      (Number(r.remaining_stock_count) === 0) ||
      (r.remaining_stock_count != null && r.remaining_stock_count > 0) ||
      (r.active_jobs || []).length > 0 ||
      !!r.worker_id;
    if (worked) hasWork.push({ idx, n, stock: r.stock_count, rem: r.remaining_stock_count, worker_id: r.worker_id, job_type: r.job_type, active: (r.active_jobs || []).length, checkin: r.checkin_recorded_by });
  });

  const allNums = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const single = allNums.filter((n) => counts[n] === 1);
  const dup = allNums.filter((n) => counts[n] > 1);
  const missing = [];
  for (let n = 1; n <= Math.max(...allNums); n++) if (!counts[n]) missing.push(n);

  console.log("=== Block 17 row multiplicity ===");
  console.log("  declared total_rows: " + block.total_rows);
  console.log("  rows in array:       " + rows.length);
  console.log("  distinct row numbers: " + allNums.length + " (range " + allNums[0] + ".." + allNums[allNums.length - 1] + ")");
  console.log("  rows appearing ONCE: " + single.length + " -> " + single.join(", "));
  console.log("  rows DUPLICATED:     " + dup.length + " -> " + dup.join(", "));
  console.log("  row numbers ABSENT:  " + (missing.length ? missing.join(", ") : "none"));
  console.log("  unparseable row_number entries: " + bad.length);
  bad.forEach((b) => console.log("    " + JSON.stringify(b)));

  console.log("\n=== Rows carrying work (" + hasWork.length + " entries) ===");
  hasWork.forEach((w) => console.log("  idx=" + w.idx + " row=" + w.n + " stock=" + w.stock + " rem=" + w.rem + " worker=" + (w.worker_id || "-") + " job=" + (w.job_type || "-") + " active=" + w.active + " by=" + (w.checkin || "-")));
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });