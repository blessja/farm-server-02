const cron = require("node-cron");
const moment = require("moment-timezone");
const WorkerClock = require("../models/WorkerClock");

// Add a new clock-in entry for a worker
exports.addClockIn = async (req, res) => {
  const { workerID, workerName, timezone = "UTC" } = req.body;

  try {
    let worker = await WorkerClock.findOne({ workerID });

    if (!worker) {
      worker = new WorkerClock({
        workerID,
        workerName,
        clockIns: [],
        workedHoursPerDay: {
          Wednesday: 0,
          Thursday: 0,
          Friday: 0,
          Saturday: 0,
          Monday: 0,
          Tuesday: 0,
        },
        totalWorkedHours: 0,
      });
    }

    const activeSession = worker.clockIns.find(
      (session) => !session.clockOutTime
    );

    if (activeSession) {
      return res.status(400).json({
        message: `Worker ${workerName} is already clocked in. Please clock out first.`,
      });
    }

    const now = moment().tz(timezone);
    const startTime = moment
      .tz(timezone)
      .set({ hour: 7, minute: 30, second: 0 });

    // Adjust clock-in time to start at 07:30 if the actual time is after 07:30 but within a reasonable buffer
    const adjustedClockInTime =
      now.isAfter(startTime) && now.diff(startTime, "minutes") <= 15
        ? startTime
        : now;

    worker.clockIns.push({
      clockInTime: adjustedClockInTime.toDate(),
      day: now.format("dddd"), // Get the current day
    });

    await worker.save();
    res.status(201).json({ message: "Clock-in entry added successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Clock-out a worker
exports.addClockOut = async (req, res) => {
  const { workerID, workerName, timezone = "UTC" } = req.body;

  try {
    const worker = await WorkerClock.findOne({ workerID, workerName });

    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const currentSession = worker.clockIns.find(
      (session) => !session.clockOutTime
    );

    if (!currentSession) {
      return res
        .status(400)
        .json({ message: `Worker ${workerName} is not clocked in.` });
    }

    const now = moment().tz(timezone);
    const officialClockOutTime = moment.tz({ hour: 17, minute: 30 }, timezone);

    // Ensure the clock-out time is set to 17:30 if current time is after 17:30
    currentSession.clockOutTime = now.isAfter(officialClockOutTime)
      ? officialClockOutTime.toDate()
      : now.toDate();

    // Calculate the duration excluding lunch break between 12:00 PM and 1:00 PM
    const clockInTime = moment(currentSession.clockInTime).tz(timezone);
    const clockOutTime = moment(currentSession.clockOutTime).tz(timezone);

    let duration = clockOutTime.diff(clockInTime, "hours", true);

    const lunchStart = moment
      .tz(clockInTime, timezone)
      .set({ hour: 12, minute: 0 });
    const lunchEnd = moment
      .tz(clockInTime, timezone)
      .set({ hour: 13, minute: 0 });

    // Deduct lunch break if applicable
    if (clockInTime.isBefore(lunchEnd) && clockOutTime.isAfter(lunchStart)) {
      const overlapStart = moment.max(clockInTime, lunchStart);
      const overlapEnd = moment.min(clockOutTime, lunchEnd);
      const overlapDuration = overlapEnd.diff(overlapStart, "hours", true);
      duration -= overlapDuration;
    }

    currentSession.duration = duration;

    const clockInDay = currentSession.day;
    worker.workedHoursPerDay[clockInDay] += duration;
    worker.totalWorkedHours += duration;

    await worker.save();
    res.json({
      message: `Worker ${
        worker.workerName
      } clocked out successfully. Worked ${duration.toFixed(
        2
      )} hours on ${clockInDay}.`,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Function to auto clock out workers
const autoClockOut = async (timezone = "UTC") => {
  try {
    const workers = await WorkerClock.find({});

    const now = moment().tz(timezone);
    const officialClockOutTime = moment.tz({ hour: 17, minute: 30 }, timezone);

    for (const worker of workers) {
      // Find all sessions without clockOutTime
      const unclockedSessions = worker.clockIns.filter(
        (session) => !session.clockOutTime
      );

      for (const session of unclockedSessions) {
        const clockInTime = moment(session.clockInTime).tz(timezone);
        let clockOutTime = now.isAfter(officialClockOutTime)
          ? officialClockOutTime
          : now;

        // Ensure lunch break deduction if applicable
        let duration = clockOutTime.diff(clockInTime, "hours", true);

        const lunchStart = moment
          .tz(clockInTime, timezone)
          .set({ hour: 12, minute: 0 });
        const lunchEnd = moment
          .tz(clockInTime, timezone)
          .set({ hour: 13, minute: 0 });

        if (
          clockInTime.isBefore(lunchEnd) &&
          clockOutTime.isAfter(lunchStart)
        ) {
          const overlapStart = moment.max(clockInTime, lunchStart);
          const overlapEnd = moment.min(clockOutTime, lunchEnd);
          const overlapDuration = overlapEnd.diff(overlapStart, "hours", true);
          duration -= overlapDuration;
        }

        // Update the session with clock-out time and duration
        session.clockOutTime = clockOutTime.toDate();
        session.duration = duration;

        // Update worker's total worked hours
        const clockInDay = session.day;
        worker.workedHoursPerDay[clockInDay] =
          (worker.workedHoursPerDay[clockInDay] || 0) + duration;
        worker.totalWorkedHours += duration;

        console.log(
          `Auto-clocked out worker ${worker.workerName} for session ${
            session._id
          }. Worked ${duration.toFixed(2)} hours.`
        );
      }

      await worker.save();
    }

    console.log("Auto clock-out completed for outstanding sessions.");
  } catch (error) {
    console.error("Error during auto clock-out:", error);
  }
};

// Run the auto clock-out daily at 6:00 PM
cron.schedule("0 18 * * *", () => {
  autoClockOut("UTC"); // Adjust timezone as needed
});

// Get all the clock data of the workers
exports.getAllClockData = async (req, res) => {
  try {
    const workers = await WorkerClock.find({});
    res.json(workers);
  } catch (error) {
    console.error("Get Clock Data Error:", error); // Log the error for debugging
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getEarliestClockInDate = async (req, res) => {
  try {
    const earliestClockInRecord = await WorkerClock.find({})
      .sort({ "clockIns.clockInTime": 1 })
      .limit(1)
      .select("clockIns.clockInTime");

    if (earliestClockInRecord.length > 0) {
      // Extract the earliest clockInTime and format it using moment
      const earliestClockInTime =
        earliestClockInRecord[0].clockIns[0].clockInTime;
      const formattedDate = moment(earliestClockInTime).format(
        "YYYY-MM-DD HH:mm:ss"
      );

      res.json({ earliestClockInDate: formattedDate });
    } else {
      res.status(404).json({ message: "No clock-in records found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.autoClockOutEndpoint = async (req, res) => {
  try {
    await autoClockOut("UTC"); // Adjust timezone as needed
    res.json({ message: "Auto clock-out completed successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error during auto clock-out.", error });
  }
};
