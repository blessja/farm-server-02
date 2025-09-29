const mongoose = require("mongoose");

const workerSchema = new mongoose.Schema({
  workerID: { type: String, required: true },
  name: { type: String, required: true },
  total_stock_count: { type: Number, default: 0 },
  blocks: [
    {
      block_name: { type: String },
      rows: [
        {
          row_number: { type: String },
          job_type: { type: String, required: true }, // Important: track job type
          stock_count: { type: Number },
          time_spent: { type: Number },
          date: { type: Date },
          day_of_week: { type: String },
        },
      ],
    },
  ],
  syncLogs: [
    {
      syncId: { type: String },
      deviceId: { type: String },
      type: { type: String },
      time: { type: Date },
    },
  ],
});

const Worker = mongoose.model("Worker", workerSchema);

module.exports = Worker;
