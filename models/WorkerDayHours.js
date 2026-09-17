// models/WorkerDayHours.js
const mongoose = require("mongoose");

// Manually-entered hours worked per worker per day.
// Used later together with piecework totals (vines) to calculate rates.
const workerDayHoursSchema = new mongoose.Schema({
  workerID: { type: String, required: true },
  workerName: { type: String, default: "" },
  // Store as a plain yyyy-mm-dd string so we don't fight timezone shifting.
  date: { type: String, required: true },
  hours: { type: Number, default: 0 },
});

workerDayHoursSchema.index({ workerID: 1, date: 1 }, { unique: true });

const WorkerDayHours = mongoose.model("WorkerDayHours", workerDayHoursSchema);

module.exports = WorkerDayHours;