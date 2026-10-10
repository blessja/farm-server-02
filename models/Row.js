const mongoose = require("mongoose");

const rowSchema = new mongoose.Schema({
  row_number: { type: String, required: true },
  stock_count: { type: Number, default: 0 }, // Total trees in row
  bunches: { type: Number, default: 0 },

  // Array to track multiple active jobs on this row
  active_jobs: [
    {
      worker_name: { type: String, required: true },
      worker_id: { type: String, required: true },
      job_type: { type: String, required: true },
      start_time: { type: Date, required: true },
      remaining_stock: { type: Number, required: true }, // Remaining for THIS job
      time_spent: { type: Number, default: null }, // Time in minutes
      // Supervisor who checked this worker in. Drives per-supervisor scoping
      // of the Working tab while the work is still in progress.
      recorded_by: { type: String, default: "" },
    },
  ],

  // Legacy fields - keep for backward compatibility during migration
  shared_row: { type: Boolean, default: false },
  worker_name: { type: String, default: "" },
  worker_id: { type: String, default: "" },
  time_spent: { type: Number, default: 0 },
  job_type: { type: String, required: false },
  remaining_stock_count: Number,
  start_time: { type: Date, default: null },
  checkin_recorded_by: { type: String, default: "" },
});

const Row = mongoose.model("Row", rowSchema);

module.exports = Row;
