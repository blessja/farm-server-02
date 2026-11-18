const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Block = require("../models/Block");
const Worker = require("../models/Worker");

(async () => {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));
  const targets = ["Kaitano", "Eunice", "Agnes", "Faustinah"];
  const workers = await Worker.find({ $or: targets.map((n) => ({ name: new RegExp(n, "i") })) }).lean();
  const ids = workers.map((w) => String(w.workerID));
  console.log("WORKERS", JSON.stringify(workers.map((w) => ({ id: w.workerID, name: w.name })), null, 2));

  for (const w of workers) {
    for (const b of (w.blocks || [])) {
      for (const r of (b.rows || [])) {
        const jt = String(r.job_type || "").toUpperCase();
        const ds = r.date ? String(r.date).slice(0, 10) : "";
        const isRecent = ds >= "2026-11-17";
        if (jt.includes("UITKNIP") || isRecent) {
          const evs = Array.isArray(r.checkout_events) ? r.checkout_events : [];
          const le = evs.length ? evs[evs.length - 1] : null;
          console.log("WROW", JSON.stringify({
            worker: w.name, id: w.workerID, block: b.block_name, row: r.row_number, job: r.job_type,
            stock: r.stock_count, bunch: r.bunch_count, date: r.date,
            kept: le ? le.kept_checked_in : null,
            vbefore: le ? le.vines_before : null, vcomp: le ? le.vines_completed : null, vrem: le ? le.vines_remaining : null,
            reason: le ? le.reason : null, recorded_at: le ? le.recorded_at : null
          }));
        }
      }
    }
  }

  const blocks = await Block.find({ "rows.active_jobs.worker_id": { $in: ids } }).lean();
  let c = 0;
  for (const b of blocks) {
    for (const row of b.rows || []) {
      for (const j of (row.active_jobs || [])) {
        if (ids.includes(String(j.worker_id))) {
          c++;
          console.log("ACTIVE", JSON.stringify({
            block: b.block_name, row: row.row_number,
            rowStock: row.stock_count, rowBunches: row.bunches,
            rowRem: row.remaining_stock_count, rowBrem: row.remaining_bunch_count,
            shared: row.shared_row, job: j
          }));
        }
      }
    }
  }
  const blocks2 = await Block.find({ "rows.worker_id": { $in: ids } }).lean();
  for (const b of blocks2) {
    for (const row of b.rows || []) {
      if (ids.includes(String(row.worker_id)) && row.start_time && !row.time_spent) {
        console.log("LEGACY", JSON.stringify({ block: b.block_name, row: row.row_number, worker_id: row.worker_id, worker_name: row.worker_name, job: row.job_type, remaining: row.remaining_stock_count, start: row.start_time }));
      }
    }
  }
  console.log("ACTIVE_COUNT", c);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
