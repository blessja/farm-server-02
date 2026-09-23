const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./.env" });

const Block = require("../models/Block");
const Worker = require("../models/Worker");
const WorkerClock = require("../models/WorkerClock");
const PieceworkWorker = require("../models/PieceworkWorker");
const WorkerActivity = require("../models/WorkerActivity");
const { resolveMongoUri } = require("../config/db");

async function countActiveAssignments() {
  const blocks = await Block.find({}, { rows: 1 }).lean();

  return blocks.reduce((total, block) => {
    return total + (block.rows || []).reduce((rowTotal, row) => {
      const modernJobs = Array.isArray(row.active_jobs) ? row.active_jobs.length : 0;
      const legacyCheckin = row.worker_id && row.start_time ? 1 : 0;
      return rowTotal + modernJobs + legacyCheckin;
    }, 0);
  }, 0);
}

async function resetFreshStart() {
  const uri = resolveMongoUri();
  if (!uri) {
    throw new Error("MONGO_URI is missing. Reset was not started.");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const before = {
    workerProfiles: await Worker.countDocuments(),
    clocks: await WorkerClock.countDocuments(),
    fastPieceworkWorkers: await PieceworkWorker.countDocuments(),
    activityHistory: await WorkerActivity.countDocuments(),
    activeAssignments: await countActiveAssignments(),
  };

  if (process.argv.includes("--verify")) {
    console.log(JSON.stringify({ current: before }, null, 2));
    return;
  }

  const [regularTotals, clocks, fastTotals, activityHistory, activeAssignments] =
    await Promise.all([
      Worker.updateMany(
        {},
        {
          $set: {
            blocks: [],
            total_stock_count: 0,
            piecework_stock_count: 0,
            syncLogs: [],
          },
        }
      ),
      WorkerClock.deleteMany({}),
      PieceworkWorker.deleteMany({}),
      WorkerActivity.deleteMany({}),
      Block.updateMany(
        { rows: { $exists: true, $type: "array" } },
        {
          $set: {
            "rows.$[].worker_id": "",
            "rows.$[].worker_name": "",
            "rows.$[].start_time": null,
            "rows.$[].time_spent": 0,
            "rows.$[].job_type": "",
            "rows.$[].remaining_stock_count": null,
            "rows.$[].active_jobs": [],
          },
        }
      ),
    ]);

  const after = {
    workerProfiles: await Worker.countDocuments(),
    clocks: await WorkerClock.countDocuments(),
    fastPieceworkWorkers: await PieceworkWorker.countDocuments(),
    activityHistory: await WorkerActivity.countDocuments(),
    activeAssignments: await countActiveAssignments(),
  };

  console.log(
    JSON.stringify(
      {
        before,
        changed: {
          regularWorkerProfilesReset: regularTotals.modifiedCount,
          clockRecordsDeleted: clocks.deletedCount,
          fastPieceworkRecordsDeleted: fastTotals.deletedCount,
          activityRecordsDeleted: activityHistory.deletedCount,
          blocksWithAssignmentsCleared: activeAssignments.modifiedCount,
        },
        after,
      },
      null,
      2
    )
  );
}

resetFreshStart()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
