// Read-only inspection: lists block names + row counts in a given database.
// Usage: node scripts/list-blocks-by-db.js [dbName]
// Default: uses resolveDatabaseName() (Glen-Oak or farm-managment based on MONGO_DB).
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
  const uri = uriFor(dbName);
  const conn = await mongoose.createConnection(uri, {
    readPreference: "primaryPreferred",
  });
  await conn.asPromise();
  const BlockM = conn.model("Block", Block.schema);
  const blocks = await BlockM.find({}).lean().exec();
  console.log(`=== ${dbName} ===`);
  console.log(`  total blocks: ${blocks.length}`);
  blocks.forEach((b) => {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const stock = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
    console.log(`    ${b.block_name}  rows=${rows.length}  stock=${stock}`);
  });
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
