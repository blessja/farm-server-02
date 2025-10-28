// models/PieceworkWorker.js
const mongoose = require("mongoose");

const pieceworkWorkerSchema = new mongoose.Schema({
  workerID: { type: String, required: true },
  name: { type: String, required: true },
  piecework_stock_count: { type: Number, default: 0 }, // Fast piecework total
  blocks: [
    {
      block_name: { type: String },
      rows: [
        {
          row_number: { type: String },
          job_type: { type: String, required: true }, // LEAF PICKING, SUCKER REMOVAL, etc.
          stock_count: { type: Number, default: 0 },
          date: { type: Date },
          day_of_week: { type: String },
          _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        },
      ],
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ✅ Pre-save hook to calculate piecework_stock_count
pieceworkWorkerSchema.pre("save", function (next) {
  let totalPiecework = 0;

  this.blocks.forEach((block) => {
    block.rows.forEach((row) => {
      totalPiecework += row.stock_count || 0;
    });
  });

  this.piecework_stock_count = totalPiecework;
  this.updatedAt = new Date();

  next();
});

const PieceworkWorker = mongoose.model(
  "PieceworkWorker",
  pieceworkWorkerSchema
);

module.exports = PieceworkWorker;
