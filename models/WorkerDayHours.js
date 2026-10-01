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
  // Supervisor who entered these hours, so a worker with no piecework records
  // still resolves to a crew.
  recordedBy: { type: String, default: "" },
});

// Two supervisors may legitimately record hours for the same worker and date.
// Their entries must remain separate so that each totals view is private.
workerDayHoursSchema.index({ workerID: 1, date: 1, recordedBy: 1 }, { unique: true });

const WorkerDayHours = mongoose.model("WorkerDayHours", workerDayHoursSchema);

module.exports = WorkerDayHours;
