// Read-only: scan every block in a database for malformed rows[] entries.
// A well-formed row has a short string row_number. Anything else is corruption.
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
  const blocks = await BlockM.find({}).lean().exec();

  console.log("=== malformed rows[] audit: " + dbName + " ===");
  let totalBad = 0;
  blocks.forEach((b) => {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const bad = [];
    rows.forEach((r, i) => {
      const keys = Object.keys(r || {});
      const v = r && r.row_number;
      const okLabel = typeof v === "string" && v.length <= 6 && /^\d+[AB]?$/.test(v);
      const okKeys = keys.length <= 11;
      if (!okLabel || !okKeys) bad.push({ idx: i, keys, label: v });
    });
    if (bad.length) {
      console.log(`  ${b.block_name}: ${bad.length} malformed entr${bad.length === 1 ? "y" : "ies"}`);
      bad.forEach((x) => console.log(`      idx=${x.idx} label=${JSON.stringify(x.label)} keys=${JSON.stringify(x.keys)}`));
      totalBad += bad.length;
    }
  });
  console.log("  TOTAL malformed entries: " + totalBad);

  // Duplicate label check per block
  console.log("\n=== duplicate row_number check ===");
  blocks.forEach((b) => {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const counts = {};
    rows.forEach((r) => {
      const v = r && r.row_number;
      if (typeof v === "string" && v.length <= 6) counts[v] = (counts[v] || 0) + 1;
    });
    const dupes = Object.keys(counts).filter((k) => counts[k] > 1);
    if (dupes.length) console.log(`  ${b.block_name}: duplicates -> ${dupes.join(", ")}`);
  });
  console.log("  (blocks not listed have no duplicate labels)");

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });