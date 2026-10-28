const cron = require("node-cron");
const moment = require("moment-timezone");
const WorkerClock = require("../models/WorkerClock");

// Add a new clock-in entry for a worker
exports.addClockIn = async (req, res) => {
  const {
    workerID,
    workerName,
    timezone = "Africa/Johannesburg",
    clockInAt,
  } = req.body;

  try {
    // Find the worker's record or create a new one if not found
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

    let clockInTime;
    if (clockInAt) {
      clockInTime = moment(clockInAt).tz(timezone);
      if (!clockInTime.isValid()) {
        return res.status(400).json({ message: "Invalid clock-in time." });
      }
    } else {
      const now = moment().tz(timezone);
      const defaultClockInTime = moment.tz({ hour: 7, minute: 30 }, timezone);

      if (now.isBefore(defaultClockInTime)) {
        clockInTime = defaultClockInTime;
      } else if (
        now.isAfter(defaultClockInTime) &&
        now.diff(defaultClockInTime, "minutes") <= 10
      ) {
        clockInTime = defaultClockInTime;
      } else {
        clockInTime = now;
      }
    }

    const activeSessionForDate = worker.clockIns.find(
      (session) =>
        !session.clockOutTime &&
        moment(session.clockInTime)
          .tz(timezone)
          .isSame(clockInTime, "day")
    );

    if (activeSessionForDate) {
      return res.status(400).json({
        message: `Worker ${workerName} is already clocked in for this date. Please clock out first.`,
      });
    }

    // Add the clock-in entry
    worker.clockIns.push({
      clockInTime: clockInTime.toDate(),
      day: clockInTime.format("dddd"), // Store the day of the week
    });

    // Save the worker's clock-in data
    await worker.save();

    res.status(201).json({
      message: `Clock-in entry added successfully for ${workerName}.`,
      clockInTime: clockInTime.format("YYYY-MM-DD HH:mm:ss"), // Return formatted time
      session: worker.clockIns[worker.clockIns.length - 1].toObject(),
    });
  } catch (error) {
    console.error("Error during clock-in:", error);
    res.status(500).json({ message: "Server error", error });
  }
};
// Clock-out a worker
exports.addClockOut = async (req, res) => {
  const {
    workerID,
    workerName,
    timezone = "UTC",
    sessionID,
    clockOutAt,
  } = req.body;

  try {
    const worker = await WorkerClock.findOne({ workerID });

    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const now = clockOutAt
      ? moment(clockOutAt).tz(timezone)
      : moment().tz(timezone);
    if (!now.isValid()) {
      return res.status(400).json({ message: "Invalid clock-out time." });
    }

    const currentSession = sessionID
      ? worker.clockIns.id(sessionID)
      : worker.clockIns.find(
          (session) =>
            !session.clockOutTime &&
            moment(session.clockInTime).tz(timezone).isSame(now, "day")
        );

    if (!currentSession || currentSession.clockOutTime) {
      return res
        .status(400)
        .json({ message: `Worker ${workerName || worker.workerName} is not clocked in.` });
    }

    const officialClockOutTime = now
      .clone()
      .hour(17)
      .minute(30)
      .second(0)
      .millisecond(0);

    // Ensure the clock-out time is set to 17:30 if current time is after 17:30
    currentSession.clockOutTime = now.isAfter(officialClockOutTime)
      ? officialClockOutTime.toDate()
      : now.toDate();

    // Calculate the duration excluding lunch break between 12:00 PM and 1:00 PM
    const clockInTime = moment(currentSession.clockInTime).tz(timezone);
    const clockOutTime = moment(currentSession.clockOutTime).tz(timezone);

    let duration = Math.max(0, clockOutTime.diff(clockInTime, "hours", true));

    const lunchStart = moment
      .tz(clockInTime, timezone)
      .set({ hour: 12, minute: 0 });
    const lunchEnd = moment
      .tz(clockInTime, timezone)
      .set({ hour: 13, minute: 0 });

    // Deduct lunch break if applicable
    if (
      clockOutTime.isAfter(clockInTime) &&
      clockInTime.isBefore(lunchEnd) &&
      clockOutTime.isAfter(lunchStart)
    ) {
      const overlapStart = moment.max(clockInTime, lunchStart);
      const overlapEnd = moment.min(clockOutTime, lunchEnd);
      const overlapDuration = overlapEnd.diff(overlapStart, "hours", true);
      duration = Math.max(0, duration - overlapDuration);
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
      session: currentSession.toObject(),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Function to auto clock-out workers
const autoClockOut = async (timezone = "Africa/Johannesburg") => {
  try {
    const workers = await WorkerClock.find({});

    const now = moment().tz(timezone);

    for (const worker of workers) {
      // Find all sessions without clockOutTime
      const unclockedSessions = worker.clockIns.filter(
        (session) => !session.clockOutTime
      );

      for (const session of unclockedSessions) {
        const clockInTime = moment(session.clockInTime).tz(timezone);
        if (clockInTime.isAfter(now)) continue;
        const sessionOfficialClockOut = clockInTime
          .clone()
          .hour(17)
          .minute(30)
          .second(0)
          .millisecond(0);
        let clockOutTime = now.isAfter(sessionOfficialClockOut)
          ? sessionOfficialClockOut
          : now;

        // Ensure lunch break deduction if applicable
        let duration = Math.max(0, clockOutTime.diff(clockInTime, "hours", true));

        const lunchStart = moment
          .tz(clockInTime, timezone)
          .set({ hour: 12, minute: 0 });
        const lunchEnd = moment
          .tz(clockInTime, timezone)
          .set({ hour: 13, minute: 0 });

        if (
          clockOutTime.isAfter(clockInTime) &&
          clockInTime.isBefore(lunchEnd) &&
          clockOutTime.isAfter(lunchStart)
        ) {
          const overlapStart = moment.max(clockInTime, lunchStart);
          const overlapEnd = moment.min(clockOutTime, lunchEnd);
          const overlapDuration = overlapEnd.diff(overlapStart, "hours", true);
          duration = Math.max(0, duration - overlapDuration);
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

// Schedule auto clock-out for 17:30 SAST (15:30 UTC)

cron.schedule("30 15 * * *", () => {
  const now = moment().tz("Africa/Johannesburg").format("YYYY-MM-DD HH:mm:ss");
  console.log(`Cron job triggered at ${now} (SAST). Executing auto clock-out.`);
  autoClockOut("Africa/Johannesburg");
});

// Manual endpoint for testing the auto clock-out function
exports.autoClockOutEndpoint = async (req, res) => {
  try {
    await autoClockOut("Africa/Johannesburg");
    res.json({ message: "Auto clock-out completed successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error during auto clock-out.", error });
  }
};

exports.updateClockSession = async (req, res) => {
  const { workerID, sessionID } = req.params;
  const { field, time } = req.body || {};
  const timezone = "Africa/Johannesburg";

  if (!["clockInTime", "clockOutTime"].includes(field)) {
    return res.status(400).json({ message: "Choose a valid clock time to edit." });
  }
  const editedTime = moment(time, moment.ISO_8601, true);
  if (!time || !editedTime.isValid()) {
    return res.status(400).json({ message: "Enter a valid clock time." });
  }

  try {
    const worker = await WorkerClock.findOne({ workerID });
    if (!worker) {
      return res.status(404).json({ message: "Worker clock record not found." });
    }

    const session = worker.clockIns.id(sessionID);
    if (!session) {
      return res.status(404).json({ message: "Clock session not found." });
    }
    if (field === "clockOutTime" && !session.clockInTime) {
      return res.status(400).json({ message: "Clock in before editing clock out." });
    }

    session[field] = editedTime.toDate();
    session.day = moment(session.clockInTime).tz(timezone).format("dddd");

    const workedHoursPerDay = {
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
      Monday: 0,
      Tuesday: 0,
    };
    let totalWorkedHours = 0;

    worker.clockIns.forEach((entry) => {
      if (!entry.clockInTime || !entry.clockOutTime) {
        entry.duration = undefined;
        return;
      }

      const clockInTime = moment(entry.clockInTime).tz(timezone);
      const clockOutTime = moment(entry.clockOutTime).tz(timezone);
      let duration = Math.max(0, clockOutTime.diff(clockInTime, "hours", true));
      const lunchStart = clockInTime.clone().hour(12).minute(0).second(0);
      const lunchEnd = clockInTime.clone().hour(13).minute(0).second(0);

      if (
        clockOutTime.isAfter(clockInTime) &&
        clockInTime.isBefore(lunchEnd) &&
        clockOutTime.isAfter(lunchStart)
      ) {
        const overlapStart = moment.max(clockInTime, lunchStart);
        const overlapEnd = moment.min(clockOutTime, lunchEnd);
        duration = Math.max(
          0,
          duration - overlapEnd.diff(overlapStart, "hours", true)
        );
      }

      entry.duration = duration;
      const day = clockInTime.format("dddd");
      if (Object.prototype.hasOwnProperty.call(workedHoursPerDay, day)) {
        workedHoursPerDay[day] += duration;
      }
      totalWorkedHours += duration;
    });

    worker.workedHoursPerDay = workedHoursPerDay;
    worker.totalWorkedHours = totalWorkedHours;
    await worker.save();
    res.json({
      message: "Attendance time updated successfully.",
      session: session.toObject(),
    });
  } catch (error) {
    console.error("Error updating attendance time:", error);
    res.status(500).json({ message: "Failed to update attendance time." });
  }
};
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

/**
 * GET workers by a dynamic range of IDs
 */
exports.getWorkersByIDs = async (req, res) => {
  const { minID, maxID } = req.query;

  console.log("Received minID:", minID, "maxID:", maxID); // Debug query parameters

  if (!minID || !maxID) {
    return res.status(400).json({
      message: "Please provide both minID and maxID query parameters.",
    });
  }

  try {
    // Ensure minID and maxID are numbers
    const min = parseInt(minID, 10);
    const max = parseInt(maxID, 10);

    if (isNaN(min) || isNaN(max)) {
      return res.status(400).json({
        message: "minID and maxID must be valid numbers.",
      });
    }

    const workers = await WorkerClock.find({
      workerID: {
        $gte: min,
        $lte: max,
      },
    });

    if (workers.length === 0) {
      return res
        .status(404)
        .json({ message: "No workers found in the specified range." });
    }

    res.status(200).json({
      message: "Workers retrieved successfully",
      data: workers,
    });
  } catch (error) {
    console.error("Error fetching workers:", error); // Log full error details
    res.status(500).json({
      message: "Server error",
      error: error.message || "Unknown error", // Send meaningful error message
    });
  }
};

// filter the workers from

// exports.autoClockOutEndpoint = async (req, res) => {
//   try {
//     await autoClockOut("UTC"); // Adjust timezone as needed
//     res.json({ message: "Auto clock-out completed successfully." });
//   } catch (error) {
//     res
//       .status(500)
//       .json({ message: "Server error during auto clock-out.", error });
//   }
// };
