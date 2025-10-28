// models/Worker.js
const mongoose = require("mongoose");

const workerSchema = new mongoose.Schema({
  workerID: { type: String, required: true },
  name: { type: String, required: true },
  total_stock_count: { type: Number, default: 0 }, // Regular piecework (check-in/out)
  piecework_stock_count: { type: Number, default: 0 }, // Fast piecework (single scan)
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

// ✅ Enhanced pre-save hook to calculate both totals correctly
workerSchema.pre("save", function (next) {
  // Fast piecework job types (single scan)
  const fastPieceworkTypes = [
    "LEAF PICKING",
    "SUCKER REMOVAL",
    "SHOOT THINNING",
    "OTHER",
  ];

  let regularStockCount = 0; // Regular work (check-in/out)
  let fastPieceworkCount = 0; // Fast piecework (single scan)

  this.blocks.forEach((block) => {
    block.rows.forEach((row) => {
      const stockCount = row.stock_count || 0;
      const jobType = (row.job_type || "").toUpperCase();

      if (fastPieceworkTypes.includes(jobType)) {
        // Fast piecework jobs
        fastPieceworkCount += stockCount;
      } else {
        // Regular work jobs
        regularStockCount += stockCount;
      }
    });
  });

  this.total_stock_count = regularStockCount; // Regular work only
  this.piecework_stock_count = fastPieceworkCount; // Fast piecework only

  next();
});

const Worker = mongoose.model("Worker", workerSchema);

module.exports = Worker;
