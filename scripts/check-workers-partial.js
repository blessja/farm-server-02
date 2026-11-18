const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Block = require("../models/Block");
const Worker = require("../models/Worker");

async function run() {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const names = ["Kaitano", "Eunice", "Agnes", "Faustinah"];
  const workers = await Worker.find({
    $or: names.map((n) => ({ name: new RegExp(n, "i") })),
  }).lean();

  console.log("=== WORKERS ===");
  for (const w of workers) {
    console.log(JSON.stringify({
      workerID: w.workerID,
      name: w.name,
      total_stock_count: w.total_stock_count,
      blocks: (w.blocks || []).map((b) => ({
        block_name: b.block_name,
        rows: (b.rows || []).slice(-5).map((r) => ({
          row_number: r.row_number,
          job_type: r.job_type,
          stock_count: r.stock_count,
          bunch_count: r.bunch_count,
          date: r.date,
          last_checkout_at: r.last_checkout_at,
          checkout_recorded_at: r.checkout_recorded_at,
          last_event: Array.isArray(r.checkout_events) && r.checkout_events.length ? r.checkout_events[r.checkout_events.length - 1] : null,
        })),
      })).filter((b) => b.rows.length),
    }, null, 2));
  }

  console.log("\n=== ACTIVE JOBS IN BLOCKS (matching workers) ===");
  const ids = new Set(workers.map((w) => String(w.workerID)));
  const blocks = await Block.find({ "rows.active_jobs.worker_id": { $in: Array.from(ids) } }).lean();
  for (const b of blocks) {
    for (const row of b.rows || []) {
      const jobs = (row.active_jobs || []).filter((j) => ids.has(String(j.worker_id)));
      if (jobs.length) {
        console.log(JSON.stringify({
          block: b.block_name,
          row_number: row.row_number,
          stock_count: row.stock_count,
          bunches: row.bunches,
          remaining_stock_count: row.remaining_stock_count,
          remaining_bunch_count: row.remaining_bunch_count,
          shared_row: row.shared_row,
          matching_jobs: jobs,
        }, null, 2));
      }
    }
  }

  // also check legacy active assignments
  console.log("\n=== LEGACY ACTIVE (matching workers) ===");
  const blocks2 = await Block.find({ "rows.worker_id": { $in: Array.from(ids) } }).lean();
  for (const b of blocks2) {
    for (const row of b.rows || []) {
      if (ids.has(String(row.worker_id)) && row.start_time && !row.time_spent) {
        console.log(JSON.stringify({
          block: b.block_name,
          row_number: row.row_number,
          worker_id: row.worker_id,
          worker_name: row.worker_name,
          job_type: row.job_type,
          stock_count: row.stock_count,
          remaining_stock_count: row.remaining_stock_count,
        }, null, 2));
      }
    }
  }

  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
