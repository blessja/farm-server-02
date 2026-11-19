const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Block = require("../models/Block");

(async () => {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const blocks = await Block.find({ "rows.active_jobs.job_type": "UITKNIP02" });
  let added = 0;
  let skipped = 0;
  const touched = [];

  for (const block of blocks) {
    let blockChanged = false;
    for (const row of block.rows || []) {
      const jobs = Array.isArray(row.active_jobs) ? row.active_jobs : [];
      const uitknip02Jobs = jobs.filter((j) => String(j.job_type || "").toUpperCase() === "UITKNIP02");
      if (!uitknip02Jobs.length) continue;

      for (const src of uitknip02Jobs) {
        const workerId = String(src.worker_id || "");
        const already = jobs.some(
          (j) => String(j.job_type || "").toUpperCase() === "UITKNIP" && String(j.worker_id || "") === workerId
        );
        if (already) {
          skipped++;
          continue;
        }
        jobs.push({
          worker_name: src.worker_name,
          worker_id: src.worker_id,
          job_type: "UITKNIP",
          start_time: src.start_time || new Date(),
          remaining_stock: src.remaining_stock,
          remaining_bunches: typeof src.remaining_bunches === "number" ? src.remaining_bunches : 0,
          time_spent: src.time_spent ?? null,
          recorded_by: src.recorded_by || "",
        });
        added++;
        touched.push({ block: block.block_name, row: String(row.row_number), worker_id: workerId, worker_name: src.worker_name });
      }

      if (jobs.length > 1) {
        row.shared_row = true;
        row.worker_id = "";
        row.worker_name = "";
        row.job_type = "";
        row.start_time = null;
      } else if (jobs.length === 1) {
        row.shared_row = false;
        row.worker_id = jobs[0].worker_id || "";
        row.worker_name = jobs[0].worker_name || "";
        row.job_type = jobs[0].job_type || "";
        row.start_time = jobs[0].start_time || null;
      }
      // keep row remaining_stock_count/remaining_bunch_count unchanged
      row.active_jobs = jobs;
      blockChanged = true;
    }
    if (blockChanged) await block.save();
  }

  console.log("ADDED_UITKNIP_ACTIVE_JOBS", added);
  console.log("SKIPPED_ALREADY_EXISTS", skipped);
  console.log(JSON.stringify(touched, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
