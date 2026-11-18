const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Block = require("../models/Block");
const Worker = require("../models/Worker");

function roundBunches(n) { return Math.round(Number(n) || 0); }
function calcBunches(row, vinesWorked) {
  const totalVines = Number(row?.stock_count) || 0;
  const totalBunches = Number(row?.bunches) || 0;
  const worked = Number(vinesWorked) || 0;
  if (totalVines <= 0 || worked <= 0) return 0;
  return Math.round(totalBunches / totalVines) * worked;
}

async function run() {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const workerID = "5107";
  const workerName = "Toyo Notokazi Victor";
  const blockName = "Block 6";
  const rowNumber = "8B";
  const jobType = "UITKNIP02"; // as recorded
  const vinesWorked = 56;

  const block = await Block.findOne({ block_name: blockName });
  if (!block) throw new Error("Block not found");
  const row = block.rows.find((r) => String(r.row_number) === rowNumber);
  if (!row) throw new Error("Row not found");

  const totalVines = Number(row.stock_count) || 0;
  const totalBunches = Number(row.bunches) || 0;
  const remainingVines = Math.max(0, totalVines - vinesWorked);
  const bunchesWorked = calcBunches(row, vinesWorked);
  const remainingBunches = Math.max(0, totalBunches - bunchesWorked);

  console.log("CALC:", { totalVines, totalBunches, vinesWorked, remainingVines, bunchesWorked, remainingBunches });

  if (!Array.isArray(row.active_jobs)) row.active_jobs = [];
  // Remove any existing active job for this worker+job on this row
  row.active_jobs = row.active_jobs.filter(
    (j) => !(String(j.worker_id) === workerID && String(j.job_type || "").toUpperCase() === jobType.toUpperCase())
  );

  // For different job types coexisting, keep row remaining fields consistent with vine progress on this row.
  // Row 8B already at 38 remaining; set to 38.
  row.remaining_stock_count = remainingVines;
  if (totalBunches > 0 || row.remaining_bunch_count !== undefined) {
    row.remaining_bunch_count = remainingBunches;
  }
  row.shared_row = row.active_jobs.length >= 1; // will become true after push if others exist
  row.active_jobs.push({
    worker_name: workerName,
    worker_id: workerID,
    job_type: jobType,
    start_time: new Date(),
    remaining_stock: remainingVines,
    remaining_bunches: remainingBunches,
    time_spent: null,
    recorded_by: "Jackson",
  });
  // sync vine/bunch remaining for all jobs? different jobs - safer to not overwrite other job's semantics, but row-level fields set.
  row.shared_row = row.active_jobs.length > 1;

  await block.save();
  console.log("Block updated. Active jobs:", JSON.stringify(row.active_jobs, null, 2));

  const worker = await Worker.findOne({ workerID });
  if (!worker) throw new Error("Worker not found");
  const wBlock = (worker.blocks || []).find((b) => b.block_name === blockName);
  const wRow = wBlock && (wBlock.rows || []).find((r) => String(r.row_number) === rowNumber && String(r.job_type || "").toUpperCase() === jobType.toUpperCase() && String(r.date || "").startsWith("2026-11-18"));
  if (!wRow) throw new Error("Worker row entry not found");
  wRow.bunch_count = bunchesWorked; // will be 0 if row bunches not set
  if (Array.isArray(wRow.checkout_events) && wRow.checkout_events.length) {
    const last = wRow.checkout_events[wRow.checkout_events.length - 1];
    last.kept_checked_in = true;
    last.vines_remaining = remainingVines;
    last.bunches_completed = bunchesWorked;
    last.bunches_remaining = remainingBunches;
    last.bunches_before = totalBunches;
  }
  await worker.save();
  console.log("Worker updated:", JSON.stringify({ row_number: wRow.row_number, job_type: wRow.job_type, stock_count: wRow.stock_count, bunch_count: wRow.bunch_count, last_event: wRow.checkout_events[wRow.checkout_events.length-1] }, null, 2));

  await mongoose.disconnect();
  console.log("DONE");
}

run().catch((e) => { console.error(e); process.exit(1); });
