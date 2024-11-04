const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Worker Schema for clock-in/out system with day-based tracking
const workerSchema = new Schema({
  workerID: { type: String, required: true, unique: true },
  workerName: { type: String, required: true },
  clockIns: [
    {
      clockInTime: { type: Date, required: true },
      clockOutTime: { type: Date },
      duration: { type: Number }, // In hours, calculated after clock-out
      day: { type: String }, // To store day of the week, e.g., 'Monday'
    },
  ],
  totalWorkedHours: { type: Number, default: 0 }, // Accumulated work hours
  workedHoursPerDay: {
    Wednesday: { type: Number, default: 0 },
    Thursday: { type: Number, default: 0 },
    Friday: { type: Number, default: 0 },
    Saturday: { type: Number, default: 0 },
    Monday: { type: Number, default: 0 },
    Tuesday: { type: Number, default: 0 },
  },
});

module.exports = mongoose.model("WorkerClock", workerSchema);
