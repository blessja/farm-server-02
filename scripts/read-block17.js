// Read-only diagnostic for Block 17 in production.
// Checks declared totals (total_rows / total_stocks) against the actual
// rows[] subdocuments to surface missing rows, numbering gaps and duplicates.
// Usage: node scripts/read-block17.js [dbName]
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");
const Block = require("../models/Block");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function asInt(v) {
  const n = parseInt(v, 10);
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
    console.log("Block 17 not found in " + dbName);
    await conn.close();
    return;
  }

  const rows = Array.isArray(block.rows) ? block.rows : [];

  console.log("=== Block 17 (" + dbName + ") ===");
  console.log("  variety:        " + block.variety);
  console.log("  year_planted:   " + block.year_planted);
  console.log("  size_ha:        " + block.size_ha);
  console.log("  total_stocks:   " + block.total_stocks + "  (declared)");
  console.log("  total_rows:     " + block.total_rows + "  (declared)");
  console.log("  rows in array:  " + rows.length + "  (actual)");
  console.log(
    "  -> MISSING ROW DOCUMENTS: " + ((block.total_rows || 0) - rows.length)
  );

  const stockSum = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
  console.log("  stock_count sum: " + stockSum + "  (actual)");
  console.log(
    "  -> MISSING VINES vs total_stocks: " + ((block.total_stocks || 0) - stockSum)
  );

  // Numbering gaps + duplicates (row_number is a String, so sort numerically).
  const nums = rows.map((r) => asInt(r.row_number));
  const valid = nums.filter((n) => n !== null).sort((a, b) => a - b);
  const unnumbered = nums.length - valid.length;

  console.log("\n=== Row numbering ===");
  console.log("  unparseable row_number: " + unnumbered);
  const dupes = {};
  valid.forEach((n) => {
    dupes[n] = (dupes[n] || 0) + 1;
  });
  const dupeList = Object.keys(dupes)
    .filter((k) => dupes[k] > 1)
    .sort((a, b) => a - b);
  console.log(
    "  duplicate row_numbers:  " + (dupeList.length ? dupeList.join(", ") : "none")
  );

  const gaps = [];
  for (let i = 1; i < valid.length; i++) {
    for (let n = valid[i - 1] + 1; n < valid[i]; n++) gaps.push(n);
  }
  console.log(
    "  GAPS in numbering:     " + (gaps.length ? gaps.join(", ") : "none")
  );
  console.log("  row_number range:      " + valid[0] + " .. " + valid[valid.length - 1]);

  // Row state breakdown, mirroring read-block16.js.
  const completed = { n: 0, vines: 0 };
  const untouched = { n: 0, vines: 0 };
  const partial = { n: 0, vines: 0 };
  const zeroStock = { n: 0, vines: 0, rows: [] };
  rows.forEach((r) => {
    const rem = r.remaining_stock_count;
    const stock = Number(r.stock_count) || 0;
    if (stock === 0) {
      zeroStock.n += 1;
      zeroStock.rows.push(r.row_number);
    }
    if (rem === 0) {
      completed.n += 1;
      completed.vines += stock;
    } else if (rem == null) {
      untouched.n += 1;
      untouched.vines += stock;
    } else {
      partial.n += 1;
      partial.vines += rem;
    }
  });
  console.log("\n=== Row state ===");
  console.log("  Completed  (remaining = 0):    " + completed.n + " rows / " + completed.vines + " vines");
  console.log("  Untouched  (remaining = null): " + untouched.n + " rows / " + untouched.vines + " vines");
  console.log("  Partial    (remaining > 0):    " + partial.n + " rows / " + partial.vines + " vines left");
  console.log(
    "  ZERO stock_count (likely the 'missing' rows): " + zeroStock.n +
    " -> " + (zeroStock.rows.length ? zeroStock.rows.join(", ") : "none")
  );

  // Any row with work recorded but no vines.
  const suspicious = rows.filter(
    (r) => (Number(r.stock_count) || 0) === 0 &&
      ((r.active_jobs || []).length > 0 || r.worker_id || r.job_type)
  );
  console.log(
    "  Zero-vine rows carrying work:   " + suspicious.length +
    (suspicious.length
      ? " -> " + suspicious.map((r) => r.row_number).join(", ")
      : "")
  );

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });