// scripts/check-block-totals.js
//
// Check that each block's total vines matches the sum of the worker-level
// piecework totals attributed to that block.
//
//   - Block side: sum of rows[].stock_count across Block documents.
//   - Worker side: sum of rows[].stock_count across PieceworkWorker documents,
//     grouped by block_name (fast piecework totals per worker per block).
//
// Reports per-block totals, the worker-side sum, and any mismatch.
//
// Usage:
//   node scripts/check-block-totals.js            # report only (default)
//   node scripts/check-block-totals.js --apply   # (reserved for future auto-fix)

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./.env" });

const PieceworkWorker = require("../models/PieceworkWorker");
const Worker = require("../models/Worker");
const { resolveMongoUri, resolveDatabaseName } = require("../config/db");

function normBlockName(name) {
  return String(name || "").trim();
}

async function main() {
  const uri = resolveMongoUri();
  if (!uri) throw new Error("MONGO_URI is missing.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  console.log(`=== Block totals vs worker totals realignment check (${resolveDatabaseName()}) ===`);

  const blockDocs = await mongoose.connection.db.collection("blocks").find({}).toArray();
  const blockTotals = {};
  const blockDetails = {};

  blockDocs.forEach((b) => {
    const name = normBlockName(b.block_name);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const total = rows.reduce((s, r) => s + (Number(r?.stock_count) || 0), 0);
    blockTotals[name] = (blockTotals[name] || 0) + total;
    if (!blockDetails[name]) blockDetails[name] = { rows: rows.length, total, totalStocks: Number(b.total_stocks) || 0 };
    else blockDetails[name].rows += rows.length, blockDetails[name].total += total;
  });

  const pieceworkWorkers = await PieceworkWorker.find().lean();
  const workerBlockSums = {};

  pieceworkWorkers.forEach((p) => {
    (p.blocks || []).forEach((b) => {
      const blockName = normBlockName(b.block_name);
      let sum = 0;
      (b.rows || []).forEach((r) => {
        sum += Number(r?.stock_count) || 0;
      });
      if (sum > 0) {
        workerBlockSums[blockName] = (workerBlockSums[blockName] || 0) + sum;
      }
    });
  });

  const blockNames = [...new Set([...Object.keys(blockTotals), ...Object.keys(workerBlockSums)])].sort();

  console.log(`\nBlocks found: ${blockNames.length}\n`);
  const mismatches = [];
  let grandBlockTotal = 0;
  let grandWorkerTotal = 0;

  blockNames.forEach((name) => {
    const blockTotal = blockTotals[name] || 0;
    const workerTotal = workerBlockSums[name] || 0;
    const diff = blockTotal - workerTotal;
    grandBlockTotal += blockTotal;
    grandWorkerTotal += workerTotal;

    const status = Math.abs(diff) < 0.5 ? "OK" : "MISMATCH";
    if (Math.abs(diff) >= 0.5) {
      mismatches.push({ block: name, blockTotal, workerTotal, diff });
    }

    console.log(
      `[${status}] ${name}: block total=${blockTotal} | worker totals=${workerTotal} | diff=${diff}`
    );
  });

  console.log(`\nGrand totals -> blocks: ${grandBlockTotal} | workers: ${grandWorkerTotal} | diff=${grandBlockTotal - grandWorkerTotal}`);

  console.log(`\n${mismatches.length ? "MISMATCHES FOUND: " + mismatches.length : "No mismatches found. All block totals match the worker totals."}`);

  if (mismatches.length) {
    console.log("\nPer-block mismatch detail:");
    mismatches.forEach((m) => {
      console.log(`  - ${m.block}: block=${m.blockTotal} worker=${m.workerTotal} diff=${m.diff}`);
    });
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
