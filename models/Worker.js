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
          job_type: { type: String, required: false, default: "Other" },
          stock_count: { type: Number, default: 0 },
          time_spent: { type: Number, default: 0 },
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

// ✅ Pre-save hook to auto-recalculate totals
workerSchema.pre("save", function (next) {
  let total = 0;

  this.blocks.forEach((block) => {
    block.rows.forEach((row) => {
      total += row.stock_count || 0;
    });
  });

  this.total_stock_count = total;

  next();
});

const Worker = mongoose.model("Worker", workerSchema);

module.exports = Worker;
