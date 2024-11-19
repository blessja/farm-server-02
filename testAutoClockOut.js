const cron = require("node-cron");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const WorkerClock = require("./models/WorkerClock");

// Database connection
mongoose
  .connect(
    "mongodb+srv://admin-Jackson:jaydenjackson1@cluster0.bnu3c.mongodb.net/farm-managment?retryWrites=true&w=majority",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("Database connected"))
  .catch((err) => console.error("Database connection error:", err));

// Schedule task to run every day at 17:30 UTC
cron.schedule("*/1 * * * *", async () => {
  try {
    console.log("Running auto clock-out task...");
    const now = moment().tz("UTC");
    const officialClockOutTime = moment.tz({ hour: 17, minute: 30 }, "UTC");

    // Find workers with active clock-in sessions
    const activeWorkers = await WorkerClock.find(
      { "clockIns.clockOutTime": { $exists: false } },
      { clockIns: 1, workerName: 1, workedHoursPerDay: 1, totalWorkedHours: 1 }
    );

    for (const worker of activeWorkers) {
      const currentSession = worker.clockIns.find(
        (session) => !session.clockOutTime
      );

      if (currentSession) {
        currentSession.clockOutTime = officialClockOutTime.toDate();

        // Calculate the duration of the session
        const clockInTime = moment(currentSession.clockInTime).tz("UTC");
        let duration = officialClockOutTime.diff(clockInTime, "hours", true);

        // Deduct lunch break if applicable (12:00 - 13:00)
        const lunchStart = moment.tz({ hour: 12, minute: 0 }, "UTC");
        const lunchEnd = moment.tz({ hour: 13, minute: 0 }, "UTC");

        if (
          clockInTime.isBefore(lunchEnd) &&
          officialClockOutTime.isAfter(lunchStart)
        ) {
          const overlapStart = moment.max(clockInTime, lunchStart);
          const overlapEnd = moment.min(officialClockOutTime, lunchEnd);
          const overlapDuration = overlapEnd.diff(overlapStart, "hours", true);
          duration -= overlapDuration;
        }

        currentSession.duration = duration;
        const clockInDay = moment(currentSession.clockInTime)
          .tz("UTC")
          .format("dddd");

        if (!worker.workedHoursPerDay[clockInDay]) {
          worker.workedHoursPerDay[clockInDay] = 0;
        }

        worker.workedHoursPerDay[clockInDay] += duration;
        worker.totalWorkedHours += duration;

        await worker.save();
        console.log(
          `Worker ${worker.workerName} clocked out automatically at 17:30.`
        );
      }
    }
  } catch (error) {
    console.error("Error during auto clock-out:", error);
  }
});
