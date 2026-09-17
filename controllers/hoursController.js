// controllers/hoursController.js
const WorkerDayHours = require("../models/WorkerDayHours");

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
  try {
    const hours = await WorkerDayHours.find({}).lean();
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

  try {
    const entry = await WorkerDayHours.findOneAndUpdate(
      { workerID: cleanID, date: cleanDate },
      {
        $set: {
          workerID: cleanID,
          workerName: typeof workerName === "string" ? workerName.trim() : "",
          date: cleanDate,
          hours: parsedHours,
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

exports.deleteDayHours = async (req, res) => {
  const { workerID, date } = req.body || {};
  const cleanDate = normalizeDate(date);
  const cleanID = typeof workerID === "string" ? workerID.trim() : "";

  if (!cleanID || !cleanDate) {
    return res
      .status(400)
      .json({ message: "Worker ID and a valid date are required." });
  }

  try {
    await WorkerDayHours.deleteOne({ workerID: cleanID, date: cleanDate });
    res.json({ message: "Day hours cleared." });
  } catch (error) {
    console.error("Error clearing day hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};