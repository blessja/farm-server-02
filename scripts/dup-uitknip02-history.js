const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Worker = require("../models/Worker");

function rowKey(blockName, row) {
  const d = row && row.date ? new Date(row.date).toISOString() : "";
  return [
    String(blockName || ""),
    String((row && row.row_number) || ""),
    d,
    String((row && row.stock_count) || 0),
    String((row && row.bunch_count) || 0),
    String((row && row.job_type) || "").toUpperCase(),
  ].join("::");
}

function cloneRowAsUitknip(row) {
  const plain = JSON.parse(JSON.stringify(row));
  plain.job_type = "UITKNIP";
  delete plain._id;
  if (Array.isArray(plain.checkout_events)) {
    plain.checkout_events = plain.checkout_events.map((e) => {
      const ce = { ...e };
      delete ce._id;
      return ce;
    });
  }
  return plain;
}

(async () => {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const workers = await Worker.find({ "blocks.rows.job_type": "UITKNIP02" });
  let workersUpdated = 0;
  let rowsDuplicated = 0;
  let stockDeducted = 0;
  const details = [];

  for (const worker of workers) {
    const obj = worker.toObject();
    let addedStockForWorker = 0;
    let addedForWorker = 0;

    // Build set of existing UITKNIP row keys to avoid duplicates
    const existingUitknipKeys = new Set();
    for (const b of obj.blocks || []) {
      for (const r of b.rows || []) {
        if (String(r.job_type || "").toUpperCase() === "UITKNIP") {
          existingUitknipKeys.add(rowKey(b.block_name, r));
        }
      }
    }

    for (const b of obj.blocks || []) {
      const additions = [];
      for (const r of b.rows || []) {
        if (String(r.job_type || "").toUpperCase() !== "UITKNIP02") continue;
        const clone = cloneRowAsUitknip(r);
        const k = rowKey(b.block_name, clone);
        if (existingUitknipKeys.has(k)) continue;
        additions.push(clone);
        existingUitknipKeys.add(k);
        const sc = Number(r.stock_count) || 0;
        // UITKNIP is regular (not fast piecework), so pre-save would add to total_stock_count
        addedStockForWorker += sc;
        addedForWorker++;
        details.push({ workerID: obj.workerID, name: obj.name, block: b.block_name, row: r.row_number, date: r.date, stock: sc, bunch: r.bunch_count || 0 });
      }
      if (additions.length) {
        b.rows = Array.isArray(b.rows) ? b.rows.concat(additions) : additions;
      }
    }

    if (addedForWorker > 0) {
      const originalTotal = Number(obj.total_stock_count) || 0;
      const newTotal = Math.max(0, originalTotal - addedStockForWorker);
      await Worker.collection.updateOne(
        { _id: obj._id },
        { $set: { blocks: obj.blocks, total_stock_count: newTotal } }
      );
      workersUpdated++;
      rowsDuplicated += addedForWorker;
      stockDeducted += addedStockForWorker;
    }
  }

  console.log(JSON.stringify({ workersUpdated, rowsDuplicated, stockDeducted }, null, 2));
  console.log("DETAILS", JSON.stringify(details, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
