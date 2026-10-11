// scripts/repair-double-credits.js
//
// Fix worker rows that were credited MORE than the physical row totals permit.
//
// Background: when a worker checks into a row they already completed the same
// day, checkInWorker resets a completed row (remaining_stock_count === 0) back
// to its full stock_count. Moving away again triggers the auto-checkout, which
// credits the FULL row a second time -> the worker's stock_count for that row
// becomes ~2x the row's real vine count.
//
// This script finds every worker/block/row entry where stock_count exceeds the
// row's declared stock_count and the checkout events prove the row's base
// matches today's data (vines_before === base with vines_remaining === 0). It
// then caps stock_count back to the base and recomputes the worker totals using
// the exact rule of the pre-save hook in models/Worker.js.
//
// Safety:
//   - RUNS READ-ONLY BY DEFAULT. Pass --apply to write.
//   - Preconditions: base must match an event in the entry; only the excess
//     (stock_count - base) is removed; checkout_events are left intact as audit.
//   - A full backup of every worker it would touch is written to backups/.
//   - Verify step re-reads each worker after the write.
//
// Usage: node scripts/repair-double-credits.js [dbName] [--apply] [--worker <id>] [--block <name>]
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

const FAST_PIECEWORK_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function isFastJob(jobType) {
  return FAST_PIECEWORK_TYPES.includes(String(jobType || "").toUpperCase());
}

