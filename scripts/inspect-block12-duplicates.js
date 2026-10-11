// READ-ONLY: find every duplicate checkout in a block across all worker records.
// Usage: node scripts/inspect-block12-duplicates.js [dbName] [blockLabel]
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
  const blockLabel = process.argv[3] || "Block 12";
  const conn = await mongoose
    .createConnection(uriFor(dbName), { readPreference: "primary" })
    .asPromise();

  const query =
    blockLabel === "*"
      ? {}
      : { "blocks.block_name": blockLabel };
  const workers = await conn.db.collection("workers").find(query).toArray();

  console.log(
    `=== ${dbName} ${blockLabel}: ${workers.length} workers with entries ===`
  );

  let flagged = 0;
  for (const w of workers) {
    for (const block of w.blocks || []) {
      if (blockLabel !== "*" && String(block.block_name).trim() !== blockLabel) {
        continue;
      }
      const rows = block.rows || [];
      const sum = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
      const dup = rows.filter((r) => (r.checkout_events || []).length > 1);
      if (dup.length) {
        flagged++;
        console.log("");
        console.log(
          `# ${w.name} (${w.workerID}) ${block.block_name} block sum=${sum}  rows with >1 checkout event: ${dup.length}`
        );
        dup.forEach((r) => {
          const evs = r.checkout_events;
          const credited = evs.reduce((s, e) => s + (Number(e.vines_completed) || 0), 0);
          console.log(
            `    row ${r.row_number} ${r.job_type} stock_count=${r.stock_count} events=${evs.length} sum(vines_completed)=${credited}`
          );
          evs.forEach((e, i) => {
            console.log(
              `        [ev${i}] at=${fmt(e.recorded_at)} vines ${e.vines_before}->${e.vines_completed}->${e.vines_remaining} kept=${e.kept_checked_in} reason="${e.reason || ""}"`
            );
          });
        });
      }
    }
  }
  console.log("");
  console.log(`Worker/block rows carrying >1 checkout event: ${flagged}`);
  await conn.close();
})().catch((e) => {
  console.error("ERROR: " + ((e && e.stack) || e));
  process.exit(1);
});
