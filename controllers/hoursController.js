// controllers/hoursController.js
const WorkerDayHours = require("../models/WorkerDayHours");
const {
  resolveScope,
  rejectBlockedScope,
  dayHoursScopeFilter,
} = require("../utils/supervisorScope");

// Supervisor entering the hours. Empty when auth is off, which keeps the
// worker's crew unresolved rather than silently attributing it to someone.
function recorderName(req) {
  return resolveScope(req).supervisorName || "";
}

function normalizeDate(dateStr) {
  if (typeof dateStr !== "string") return "";
  const parts = dateStr.trim().split("-");
  if (parts.length === 3) {
    const y = parts[0].padStart(4, "0");
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

function parseHours(rawHours) {
  const value = Number(rawHours);
  if (typeof rawHours === "string" && rawHours.trim() === "") return null;
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

exports.getDayHours = async (req, res) => {
  const scope = resolveScope(req);
  if (scope.scope === "blocked") {
    return rejectBlockedScope(res, scope);
  }

  try {
    const hours = await WorkerDayHours.find(
      scope.scope === "all" ? {} : dayHoursScopeFilter(scope.supervisorName)
    ).lean();

    res.json(hours.map((entry) => ({
      workerID: entry.workerID,
      workerName: entry.workerName,
      date: entry.date,
      hours: entry.hours,
    })));
  } catch (error) {
    console.error("Error fetching day hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.saveDayHours = async (req, res) => {
  const { workerID, workerName, date, hours } = req.body || {};

  const cleanDate = normalizeDate(date);
  const cleanID = typeof workerID === "string" ? workerID.trim() : "";
  const parsedHours = parseHours(hours);

  if (!cleanID || !cleanDate) {
    return res
      .status(400)
      .json({ message: "Worker ID and a valid date are required." });
  }

  if (parsedHours === null || parsedHours < 0) {
    return res
      .status(400)
      .json({ message: "Hours must be a valid number greater than or equal to 0." });
  }

  const scope = resolveScope(req);
  if (scope.scope === "blocked") {
    return rejectBlockedScope(res, scope);
  }
  const recordedBy = recorderName(req);

  try {
    const entry = await WorkerDayHours.findOneAndUpdate(
      { workerID: cleanID, date: cleanDate, recordedBy },
      {
        $set: {
          workerID: cleanID,
          workerName: typeof workerName === "string" ? workerName.trim() : "",
          date: cleanDate,
          hours: parsedHours,
          recordedBy,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: `Hours saved for ${entry.workerName || entry.workerID} on ${cleanDate}.`,
      entry: {
        workerID: entry.workerID,
        workerName: entry.workerName,
        date: entry.date,
        hours: entry.hours,
      },
    });
  } catch (error) {
    console.error("Error saving day hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Set the same hours for a whole group of workers on a single day.
// Used when the supervisor fills a date column in the totals table.
exports.saveDayHoursBulk = async (req, res) => {
  const { date, entries } = req.body || {};

  const cleanDate = normalizeDate(date);

  if (!cleanDate) {
    return res
      .status(400)
      .json({ message: "A valid date is required." });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res
      .status(400)
      .json({ message: "No worker entries provided." });
  }

  const scope = resolveScope(req);
  if (scope.scope === "blocked") {
    return rejectBlockedScope(res, scope);
  }

  const ops = [];
  const recordedBy = recorderName(req);
  for (const entry of entries) {
    const cleanID = typeof entry?.workerID === "string" ? entry.workerID.trim() : "";
    const workerName = typeof entry?.workerName === "string" ? entry.workerName.trim() : "";

    if (entry?.hours === undefined || entry?.hours === null) {
      return res
        .status(400)
        .json({ message: `Hours are required for worker ${cleanID || "?"}.` });
    }

    const parsedHours = parseHours(entry.hours);
    if (!cleanID || parsedHours === null || parsedHours < 0) {
      return res
        .status(400)
        .json({ message: "Hours must be a valid number of worker IDs." });
    }

    ops.push({
      updateOne: {
        filter: { workerID: cleanID, date: cleanDate, recordedBy },
        update: {
          $set: {
            workerID: cleanID,
            workerName,
            date: cleanDate,
            hours: parsedHours,
            recordedBy,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) {
    return res
      .status(400)
      .json({ message: "No valid worker entries provided." });
  }

  try {
    await WorkerDayHours.bulkWrite(ops);
    res.json({
      message: `Hours saved for ${ops.length} worker(s) on ${cleanDate}.`,
    });
  } catch (error) {
    console.error("Error saving day hours (bulk):", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.deleteDayHours = async (req, res) => {
  const { workerID, date } = req.body || {};
  const cleanDate = normalizeDate(date);
  const cleanID = typeof workerID === "string" ? workerID.trim() : "";

  if (!cleanID || !cleanDate) {
    return res
      .status(400)
      .json({ message: "Worker ID and a valid date are required." });
  }

  const scope = resolveScope(req);
  if (scope.scope === "blocked") {
    return rejectBlockedScope(res, scope);
  }

  try {
    const recordedBy = recorderName(req);
    await WorkerDayHours.deleteOne({ workerID: cleanID, date: cleanDate, recordedBy });
    res.json({ message: "Day hours cleared." });
  } catch (error) {
    console.error("Error clearing day hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
