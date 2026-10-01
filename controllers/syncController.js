const Worker = require("../models/Worker");
const { resolveScope } = require("../utils/supervisorScope");

exports.syncClockIns = async (req, res) => {
  const syncPayload = req.body; // Expecting an array of clock-in entries
  const results = [];
  const supervisor = resolveScope(req).supervisorName || "";

  for (const entry of syncPayload) {
    const { worker_id, blockId, row, jobType, clockInTime, deviceId, syncId } =
      entry;
    const workerId = worker_id; // �o. Fix: map incoming field

    try {
      const alreadyExists = await Worker.findOne({
        workerID: workerId,
        "syncLogs.syncId": syncId,
      });

      if (alreadyExists) {
        results.push({ syncId, status: "duplicate" });
        continue;
      }

      const update = {
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
      };

      // Record the supervisor so a replayed offline check-in still counts
      // towards their crew.
      if (supervisor) {
        update.$set.supervisor = supervisor;
      }

      await Worker.findOneAndUpdate(
        { workerID: workerId },
        update,
        {
          upsert: true,
          new: true,
          strict: false, // �o. Allow saving fields not in schema
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
