// scripts/fix-totals-duplicates.js
//
// One-time maintenance script: finds duplicate totals entries in the workers
// collection and merges them.
//
// "Duplicate" = the same worker, block, row number, job type (after trim +
// uppercase) AND the same calendar day appears more than once. Such entries are
// caused by past checkout bugs / inconsistent job-type spelling; identical work
// should live in a single entry with summed stock_count and time_spent.
//
// Usage:
//   node scripts/fix-totals-duplicates.js            # dry-run, reports only
//   node scripts/fix-totals-duplicates.js --apply    # backs up, then merges
//
// The Worker pre("save") hook recomputes total_stock_count / piecework_stock_count,
// so totals are recalculated automatically after merging.

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./.env" });

const Worker = require("../models/Worker");
const Block = require("../models/Block");
const { resolveMongoUri } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "backups");

const FAST_JOB_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];

function isRegular(jobType) {
  return !FAST_JOB_TYPES.includes(normJobType(jobType));
}

function normJobType(jobType) {
  const clean = String(jobType || "").trim().toUpperCase();
  return clean || "UNKNOWN";
}

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

  const workers = await Worker.find();

  // One row's capacity in a block = block.total_stocks / block.total_rows. A
  // regular entry counting more than that is the signature of the old double
  // count, which credited the row's stock into the same entry a second time.
  const blocks = await Block.find(
    {},
    { block_name: 1, total_stocks: 1, total_rows: 1 }
  ).lean();
  const blockInfo = {};
  blocks.forEach((b) => {
    if (b.total_rows > 0) {
      blockInfo[b.block_name] = {
        capacityPerRow: Math.round(b.total_stocks / b.total_rows),
        totalStocks: b.total_stocks,
        totalRows: b.total_rows,
      };
    }
  });

  const clusters = [];
  const suspected = [];

  workers.forEach((worker) => {
    worker.blocks.forEach((block) => {
      const byKey = new Map();
      block.rows.forEach((row, index) => {
        const key = [
          String(block.block_name),
          String(row.row_number),
          normJobType(row.job_type),
          dateKey(row.date),
        ].join("|");
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(index);
      });

      byKey.forEach((indexes) => {
        if (indexes.length > 1) {
          const rows = indexes
            .sort((a, b) => a - b)
            .map((i) => ({
              index: i,
              stock_count: block.rows[i].stock_count || 0,
              time_spent: block.rows[i].time_spent || 0,
            }));
          clusters.push({ worker, block, indexes: rows.map((r) => r.index), rows });
        }
      });

      const info = blockInfo[block.block_name];
      block.rows.forEach((row) => {
        if (!info || !isRegular(row.job_type)) return;
        const stock = row.stock_count || 0;
        if (stock > info.capacityPerRow) {
          suspected.push({
            worker,
            block,
            row,
            capacityPerRow: info.capacityPerRow,
            overCount: stock - info.capacityPerRow,
          });
        }
      });
    });
  });

  console.log(
    `\nTotals duplicate scan: ${workers.length} worker record(s), ${clusters.length} duplicate cluster(s) found.\n`
  );

  clusters.forEach((cluster, i) => {
    const template = cluster.block.rows[cluster.indexes[0]];
    const mergedStock = cluster.rows.reduce((sum, r) => sum + r.stock_count, 0);
    const mergedTime = cluster.rows.reduce((sum, r) => sum + r.time_spent, 0);
    const parts = cluster.rows
      .map((r) => `${r.stock_count} vines/${Math.round(r.time_spent)}min`)
      .join(" + ");
    console.log(
      `[${i + 1}] ${cluster.worker.workerID} ${cluster.worker.name || ""} ` +
        `| block ${cluster.block.block_name} | row ${template.row_number} ` +
        `| ${normJobType(template.job_type)} | ${dateKey(template.date)} ` +
        `| ${cluster.rows.length} entries (${parts}) -> merge to ${mergedStock} vines/${Math.round(mergedTime)}min`
    );
  });

  if (clusters.length === 0 && suspected.length === 0) {
    console.log("Nothing to fix. No duplicates and no over-counted entries.\n");
    await mongoose.disconnect();
    return;
  }

  console.log("\n── Suspected over-counted regular entries ──");
  console.log(
    "Entries counting more than one row's capacity (total_stocks / total_rows). " +
      "These are likely double-counted by the old checkout bug and need manual confirmation:\n"
  );
  suspected.forEach((s, i) => {
    console.log(
      `[S${i + 1}] ${s.worker.workerID} ${s.worker.name || ""} ` +
        `| block ${s.block.block_name} | row ${s.row.row_number} | ${normJobType(s.row.job_type)} | ${dateKey(s.row.date)} ` +
        `| recorded ${s.row.stock_count} vines / ${Math.round(s.row.time_spent)}min ` +
        `| capacity ${s.capacityPerRow} => likely ${s.overCount} vines over-counted`
    );
  });

  if (!APPLY) {
    console.log(
      `\nDRY RUN — no changes made. ${suspected.length} over-counted entry(ies) could be corrected, ` +
        `${clusters.length} duplicate cluster(s) could be merged.`
    );
    console.log("Re-run with `--apply` to merge/correct and save.\n");
    await mongoose.disconnect();
    return;
  }

  const backupFile = path.join(BACKUP_DIR, `workers-backup-${Date.now()}.json`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(backupFile, JSON.stringify(await Worker.find().lean(), null, 2));
  console.log(`\nBackup written to ${backupFile}`);

  for (const cluster of clusters) {
    const rows = cluster.block.rows;
    const keepIndex = cluster.indexes[0];
    const firstRow = rows[keepIndex];
    const mergedStock = cluster.rows.reduce((sum, r) => sum + r.stock_count, 0);
    const mergedTime = cluster.rows.reduce((sum, r) => sum + r.time_spent, 0);

    firstRow.stock_count = mergedStock;
    firstRow.time_spent = mergedTime;

    cluster.indexes.slice(1).forEach((idx) => {
      rows[idx] = null;
    });

    await cluster.worker.save();

    console.log(
      `Merged ${cluster.worker.workerID}: block ${cluster.block.block_name}, ` +
        `row ${firstRow.row_number} (${normJobType(firstRow.job_type)}, ${dateKey(firstRow.date)}) ` +
        `-> ${mergedStock} vines / ${Math.round(mergedTime)} min`
    );
  }

  for (const s of suspected) {
    s.row.stock_count = s.capacityPerRow;
    await s.worker.save();
    console.log(
      `Corrected ${s.worker.workerID}: block ${s.block.block_name}, row ${s.row.row_number} ` +
        `(${normJobType(s.row.job_type)}, ${dateKey(s.row.date)}) ` +
        `-> ${s.row.stock_count} vines (removed ${s.overCount} over-counted; time_spent left unchanged)`
    );
  }

  const summaryParts = [];
  if (clusters.length) summaryParts.push(`${clusters.length} duplicate cluster(s) merged`);
  if (suspected.length) summaryParts.push(`${suspected.length} over-counted entry(ies) corrected`);
  console.log(`\nDone. ${summaryParts.join("; ") || "No changes applied."}`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });