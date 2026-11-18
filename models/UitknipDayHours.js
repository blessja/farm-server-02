const mongoose = require("mongoose");

const uitknipDayHoursSchema = new mongoose.Schema({
  workerID: { type: String, required: true },
  workerName: { type: String, default: "" },
  // yyyy-mm-dd
  date: { type: String, required: true },
  // Hours worked in 05:00-07:00
  interval1Hours: { type: Number, default: 0 },
  // Hours worked in 17:30-19:00
  interval2Hours: { type: Number, default: 0 },
  recordedBy: { type: String, default: "" },
});

uitknipDayHoursSchema.index({ workerID: 1, date: 1, recordedBy: 1 }, { unique: true });

module.exports = mongoose.model("UitknipDayHours", uitknipDayHoursSchema);
