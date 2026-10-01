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
  const legacy = indexes.find(
    (index) =>
      index.unique === true &&
      index.key.workerID === 1 &&
      index.key.date === 1 &&
      Object.keys(index.key).length === 2
  );

  if (legacy) {
    await collection.dropIndex(legacy.name);
    console.log(`Removed legacy index: ${legacy.name}`);
  }

  await collection.createIndex(
    { workerID: 1, date: 1, recordedBy: 1 },
    { unique: true, name: "workerID_1_date_1_recordedBy_1" }
  );
  console.log("Created supervisor-specific day-hours index.");
}

run()
  .catch((error) => {
    console.error("Day-hours index migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
