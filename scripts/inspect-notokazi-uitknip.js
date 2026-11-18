const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Block = require("../models/Block");
const Worker = require("../models/Worker");

async function run() {
  await connectDB();
  await new Promise((r) => setTimeout(r, 1500));

  const workerID = "5107";
  const namePart = "Notokazi";
  const blockName = "Block 6";
  const rowNumber = "8B";
  const jobType = "UITKNIP";

  const block = await Block.findOne({ block_name: blockName }).lean();
  if (!block) {
    console.log("Block not found:", blockName);
  } else {
    const row = (block.rows || []).find((r) => String(r.row_number) === rowNumber);
    console.log("BLOCK ROW:", JSON.stringify({
      block_name: block.block_name,
      row_number: row?.row_number,
      stock_count: row?.stock_count,
      bunches: row?.bunches,
      remaining_stock_count: row?.remaining_stock_count,
      remaining_bunch_count: row?.remaining_bunch_count,
      shared_row: row?.shared_row,
      active_jobs: row?.active_jobs || [],
      legacy: {
        worker_id: row?.worker_id,
        worker_name: row?.worker_name,
        job_type: row?.job_type,
        start_time: row?.start_time,
        time_spent: row?.time_spent,
      }
    }, null, 2));
  }

  const workers = await Worker.find({
    $or: [{ workerID }, { name: new RegExp(namePart, "i") }],
  }).lean();
  console.log("WORKERS FOUND:", workers.length);
  for (const w of workers) {
    const out = {
      _id: w._id,
      workerID: w.workerID,
      name: w.name,
      total_stock_count: w.total_stock_count,
      supervisor: w.supervisor,
      blocks: [],
    };
    for (const b of (w.blocks || [])) {
      if (b.block_name !== blockName) continue;
      const rows = (b.rows || []).filter((r) => String(r.row_number) === rowNumber || String(r.job_type || "").toUpperCase().includes("UITKNIP"));
      if (rows.length) out.blocks.push({ block_name: b.block_name, rows });
    }
    console.log("WORKER:", JSON.stringify(out, null, 2));
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
