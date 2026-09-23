// scripts/scan-totals-rows.js
//
// Read-only diagnostic: for every worker, lists any (block_name, row_number)
// pair that appears more than once anywhere in that worker's record — across
// duplicate blocks[] entries, different job types, or different dates. Prints
// each occurrence's date / job / stock / time so true duplicates can be
// confirmed before any cleanup.

const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./.env" });

const Worker = require("../models/Worker");
const { resolveMongoUri } = require("../config/db");

function dateKey(value) {
  if (!value) return "unknown";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "unknown";
  return d.toISOString().split("T")[0];
}

async function main() {
  const uri = resolveMongoUri();
  if (!uri) {
    throw new Error("MONGO_URI is missing.");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const workers = await Worker.find().lean();

  let flagged = 0;

  workers.forEach((worker) => {
    const groups = new Map();

    worker.blocks.forEach((block, bIdx) => {
      block.rows.forEach((row) => {
        const key = `${String(block.block_name)}|${String(row.row_number)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({
          blockIndex: bIdx,
          blockName: block.block_name,
          rowNumber: row.row_number,
          job: (row.job_type || "").trim().toUpperCase() || "UNKNOWN",
          date: dateKey(row.date),
          stock: row.stock_count || 0,
          time: Math.round(row.time_spent || 0),
        });
      });
    });

    groups.forEach((occurrences, key) => {
      if (occurrences.length > 1) {
        flagged += 1;
        console.log(`\n${worker.workerID} ${worker.name || ""} | ${key}`);
        occurrences.forEach((o, i) => {
          console.log(
            `  (${i + 1}) blockArrayIdx=${o.blockIndex} ${o.job} ${o.date} -> ${o.stock} vines / ${o.time}min`
          );
        });
      }
    });
  });

  console.log(`\nFlagged (block,row) pairs: ${flagged}`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });