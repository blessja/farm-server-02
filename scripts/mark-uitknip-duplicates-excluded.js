const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Worker = require("../models/Worker");

function sameDate(a, b) {
  const da = a ? new Date(a).toISOString() : "";
  const db = b ? new Date(b).toISOString() : "";
  return da === db;
}

(async () => {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const workers = await Worker.find({ "blocks.rows.job_type": "UITKNIP" });
  let workersUpdated = 0;
  let rowsMarked = 0;

  for (const worker of workers) {
    const obj = worker.toObject();
    let changed = false;

    for (const b of obj.blocks || []) {
      const rows = b.rows || [];
      for (const r of rows) {
        if (String(r.job_type || "").toUpperCase() !== "UITKNIP") continue;
        if (r.totalsExcluded === true) continue;
        const twin = rows.find(
          (x) =>
            String(x.job_type || "").toUpperCase() === "UITKNIP02" &&
            String(x.row_number) === String(r.row_number) &&
            sameDate(x.date, r.date) &&
            Number(x.stock_count || 0) === Number(r.stock_count || 0) &&
            Number(x.bunch_count || 0) === Number(r.bunch_count || 0)
        );
        if (twin) {
          r.totalsExcluded = true;
          changed = true;
          rowsMarked++;
        }
      }
    }

    if (changed) {
      await Worker.collection.updateOne({ _id: obj._id }, { $set: { blocks: obj.blocks } });
      workersUpdated++;
    }
  }

  console.log(JSON.stringify({ workersUpdated, rowsMarked }, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
