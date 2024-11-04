const mongoose = require("mongoose");

const PieceworkWorkerSchema = new mongoose.Schema({
  workerID: { type: String, required: true },
  name: { type: String, required: true },
  blocks: [
    {
      block_name: String,
      rows: [
        {
          row_number: String,
          stock_count: Number,
          bunches_worked: Number,
          time_spent: Number,
          date: Date,
          day_of_week: String,
        },
      ],
    },
  ],
  total_stock_count: { type: Number, default: 0 },
  total_bunches_worked: { type: Number, default: 0 },
  total_time_spent: { type: Number, default: 0 },
  total_days_worked: { type: Number, default: 0 },
  average_bunches_per_stock: { type: Number, default: 0 },
  average_time_spent: { type: Number, default: 0 },
});

// Prevent model overwrite error
const PieceworkWorker =
  mongoose.models.PieceworkWorker ||
  mongoose.model("PieceworkWorker", PieceworkWorkerSchema);

module.exports = PieceworkWorker;
