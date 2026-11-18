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
        const isRecent = r.date && String(r.date).slice(0, 10) >= "2026-11-18";
        if (jt.includes("UITKNIP") || isRecent) {
          const le = Array.isArray(r.checkout_events) && r.checkout_events.length ? r.checkout_events[r.checkout_events.length - 1] : null;
          console.log("ROW", JSON.stringify({
            w: w.name, id: w.workerID, block: b.block_name, row: r.row_number, job: r.job_type,
            stock: r.stock_count, bunch: r.bunch_count, date: r.date,
            kept: le && le.kept_checked_in, vrem: le && le.vines_remaining, vcomp: le && le.vines_completed,
            reason: le && le.reason
          }));
        }
      }
    }
  }

  const blocks = await Block.find({ "rows.active_jobs.worker_id": { $in: ids } }).lean();
  let activeCount = 0;
  for (const b of blocks) {
    for (const row of b.rows || []) {
      for (const j of (row.active_jobs || [])) {
        if (ids.includes(String(j.worker_id))) {
          activeCount++;
          console.log("ACTIVE", JSON.stringify({
            block: b.block_name, row: row.row_number,
            row_stock: row.stock_count, row_bunches: row.bunches,
            row_remaining_stock: row.remaining_stock_count, row_remaining_bunch: row.remaining_bunch_count,
            job: j
          }));
        }
      }
    }
  }
  console.log("ACTIVE_COUNT", activeCount);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
