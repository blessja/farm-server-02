// Read-only: dump Block 17 row_number values in array order + A/B scheme audit.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");
const Block = require("../models/Block");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primaryPreferred" });
  await conn.asPromise();
  const BlockM = conn.model("Block", Block.schema);
  const block = await BlockM.findOne({ block_name: "Block 17" }).lean().exec();
  const rows = Array.isArray(block.rows) ? block.rows : [];

  console.log("=== row_number values in array order (idx: row_number) ===");
  let line = "";
  rows.forEach((r, i) => {
    line += i + ":" + r.row_number + "  ";
    if ((i + 1) % 10 === 0) { console.log("  " + line); line = ""; }
  });
  if (line) console.log("  " + line);

  // Split legacy numeric vs A/B scheme
  const numeric = [];
  const ab = [];
  const corrupt = [];
  rows.forEach((r, i) => {
    const v = r.row_number;
    if (typeof v !== "string" || v.length > 6) corrupt.push({ idx: i, value: v });
    else if (/^\d+$/.test(v)) numeric.push({ idx: i, n: Number(v), stock: r.stock_count, rem: r.remaining_stock_count });
    else if (/^\d+[AB]$/.test(v)) ab.push({ idx: i, v, stock: r.stock_count, rem: r.remaining_stock_count });
    else corrupt.push({ idx: i, value: v });
  });

  console.log("\n=== Scheme breakdown ===");
  console.log("  plain numeric row_numbers: " + numeric.length);
  console.log("  A/B row_numbers:           " + ab.length);
  console.log("  corrupt/unexpected:        " + corrupt.length);
  corrupt.forEach((c) => console.log("    idx=" + c.idx + " -> " + JSON.stringify(c.value)));

  const abBase = [...new Set(ab.map((r) => parseInt(r.v, 10)))].sort((a, b) => a - b);
  console.log("\n  A/B base rows present: " + abBase[0] + ".." + abBase[abBase.length - 1] + " (count " + abBase.length + ")");
  const missingAB = [];
  for (let n = 34; n <= 97; n++) {
    const hasA = ab.some((r) => r.v === n + "A");
    const hasB = ab.some((r) => r.v === n + "B");
    if (!hasA) missingAB.push(n + "A");
    if (!hasB) missingAB.push(n + "B");
  }
  console.log("  MISSING A/B rows (34..97): " + (missingAB.length ? missingAB.join(", ") : "none"));

  const abDupes = {};
  ab.forEach((r) => { abDupes[r.v] = (abDupes[r.v] || 0) + 1; });
  const abDupeList = Object.keys(abDupes).filter((k) => abDupes[k] > 1);
  console.log("  duplicate A/B rows: " + (abDupeList.length ? abDupeList.join(", ") : "none"));

  // What the numeric (legacy) block covers
  const numSorted = [...new Set(numeric.map((r) => r.n))].sort((a, b) => a - b);
  console.log("\n  legacy numeric rows: " + numSorted[0] + ".." + numSorted[numSorted.length - 1] + " (distinct " + numSorted.length + ")");
  const withRem = numeric.filter((r) => r.rem !== null && r.rem !== undefined);
  console.log("  legacy numeric entries carrying remaining_stock_count: " + withRem.length);
  const numStock = [...new Set(numeric.map((r) => r.stock))].sort((a, b) => a - b);
  console.log("  legacy stock values: " + numStock.join(", "));

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });