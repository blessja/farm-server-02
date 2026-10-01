// Read-only deep scan of Block 17 rows to identify duplicates/missing rows.
// No writes.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");
const Block = require("../models/Block");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function asInt(v) {
  if (v == null) return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primaryPreferred",
  });
  await conn.asPromise();
  const BlockM = conn.model("Block", Block.schema);
  const block = await BlockM.findOne({ block_name: "Block 17" }).lean().exec();
  if (!block) {
    console.log("not found");
    await conn.close();
    return;
  }
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const byNum = {};
  rows.forEach((r, idx) => {
    const n = asInt(r.row_number);
    const key = n == null ? `__bad_${idx}` : String(n);
    byNum[key] = byNum[key] || [];
    byNum[key].push({ idx, ...r });
  });
  const keys = Object.keys(byNum).sort((a, b) => {
    const na = asInt(a);
    const nb = asInt(b);
    if (na == null && nb == null) return a.localeCompare(b);
    if (na == null) return 1;
    if (nb == null) return -1;
    return na - nb;
  });
  for (const k of keys) {
    const group = byNum[k];
    if (group.length > 1) {
      console.log(
        "\n=== DUPLICATES for row_number=" + k + " (" + group.length + " copies) ==="
      );
      group.forEach((g, i) => {
        console.log(
          `  [copy${i + 1}] idx=${g.idx} stock=${g.stock_count} rem=${g.remaining_stock_count} worker=${g.worker_id || "-"} job=${g.job_type || "-"} active=${(g.active_jobs||[]).length}`
        );
      });
    }
  }
  // Also find the bad one
  if (byNum.__bad_0 || keys.find((k) => k.startsWith("__bad"))) {
    Object.keys(byNum)
      .filter((k) => k.startsWith("__bad"))
      .forEach((k) => {
        byNum[k].forEach((g) => {
          console.log("\n=== BAD row_number (unparseable) ===");
          console.log(JSON.stringify({ idx: g.idx, row_number: g.row_number, stock_count: g.stock_count, remaining_stock_count: g.remaining_stock_count, worker_id: g.worker_id, job_type: g.job_type, active_jobs: g.active_jobs }, null, 2));
        });
      });
  }
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });