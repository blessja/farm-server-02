require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const WorkerDayHours = require("../models/WorkerDayHours");

async function run() {
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection was not established.");
  }

  const collection = WorkerDayHours.collection;
  const indexes = await collection.indexes();
  const legacyIndexes = indexes.filter(
    (index) =>
      index.unique === true &&
      index.key.workerID === 1 &&
      index.key.date === 1 &&
      Object.keys(index.key).length === 2
  );

  const duplicateSupervisorKeys = await collection
    .aggregate([
      {
        $group: {
          _id: {
            workerID: "$workerID",
            date: "$date",
            recordedBy: "$recordedBy",
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 10 },
    ])
    .toArray();

  if (duplicateSupervisorKeys.length > 0) {
    throw new Error(
      `Cannot create supervisor-specific day-hours index: duplicate worker/date/supervisor records exist (${duplicateSupervisorKeys
        .map(
          ({ _id, count }) =>
            `${_id.workerID}/${_id.date}/${_id.recordedBy || "(none)"} x${count}`
        )
        .join(", ")}). Resolve these records before migrating.`
    );
  }

  await collection.createIndex(
    { workerID: 1, date: 1, recordedBy: 1 },
    { unique: true, name: "workerID_1_date_1_recordedBy_1" }
  );
  console.log("Created supervisor-specific day-hours index.");

  for (const legacy of legacyIndexes) {
    await collection.dropIndex(legacy.name);
    console.log(`Removed legacy index: ${legacy.name}`);
  }
}

run()
  .catch((error) => {
    console.error("Day-hours index migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
