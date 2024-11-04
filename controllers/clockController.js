const WorkerClock = require("../models/WorkerClock");

// Monitor clock-ins to find workers who have not clocked out
exports.monitorClockIns = async (req, res) => {
  try {
    // Find all workers
    const workers = await WorkerClock.find();

    // Filter workers who have at least one session with no clockOutTime
    const workersWithUnclockedSessions = workers
      .map((worker) => {
        const unclockedSessions = worker.clockIns.filter(
          (session) => !session.clockOutTime
        );
        if (unclockedSessions.length > 0) {
          return {
            workerID: worker.workerID,
            workerName: worker.workerName,
            unclockedSessions: unclockedSessions,
          };
        }
      })
      .filter(Boolean); // Remove undefined workers (those who have no unclocked sessions)

    if (workersWithUnclockedSessions.length === 0) {
      return res.status(200).json({ message: "All workers have clocked out." });
    }

    res.status(200).json({ workersWithUnclockedSessions });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
