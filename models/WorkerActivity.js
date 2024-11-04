// models/workerActivityModel.js
const mongoose = require("mongoose");

const workerActivitySchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Worker",
    required: true,
  },
  blockName: { type: String, required: true },
  rowId: { type: mongoose.Schema.Types.ObjectId, ref: "Row", required: true },
  stocksWorked: { type: Number, required: true },
  bunchesWorked: { type: Number, required: true },
  start_time: { type: Date, default: Date.now },
  end_time: { type: Date },
});

module.exports = mongoose.model("WorkerActivity", workerActivitySchema);
