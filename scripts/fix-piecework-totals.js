// scripts/fix-piecework-totals.js
//
// One-time maintenance script: realigns `piecework_stock_count` with the sum of
// `stock_count` values on the fast piecework rows.
//
// Expected value for `piecework_stock_count`:
//   - Worker documents: sum of row.stock_count over rows whose job_type is a
//     fast piecework job (LEAF PICKING, SUCKER REMOVAL, SHOOT THINNING, OTHER).
//   - PieceworkWorker documents: sum of row.stock_count over all rows (these
//     entries are created from fast piecework single scans only).
//
// Usage:
//   node scripts/fix-piecework-totals.js            # backup + dry run, reports only
//   node scripts/fix-piecework-totals.js --apply    # backup, then fix + verify
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
const PieceworkWorker = require("../models/PieceworkWorker");
const { resolveMongoUri, resolveDatabaseName } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "backups");

const FAST_JOB_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];

function normJobType(jobType) {
  return String(jobType || "").trim().toUpperCase() || "UNKNOWN";
}

function expectedFastTotal(blocks, { fastOnly }) {
  let total = 0;
  (blocks || []).forEach((block) => {
    (block?.rows || []).forEach((row) => {
      const stock = Number(row?.stock_count) || 0;
      if (!fastOnly) {
        // PieceworkWorker rows are all fast piecework entries.
        total += stock;
        return;
      }
      if (FAST_JOB_TYPES.includes(normJobType(row?.job_type))) total += stock;
    });
  });
  return total;
}

function collectMismatches() {
  const mismatches = [];

  return Worker.find().lean().then((workers) => {
    workers.forEach((w) => {
      const expected = expectedFastTotal(w.blocks, { fastOnly: true });
      const stored = Number(w.piecework_stock_count) || 0;
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

    return PieceworkWorker.find().lean().then((pieceworkWorkers) => {
      pieceworkWorkers.forEach((p) => {
        const expected = expectedFastTotal(p.blocks, { fastOnly: false });
        const stored = Number(p.piecework_stock_count) || 0;
        if (stored !== expected) {
          mismatches.push({
            collection: "PieceworkWorker",
            workerID: String(p.workerID || ""),
            name: String(p.name || ""),
            stored,
            expected,
          });
        }
      });

      return mismatches;
    });
  });
}

async function main() {
  const uri = resolveMongoUri();
  if (!uri) throw new Error("MONGO_URI is missing.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  console.log(`=== Piecework totals realignment (${resolveDatabaseName()}) ===`);

  const mismatches = await collectMismatches();

  console.log(`Scanned Worker + PieceworkWorker docs. Mismatches found: ${mismatches.length}\n`);

  mismatches.forEach((m, i) => {
    console.log(
      `[${i + 1}] ${m.collection} | workerID ${m.workerID} (${m.name}) | stored piecework_stock_count=${m.stored} | expected=${m.expected}`
    );
  });

  if (mismatches.length === 0) {
    console.log("\nNothing to fix. All piecework_stock_count values match the stock_count sums.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(
      BACKUP_DIR,
      `piecework-totals-backup-${resolveDatabaseName()}-${stamp}.json`
    );
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = {
      database: resolveDatabaseName(),
      workers: await Worker.find().lean(),
      pieceworkWorkers: await PieceworkWorker.find().lean(),
    };
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`\nBACKUP written to ${backupFile}`);
    await mongoose.disconnect();
    return;
  }

  // Backup before any write (also taken on the apply path below).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(
    BACKUP_DIR,
    `piecework-totals-backup-${resolveDatabaseName()}-${stamp}.json`
  );
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = {
    database: resolveDatabaseName(),
    workers: await Worker.find().lean(),
    pieceworkWorkers: await PieceworkWorker.find().lean(),
  };
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nBACKUP written to ${backupFile} (${fs.statSync(backupFile).size} bytes)`);

  console.log(
    `\n${APPLY ? "APPLY MODE" : "DRY RUN MODE"} - piecework_stock_count realignment ` +
      `${APPLY ? "will be written" : "will NOT be written"}.`
  );

  if (!APPLY) {
    console.log("Re-run with `--apply` to fix and verify.\n");
    await mongoose.disconnect();
    return;
  }

  let applied = 0;
  for (const m of mismatches) {
    const update = { $set: { piecework_stock_count: m.expected } };
    const result = m.collection === "Worker"
      ? await Worker.updateOne({ workerID: m.workerID }, update)
      : await PieceworkWorker.updateOne({ workerID: m.workerID }, update);
    if (result.matchedCount === 0) {
      console.log(`  WARN: ${m.collection} worker ${m.workerID} not matched - skipping`);
      continue;
    }
    applied++;
    console.log(
      `  fixed ${m.collection} worker ${m.workerID} (${m.name}): piecework_stock_count ${m.stored} -> ${m.expected}`
    );
  }

  console.log(`\nApplied fixes: ${applied}/${mismatches.length}`);

  // ---- verify ----
  const remaining = await collectMismatches();
  console.log(`\nVERIFY: ${remaining.length} mismatch(es) remain after fix.`);
  remaining.forEach((m, i) => console.log(`  [${i + 1}] ${m.collection} worker ${m.workerID} stored=${m.stored} expected=${m.expected}`));

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
