const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Block = require("../models/Block");
const Worker = require("../models/Worker");

const TARGETS = [
  { workerID: "4102", name: "Kaitano Moleene", row: "10A", job: "UITKNIP02", done: 56, rem: 38 },
  { workerID: "4145", name: "Mutetwa Eunice", row: "10B", job: "UITKNIP02", done: 56, rem: 38 },
  { workerID: "4149", name: "Phiri Agnes", row: "11A", job: "UITKNIP02", done: 48, rem: 46 },
  { workerID: "4161", name: "Bhanhire Faustinah", row: "11B", job: "UITKNIP02", done: 56, rem: 38 },
];

function isLeafPicking(jobType) {
  return String(jobType || "").toUpperCase().includes("LEAF");
}

(async () => {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const block = await Block.findOne({ block_name: "Block 6" });
  if (!block) throw new Error("Block 6 not found");

  // 1) Remove ALL LEAF PICKING active jobs on Block 6 (preserve totals/history; only active assignments removed)
  let removedLeaf = 0;
  for (const row of block.rows || []) {
    const before = (row.active_jobs || []).length;
    const kept = (row.active_jobs || []).filter((j) => !isLeafPicking(j.job_type));
    removedLeaf += before - kept.length;
    row.active_jobs = kept;
    if (kept.length <= 1) {
      row.shared_row = false;
    } else {
      row.shared_row = true;
    }
    // Sync legacy single-worker fields if applicable
    if (kept.length === 1) {
      const j = kept[0];
      row.worker_id = j.worker_id || "";
      row.worker_name = j.worker_name || "";
      row.job_type = j.job_type || "";
      row.start_time = j.start_time || null;
      // leave time_spent/remaining_stock_count/remaining_bunch_count as-is
    } else if (kept.length === 0) {
      row.worker_id = "";
      row.worker_name = "";
      row.job_type = "";
      row.start_time = null;
      // time_spent/remaining counts represent row state; don't overwrite
    } else {
      // multiple non-leaf active jobs (unlikely) - clear legacy fields
      row.worker_id = "";
      row.worker_name = "";
      row.job_type = "";
      row.start_time = null;
    }
  }
  console.log("Removed LEAF PICKING active jobs on Block 6:", removedLeaf);

  // 2) Restore/keep-in the 4 UITKNIP02 workers
  for (const t of TARGETS) {
    const worker = await Worker.findOne({ workerID: t.workerID });
    if (!worker) {
      console.log("WORKER NOT FOUND", t.workerID, t.name);
      continue;
    }
    // Mark last matching checkout event as kept_checked_in
    let marked = false;
    for (const b of worker.blocks || []) {
      if (String(b.block_name) !== "Block 6") continue;
      for (const r of b.rows || []) {
        if (String(r.row_number) !== String(t.row)) continue;
        if (String(r.job_type || "").toUpperCase() !== t.job) continue;
        const evs = Array.isArray(r.checkout_events) ? r.checkout_events : [];
        if (!evs.length) continue;
        const le = evs[evs.length - 1];
        // Match the specific partial (56/38 or 48/46) on 2026-11-18
        const ds = le.recorded_at ? String(le.recorded_at).slice(0, 10) : (r.date ? String(r.date).slice(0,10) : "");
        if (ds === "2026-11-18" && Number(le.vines_completed) === t.done && Number(le.vines_remaining) === t.rem) {
          le.kept_checked_in = true;
          marked = true;
          console.log("Marked kept_checked_in for", t.workerID, t.name, t.row, t.job);
        }
      }
    }
    if (!marked) {
      console.log("WARN: could not find matching checkout event to mark kept for", t.workerID, t.name, t.row);
    }
    await worker.save();

    // Add/ensure active job on block row
    const row = (block.rows || []).find((r) => String(r.row_number) === String(t.row));
    if (!row) {
      console.log("ROW NOT FOUND", t.row);
      continue;
    }
    // Ensure row remaining matches expected (do not deduct again)
    if (Number(row.remaining_stock_count) !== t.rem) {
      console.log("INFO: adjusting row remaining_stock_count", t.row, "from", row.remaining_stock_count, "to", t.rem);
      row.remaining_stock_count = t.rem;
    }
    // Remove any existing active job for same worker/job on this row (avoid dup)
    row.active_jobs = (row.active_jobs || []).filter((j) => !(String(j.worker_id) === String(t.workerID) && String(j.job_type || "").toUpperCase() === t.job));
    row.active_jobs.push({
      worker_name: worker.name || t.name,
      worker_id: String(t.workerID),
      job_type: t.job,
      start_time: new Date("2026-11-18T19:30:00.000Z"),
      remaining_stock: t.rem,
      // remaining_bunches not set (no row bunch totals)
      time_spent: 0,
      recorded_by: "",
    });
    // update shared/legacy
    if ((row.active_jobs || []).length <= 1) {
      row.shared_row = false;
      const j = row.active_jobs[0];
      row.worker_id = j.worker_id || "";
      row.worker_name = j.worker_name || "";
      row.job_type = j.job_type || "";
      row.start_time = j.start_time || null;
    } else {
      row.shared_row = true;
      row.worker_id = "";
      row.worker_name = "";
      row.job_type = "";
      row.start_time = null;
    }
    console.log("Restored active job for", t.workerID, t.name, t.row, "remaining", t.rem, "active_jobs_now", row.active_jobs.length);
  }

  await block.save();
  console.log("Block 6 saved.");
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
