const Worker = require("../models/Worker");

exports.syncClockIns = async (req, res) => {
  const syncPayload = req.body; // Expecting an array of clock-in entries
  const results = [];

  for (const entry of syncPayload) {
    const { worker_id, blockId, row, jobType, clockInTime, deviceId, syncId } =
      entry;
    const workerId = worker_id; // ✅ Fix: map incoming field

    try {
      const alreadyExists = await Worker.findOne({
        worker_id,
        "syncLogs.syncId": syncId,
      });

      if (alreadyExists) {
        results.push({ syncId, status: "duplicate" });
        continue;
      }

      const updatedWorker = await Worker.findOneAndUpdate(
        { worker_id: workerId }, // ✅ Now workerId is defined
        {
          $set: {
            isClockedIn: true,
            currentBlock: blockId,
            currentRow: row,
            jobType,
            clockInTime: new Date(clockInTime),
          },
          $push: {
            syncLogs: {
              syncId,
              deviceId,
              type: "clockIn",
              time: new Date(clockInTime),
            },
          },
        },
        {
          upsert: true,
          new: true,
          strict: false, // ✅ Allow saving fields not in schema
        }
      );

      results.push({ syncId, status: "success" });
    } catch (err) {
      console.error("Sync Error:", err);
      results.push({ syncId, status: "error", error: err.message });
    }
  }

  res.status(207).json(results); // 207 = Multi-Status
};
