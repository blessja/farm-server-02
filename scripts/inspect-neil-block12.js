// READ-ONLY forensic dump: Neil James / Block 12 double-count investigation.
// Usage: node scripts/inspect-neil-block12.js [dbName] [nameFragment] [blockLabel]
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function fmt(d) {
  if (!d) return "-";
  try {
    return new Date(d).toISOString();
  } catch (e) {
    return String(d);
  }
}

(async () => {
  const dbName = process.argv[2] || "farm-managment";
  const nameFragment = (process.argv[3] || "neil").toLowerCase();
  const blockLabel = process.argv[4] || "12";
  const conn = await mongoose
    .createConnection(uriFor(dbName), { readPreference: "primary" })
    .asPromise();

  console.log(`=== ${dbName} :: workers matching "${nameFragment}" ===`);
  const workers = await conn.db
    .collection("workers")
    .find({ name: { $regex: nameFragment, $options: "i" } })
    .toArray();

  if (!workers.length) {
    console.log("No matching workers.");
  }

  for (const w of workers) {
    console.log("");
    console.log(
      `# ${w.name}  workerID=${w.workerID}  total_stock_count=${w.total_stock_count}  supervisor=${w.supervisor || "-"}`
    );
    const allSum = (w.blocks || []).reduce(
      (s, b) =>
        s + (b.rows || []).reduce((rs, r) => rs + (Number(r.stock_count) || 0), 0),
      0
    );
    console.log(
      `  sum over all block rows = ${allSum}  (worker.total_stock_count = ${w.total_stock_count})`
    );
    console.log(
      "  all block names on worker: " +
        (w.blocks || []).map((b) => `"${b.block_name}"`).join(", ")
    );
    const blocks = (w.blocks || []).filter(
      (b) =>
        String(b.block_name).trim() === String(blockLabel) ||
        String(b.block_name).trim() === `Block ${blockLabel}`
    );
    if (!blocks.length) {
      console.log(`  (no Block ${blockLabel} entries)`);
    }
    for (const b of blocks) {
      const rows = b.rows || [];
      const sum = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
      console.log(
        `  Block ${b.block_name}: ${rows.length} row entries, stock_count sum = ${sum}`
      );
      rows
        .slice()
        .sort((a, b2) => new Date(a.date) - new Date(b2.date))
        .forEach((r) => {
          console.log(
            `    row ${String(r.row_number).padEnd(4)} ${String(
              r.job_type
            ).padEnd(14)} stock_count=${String(r.stock_count).padStart(5)} ` +
              `time_spent=${Math.round(r.time_spent || 0)}min date=${fmt(
                r.date
              ).slice(0, 10)} recorded_by=${r.checkout_events && r.checkout_events.length ? (r.checkout_events[r.checkout_events.length - 1].recorded_by || "-") : "-"}`
          );
          const events = r.checkout_events || [];
          events.forEach((e, i) => {
            console.log(
              `        [ev${i}] id=${String(e.checkout_id).slice(0, 8)} at=${fmt(
                e.recorded_at
              )} work_date=${e.work_date} vines ${e.vines_before}->${e.vines_completed}->${e.vines_remaining} kept=${e.kept_checked_in} backdated=${e.backdated} reason="${e.reason || ""}" checkin_started=${fmt(e.checkin_started_at)}`
            );
          });
        });
    }
  }

  console.log("");
  console.log(`=== Block ${blockLabel}: rows referencing a matching worker ===`);
  const block = await conn.db
    .collection("blocks")
    .findOne({
      $or: [
        { block_name: blockLabel },
        { block_name: `Block ${blockLabel}` },
        { block_name: { $regex: `^${blockLabel}$|^Block\\s*${blockLabel}$`, $options: "i" } },
      ],
    });
  if (!block) {
    console.log(`Block ${blockLabel} not found.`);
  } else {
    const ids = new Set(workers.map((w) => String(w.workerID)));
    const names = new Set(workers.map((w) => String(w.name).toLowerCase()));
    const sum = (block.rows || []).reduce(
      (s, r) => s + (Number(r.stock_count) || 0),
      0
    );
    console.log(
      `total_stocks=${block.total_stocks}  row stock sum=${sum}  gap=${block.total_stocks - sum}`
    );
    for (const r of block.rows || []) {
      const hits =
        ids.has(String(r.worker_id)) ||
        names.has(String(r.worker_name || "").toLowerCase()) ||
        (r.active_jobs || []).some(
          (j) =>
            ids.has(String(j.worker_id)) ||
            names.has(String(j.worker_name || "").toLowerCase())
        );
      if (!hits) continue;
      console.log(
        `  row ${r.row_number}: stock=${r.stock_count} remaining=${r.remaining_stock_count} shared_row=${r.shared_row} legacyWorker="${r.worker_name || ""}"`
      );
      (r.active_jobs || []).forEach((j) => {
        console.log(
          `      active_job ${j.job_type} worker="${j.worker_name}"(${j.worker_id}) remaining=${j.remaining_stock} started=${fmt(j.start_time)} by=${j.recorded_by || "-"}`
        );
      });
    }
  }

  await conn.close();
})().catch((e) => {
  console.error("ERROR: " + ((e && e.stack) || e));
  process.exit(1);
});
