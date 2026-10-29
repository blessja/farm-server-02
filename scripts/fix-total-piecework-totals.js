// scripts/fix-total-piecework-totals.js
//
// One-time maintenance script: realigns `total_stock_count` (regular piecework)
// with the sum of `stock_count` values on the regular piecework rows.
//
// Expected value for `total_stock_count`:
//   - Worker documents: sum of row.stock_count over rows whose job_type is NOT
//     a fast piecework job (LEAF PICKING, SUCKER REMOVAL, SHOOT THINNING, OTHER).
//
// Usage:
//   node scripts/fix-total-piecework-totals.js            # backup + dry run, reports only
//   node scripts/fix-total-piecework-totals.js --apply    # backup, then fix + verify
//
// The Worker / PieceworkWorker pre("save") hooks recompute the totals, so any
// write through Mongoose re-saves the recalculated value; here we set the field
// explicitly via updateOne to avoid relying on hook timing.

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./.env" });

const Worker = require("../models/Worker");
const { resolveMongoUri, resolveDatabaseName } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "backups");

const FAST_JOB_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];

function normJobType(jobType) {
  return String(jobType || "").trim().toUpperCase() || "UNKNOWN";
}

function expectedRegularTotal(blocks) {
  let total = 0;
  (blocks || []).forEach((block) => {
    (block?.rows || []).forEach((row) => {
      if (FAST_JOB_TYPES.includes(normJobType(row?.job_type))) return;
      total += Number(row?.stock_count) || 0;
    });
  });
  return total;
}

function collectMismatches() {
  return Worker.find().lean().then((workers) => {
    const mismatches = [];

    workers.forEach((w) => {
      const expected = expectedRegularTotal(w.blocks);
      const stored = Number(w.total_stock_count) || 0;
      if (stored !== expected) {
        mismatches.push({
          collection: "Worker",
          workerID: String(w.workerID || ""),
          name: String(w.name || ""),
          stored,
          expected,
        });
      }
    });

    return mismatches;
  });
}

async function main() {
  const uri = resolveMongoUri();
  if (!uri) throw new Error("MONGO_URI is missing.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  console.log(`=== Regular piecework totals realignment (${resolveDatabaseName()}) ===`);

  const mismatches = await collectMismatches();

  console.log(`Scanned Worker docs. Mismatches found: ${mismatches.length}\n`);

  mismatches.forEach((m, i) => {
    console.log(
      `[${i + 1}] ${m.collection} | workerID ${m.workerID} (${m.name}) | stored total_stock_count=${m.stored} | expected=${m.expected}`
    );
  });

  if (mismatches.length === 0) {
    console.log("\nNothing to fix. All total_stock_count values match the stock_count sums.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(
      BACKUP_DIR,
      `total-piecework-totals-backup-${resolveDatabaseName()}-${stamp}.json`
    );
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = {
      database: resolveDatabaseName(),
      workers: await Worker.find().lean(),
    };
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`\nBACKUP written to ${backupFile}`);
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(
    BACKUP_DIR,
    `total-piecework-totals-backup-${resolveDatabaseName()}-${stamp}.json`
  );
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = {
    database: resolveDatabaseName(),
    workers: await Worker.find().lean(),
  };
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nBACKUP written to ${backupFile} (${fs.statSync(backupFile).size} bytes)`);

  console.log(
    `\n${APPLY ? "APPLY MODE" : "DRY RUN MODE"} - total_stock_count realignment ` +
      `${APPLY ? "will be written" : "will NOT be written"}.`
  );

  if (!APPLY) {
    console.log("Re-run with `--apply` to fix and verify.\n");
    await mongoose.disconnect();
    return;
  }

  let applied = 0;
  for (const m of mismatches) {
    const result = await Worker.updateOne(
      { workerID: m.workerID },
      { $set: { total_stock_count: m.expected } }
    );
    if (result.matchedCount === 0) {
      console.log(`  WARN: Worker ${m.workerID} not matched - skipping`);
      continue;
    }
    applied++;
    console.log(
      `  fixed Worker ${m.workerID} (${m.name}): total_stock_count ${m.stored} -> ${m.expected}`
    );
  }

  console.log(`\nApplied fixes: ${applied}/${mismatches.length}`);

  const remaining = await collectMismatches();
  console.log(`\nVERIFY: ${remaining.length} mismatch(es) remain after fix.`);
  remaining.forEach((m, i) => console.log(`  [${i + 1}] Worker ${m.workerID} stored=${m.stored} expected=${m.expected}`));

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
