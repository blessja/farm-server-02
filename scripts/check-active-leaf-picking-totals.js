// scripts/check-active-leaf-picking-totals.js
//
// Cross-check currently ACTIVE fast-job check-ins (leaf picking focus) against
// the numbers held in the database:
//   - Active check-ins come from Block rows (active_jobs entries and
//     worker_id + start_time rows).
//   - Worker totals come from Worker.piecework_stock_count / PieceworkWorker.
//   - Block totals come from Block.rows[].stock_count sums.
//
// Reports, per active leaf-picking check-in:
//   - check-in details (worker, block, row, job, vines, remaining)
//   - worker stored vs expected totals
//   - block total vs worker-side sum
//
// Usage:
//   node scripts/check-active-leaf-picking-totals.js

const mongoose = require("mongoose");
const PieceworkWorker = require("../models/PieceworkWorker");
const Worker = require("../models/Worker");
const Block = require("../models/Block");
const { resolveMongoUri, resolveDatabaseName } = require("../config/db");

require("dotenv").config({ path: "./.env" });

const FAST_JOB_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];
const LEAF_PICKING = "LEAF PICKING";

function normBlockName(name) {
  return String(name || "").trim();
}

function normJobType(jobType) {
  return String(jobType || "").trim().toUpperCase();
}

async function main() {
  const uri = resolveMongoUri();
  if (!uri) throw new Error("MONGO_URI is missing.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const blocks = await Block.find().lean();
  const pieceworkWorkers = await PieceworkWorker.find().lean();
  const workers = await Worker.find().lean();

  // Worker totals: stored vs expected (sum of fast-job rows)
  const workerMap = {};
  workers.forEach((w) => {
    const expected = (w.blocks || []).reduce(
      (s, b) =>
        s +
        (b.rows || []).reduce(
          (acc, r) => acc + (FAST_JOB_TYPES.includes(normJobType(r.job_type)) ? Number(r.stock_count) || 0 : 0),
          0
        ),
      0
    );
    workerMap[String(w.workerID)] = {
      name: w.name,
      stored: Number(w.piecework_stock_count) || 0,
      expected,
      blockSums: (w.blocks || []).reduce((acc, b) => {
        const blockTotal = (b.rows || []).reduce(
          (s, r) => s + (FAST_JOB_TYPES.includes(normJobType(r.job_type)) ? Number(r.stock_count) || 0 : 0),
          0
        );
        return acc + blockTotal;
      }, 0),
    };
  });

  // PieceworkWorker totals
  const pwMap = {};
  pieceworkWorkers.forEach((p) => {
    const total = (p.blocks || []).reduce(
      (s, b) => s + (b.rows || []).reduce((acc, r) => acc + Number(r.stock_count) || 0, 0),
      0
    );
    pwMap[String(p.workerID)] = { name: "", stored: total, expected: total };
  });

  // Block totals
  const blockTotals = {};
  blocks.forEach((b) => {
    const name = normBlockName(b.block_name);
    const total = (b.rows || []).reduce((s, r) => s + Number(r.stock_count) || 0, 0);
    blockTotals[name] = (blockTotals[name] || 0) + total;
  });

  // Active check-ins (fast jobs)
  const activeCheckins = [];
  blocks.forEach((b) => {
    (b.rows || []).forEach((r) => {
      (r.active_jobs || []).forEach((j) => {
        if (FAST_JOB_TYPES.includes(normJobType(j.job_type))) {
          activeCheckins.push({
            blockName: b.block_name,
            job_type: normJobType(j.job_type),
            rowNumber: r.row_number,
            workerID: j.worker_id,
            workerName: j.worker_name,
            vines: r.stock_count,
            remaining: j.remaining_stock ?? r.remaining_stock_count ?? r.stock_count,
            startTime: j.start_time,
            source: "active_jobs",
          });
        }
      });
      if (
        (!r.active_jobs || r.active_jobs.length === 0) &&
        r.worker_id &&
        r.start_time &&
        !r.time_spent &&
        FAST_JOB_TYPES.includes(normJobType(r.job_type))
      ) {
        activeCheckins.push({
          blockName: b.block_name,
          job_type: normJobType(r.job_type),
          rowNumber: r.row_number,
          workerID: r.worker_id,
          workerName: r.worker_name,
          vines: r.stock_count,
          remaining: r.remaining_stock_count || r.stock_count,
          startTime: r.start_time,
          source: "row_worker",
        });
      }
    });
  });

  console.log(`=== Active fast-job check-ins vs DB totals (${resolveDatabaseName()}) ===`);
  console.log(`Active fast check-ins found: ${activeCheckins.length}`);
  const leafCheckins = activeCheckins.filter((c) => c.job_type === LEAF_PICKING);
  console.log(`Active LEAF PICKING check-ins: ${leafCheckins.length}`);

  const problems = [];

  const reportCheckin = (c) => {
    const wt = workerMap[String(c.workerID)] || { name: c.workerName, stored: 0, expected: 0 };
    const pw = pwMap[String(c.workerID)] || { stored: 0, expected: 0 };
    const blockTotal = blockTotals[normBlockName(c.blockName)] || 0;
    const workerExpectedForBlock = (workers.find((w) => String(w.workerID) === String(c.workerID)) || { blocks: [] }).blocks?.reduce(
      (acc, b) =>
        acc +
        (b.rows || []).reduce(
          (s, r) => s + (FAST_JOB_TYPES.includes(normJobType(r.job_type)) ? Number(r.stock_count) || 0 : 0),
          0
        ),
      0
    );

    console.log(`\n--- Check-in: ${c.job_type} ---`);
    console.log(`  source=${c.source} block=${c.blockName} row=${c.rowNumber} worker=${c.workerID} (${c.workerName})`);
    console.log(`  check-in vines=${c.vines} remaining=${c.remaining} startTime=${c.startTime}`);

    const workerStored = wt.stored;
    const workerExpected = wt.expected;
    const workerOk = Math.abs(workerStored - workerExpected) < 0.5;
    console.log(`  worker totals: stored=${workerStored} expected=${workerExpected} ${workerOk ? "OK" : "MISMATCH"}`);

    const blockVsWorker = blockTotal - workerExpectedForBlock;
    console.log(`  block total=${blockTotal} worker-expected-for-block=${workerExpectedForBlock} diff=${blockVsWorker} ${Math.abs(blockVsWorker) < 0.5 ? "OK" : "MISMATCH"}`);

    if (!workerOk || Math.abs(blockVsWorker) >= 0.5 || Number(c.vines) > Number(c.remaining)) {
      problems.push({ ...c, workerStored, workerExpected, blockTotal, workerExpectedForBlock });
    }
  };

  activeCheckins.forEach(reportCheckin);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Active check-ins checked: ${activeCheckins.length} (leaf picking: ${leafCheckins.length})`);
  console.log(`Problems found: ${problems.length}`);
  problems.forEach((p) => {
    console.log(`  - ${p.job_type} block=${p.blockName} row=${p.rowNumber} worker=${p.workerID} (${p.workerName}) vines=${p.vines}`);
  });

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
