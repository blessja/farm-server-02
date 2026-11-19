const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require('../config/db');
const Block = require('../models/Block');
const Worker = require('../models/Worker');

function targetRowsSet() {
  const targets = ['8B','9A','9B','10A','10B','11A','11B','12A','12B','13A','13B','14A','14B','15A','15B','16A','16B','17A','17B','18A','18B','19A','19B','20A','20B','21A','21B','22A','22B','23A','23B','24A','24B','25A','25B','26A','26B','27A','27B','28A','28B','29A','29B','30A','30B','31A','31B','32A','32B','33A'];
  return new Set(targets);
}

(async () => {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const block = await Block.findOne({ block_name: "Block 6" });
  if (!block) throw new Error("Block 6 not found");
  const targets = targetRowsSet();

  // Collect intended kept-in partial states from worker history (UITKNIP02)
  const intended = new Map(); // rowNumber -> { workerID, workerName, jobTypeBase: 'UITKNIP02', remainingVines, remainingBunches, start_time? }
  const workers = await Worker.find({ "blocks.rows.job_type": "UITKNIP02" }, { workerID: 1, name: 1, blocks: 1 }).lean();
  for (const w of workers) {
    for (const b of (w.blocks || [])) {
      if (String(b.block_name) !== "Block 6") continue;
      for (const r of (b.rows || [])) {
        if (!targets.has(String(r.row_number))) continue;
        if (String(r.job_type || "").toUpperCase() !== "UITKNIP02") continue;
        const evs = Array.isArray(r.checkout_events) ? r.checkout_events : [];
        if (!evs.length) continue;
        const le = evs[evs.length - 1];
        const vrem = Number(le.vines_remaining);
        const vcomp = Number(le.vines_completed);
        const kept = le.kept_checked_in === true;
        if (kept && Number.isFinite(vrem) && vrem > 0 && Number.isFinite(vcomp) && vcomp > 0) {
          // use this as intended remainder for that row/worker
          intended.set(String(r.row_number), {
            workerID: String(w.workerID),
            workerName: w.name,
            remainingVines: vrem,
            remainingBunches: Number(le.bunches_remaining || 0),
            checkin_started_at: le.checkin_started_at || r.date || null,
          });
        }
      }
    }
  }

  let fixed = 0;
  const changes = [];
  for (const row of block.rows || []) {
    const rn = String(row.row_number);
    if (!targets.has(rn)) continue;
    const want = intended.get(rn);
    if (!want) continue;

    const rowRem = Number(row.remaining_stock_count);
    const uitkJobs = (row.active_jobs || []).filter(j => String(j.job_type || "").toUpperCase().includes("UITKNIP"));
    const isDoneState = (rowRem === 0 || !Number.isFinite(rowRem)) && uitkJobs.length === 0;
    // Also fix if rem 0 but should have remainder (even if somehow jobs state odd)
    const needsFix = (rowRem === 0 && want.remainingVines > 0) || (uitkJobs.length === 0 && want.remainingVines > 0 && rowRem === 0);
    if (!needsFix) continue;

    // restore
    row.remaining_stock_count = want.remainingVines;
    // keep remaining_bunch_count as-is unless missing; prefer 0 if unknown
    if (row.remaining_bunch_count == null) row.remaining_bunch_count = want.remainingBunches || 0;

    // remove existing UITKNIP/UITKNIP02 jobs for this worker on this row to avoid dups, then add both
    row.active_jobs = (row.active_jobs || []).filter(j => {
      const sameWorker = String(j.worker_id) === want.workerID;
      const isUitk = String(j.job_type || "").toUpperCase().includes("UITKNIP");
      return !(sameWorker && isUitk);
    });
    const start = want.checkin_started_at ? new Date(want.checkin_started_at) : new Date("2026-11-18T12:00:00.000Z");
    const base = {
      worker_name: want.workerName,
      worker_id: want.workerID,
      start_time: start,
      remaining_stock: want.remainingVines,
      remaining_bunches: want.remainingBunches || 0,
      time_spent: 0,
      recorded_by: "",
    };
    row.active_jobs.push({ ...base, job_type: "UITKNIP02" });
    row.active_jobs.push({ ...base, job_type: "UITKNIP" });

    if ((row.active_jobs || []).length <= 1) {
      row.shared_row = false;
      const j = row.active_jobs[0];
      if (j) { row.worker_id = j.worker_id || ""; row.worker_name = j.worker_name || ""; row.job_type = j.job_type || ""; row.start_time = j.start_time || null; }
    } else {
      row.shared_row = true;
      row.worker_id = ""; row.worker_name = ""; row.job_type = ""; row.start_time = null;
    }

    fixed++;
    changes.push({ row: rn, worker: want.workerName, id: want.workerID, restoredRemaining: want.remainingVines, activeJobs: row.active_jobs.length });
  }

  if (fixed > 0) await block.save();
  console.log(JSON.stringify({ intendedCount: intended.size, fixed, changes }, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