function localDateString(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const workerFilter = (() => {
    const i = process.argv.indexOf("--worker");
    return i !== -1 && process.argv[i + 1] ? String(process.argv[i + 1]) : null;
  })();
  const blockFilter = (() => {
    const i = process.argv.indexOf("--block");
    return i !== -1 && process.argv[i + 1] ? String(process.argv[i + 1]) : null;
  })();

  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primary",
    writeConcern: { w: "majority" },
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
  });
  await conn.asPromise();

  const blocksColl = conn.db.collection("blocks");
  const workersColl = conn.db.collection("workers");

  // Map block_name::row_number -> declared stock_count.
  const bases = {};
  const blocks = await blocksColl.find({}).toArray();
  for (const block of blocks) {
    if (!block || !Array.isArray(block.rows)) continue;
    for (const row of block.rows) {
      if (!row || row.row_number == null) continue;
      const count = Number(row.stock_count) || 0;
      if (count > 0) bases[`${block.block_name}::${row.row_number}`] = count;
    }
  }

  const query = {};
  if (workerFilter) query.workerID = workerFilter;
  const workers = await workersColl.find(query).toArray();

  const fixes = [];        // entries minus the excess
  const reviews = [];      // over base but preconditions not met (manual review)

  for (const worker of workers) {
    if (!worker || !Array.isArray(worker.blocks)) continue;
    for (const wbIndex in worker.blocks) {
      const block = worker.blocks[wbIndex];
      if (!block || !Array.isArray(block.rows)) continue;
      if (blockFilter && block.block_name !== blockFilter) continue;
      for (const rowIndex in block.rows) {
        const entry = block.rows[rowIndex];
        if (!entry || entry.row_number == null) continue;
        const key = `${block.block_name}::${entry.row_number}`;
        const base = bases[key];
        if (!(base > 0)) continue; // row not in current block data; cannot vouch for base
        const stock = Number(entry.stock_count) || 0;
        const over = stock - base;
        if (over <= 0) continue;

        const events = Array.isArray(entry.checkout_events) ? entry.checkout_events : [];
        const baseProven = events.some(
          (ev) =>
            ev &&
            Number(ev.vines_before) === base &&
            Number(ev.vines_remaining) === 0
        );

        const item = {
          workerID: worker.workerID,
          workerName: worker.name,
          block: block.block_name,
          row: String(entry.row_number),
          jobType: entry.job_type || "",
          date: localDateString(entry.date),
          base,
          from: stock,
          to: base,
          excess: over,
          events: events.length,
        };

        if (baseProven) {
          fixes.push({ worker, wbIndex: Number(wbIndex), rowIndex: Number(rowIndex), item });
        } else {
          reviews.push(item);
        }
      }
    }
  }

  // ---- report ----
  console.log(`=== Double-credit repair / ${dbName} ===`);
  console.log(`  scanned workers:  ${workers.length}`);
  console.log(`  block rows known: ${Object.keys(bases).length}`);
  console.log(`  over-credited (auto-fixable): ${fixes.length}`);
  for (const f of fixes) {
    const it = f.item;
    console.log(
      `    - ${String(it.workerID).padEnd(10)} ${String(it.workerName || "").slice(0, 24).padEnd(24)} ${it.block} Row ${it.row} (${it.jobType}) ${it.date || "-"} : ${it.from} -> ${it.to}  (excess ${it.excess}, ${it.events} event(s))`
    );
  }
  console.log(`  over-credited but needs review: ${reviews.length}`);
  for (const it of reviews) {
    console.log(
      `    - ${String(it.workerID).padEnd(10)} ${String(it.workerName || "").slice(0, 24).padEnd(24)} ${it.block} Row ${it.row} (${it.jobType}) ${it.date || "-"} : ${it.from} vs base ${it.base} (base not proven by events)`
    );
  }

  if (fixes.length === 0) {
    console.log("\n  Nothing to fix.");
    await conn.close();
    return;
  }

  // ---- backup ----
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `double-credit-repair-${dbName}-${stamp}.json`);
  const backup = fixes.reduce((acc, f) => {
    acc[f.worker._id.toString()] = f.worker;
    return acc;
  }, {});
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\n  BACKUP: ${backupFile} (${fs.statSync(backupFile).size} bytes, ${Object.keys(backup).length} worker(s))`);

  if (!APPLY) {
    console.log("\n  DRY RUN - nothing changed. Re-run with --apply to execute.");
    await conn.close();
    return;
  }

  // ---- write: only the excess is removed, then totals recomputed like the pre-save hook ----
  let applied = 0;
  for (const fix of fixes) {
    const { worker, wbIndex, rowIndex, item } = fix;
    const entry = worker.blocks[wbIndex].rows[rowIndex];
    entry.stock_count = item.to;

    let regular = 0;
    let fast = 0;
    for (const block of worker.blocks) {
      for (const row of block.rows) {
        const count = Number(row && row.stock_count) || 0;
        if (isFastJob(row && row.job_type)) fast += count;
        else regular += count;
      }
    }
    const res = await workersColl.updateOne(
      { _id: worker._id },
      { $set: { "blocks": worker.blocks, "total_stock_count": regular, "piecework_stock_count": fast } },
      { writeConcern: { w: "majority" } }
    );
    if (res.matchedCount !== 1) {
      console.error(`  WARNING: worker ${worker.workerID} matched ${res.matchedCount} - concurrent change? Review.`);
      continue;
    }
    applied++;
  }
  console.log(`\n  applied fixes: ${applied}/${fixes.length}`);

  // ---- verify ----
  let ok = true;
  for (const fix of fixes) {
    const { worker, item } = fix;
    const after = await workersColl.findOne({ _id: worker._id });
    if (!after) {
      ok = false;
      console.error(`  VERIFY FAIL: ${item.workerID} disappeared after write`);
      continue;
    }
    let regular = 0;
    for (const block of after.blocks) {
      for (const row of block.rows) {
        const count = Number(row && row.stock_count) || 0;
        if (!isFastJob(row && row.job_type)) regular += count;
      }
    }
    const stillOver = [];
    for (const block of after.blocks) {
      if (block.block_name !== item.block) continue;
      for (const row of block.rows) {
        const base = bases[`${block.block_name}::${row.row_number}`];
        if (base > 0 && (Number(row.stock_count) || 0) > base) {
          stillOver.push(`${row.row_number}(${row.stock_count}>${base})`);
        }
      }
    }
    const entryAfter = after.blocks
      .find((b) => b.block_name === item.block)?.rows[fix.rowIndex];
    const capped = entryAfter && Number(entryAfter.stock_count) === item.to;
    if (!capped) {
      ok = false;
      console.error(`  VERIFY FAIL: ${item.workerID} ${item.block} Row ${item.row} stock now ${entryAfter && entryAfter.stock_count} (expected ${item.to})`);
    }
    if (after.total_stock_count !== regular) {
      ok = false;
      console.error(`  VERIFY FAIL: ${item.workerID} total_stock_count ${after.total_stock_count} (expected ${regular})`);
    }
    if (stillOver.length) {
      ok = false;
      console.error(`  VERIFY FAIL: ${item.workerID} still over base: ${stillOver.join(", ")}`);
    }
  }
  console.log(ok ? "\n  Verification: PASS" : "\n  Verification: FAILED - review before trusting");
  console.log(`  rollback source: ${backupFile}`);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });