// Read-only: report block/row/worker counts for both databases (farm-managment + Glen-Oak)
require("dotenv").config({ path: __dirname + "/.env" });
const mongoose = require("mongoose");

const Block = require("./models/Block");
const Worker = require("./models/Worker");
const { resolveMongoUri, resolveDatabaseName } = require("./config/db");

async function inspect(dbName) {
  const uri = process.env.MONGO_URI.replace(
    /\/[^/?#]+(?=[?#]|$)/,
    `/${dbName}`
  );
  await mongoose.createConnection(uri).asPromise();
  const conn = mongoose.createConnection(uri, {});
  await new Promise((res, rej) => {
    conn.once("open", res);
    conn.once("error", rej);
  });
  const B = conn.model("Block", Block.schema);
  const W = conn.model("Worker", Worker.schema);
  const blocks = await B.find({}).lean();
  const workers = await W.find({}).lean();
  let blockCount = 0, rows = 0;
  for (const b of blocks) {
    blockCount++;
    rows += (b.rows || []).length;
  }
  console.log(`--- ${dbName} ---`);
  console.log(`  blocks: ${blockCount}`);
  console.log(`  rows:   ${rows}`);
  console.log(`  workers: ${workers.length}`);
  if (blocks.length) {
    console.log(`  block names: ${blocks.map((b) => b.block_name).join(", ")}`);
  }
  await mongoose.disconnect();
  return { blocks, workers };
}

(async () => {
  const prod = await inspect("farm-managment");
  const dev = await inspect("Glen-Oak");
  console.log("\n=== SUMMARY ===");
  console.log("farm-managment blocks:", prod.blocks.length);
  console.log("Glen-Oak blocks:       ", dev.blocks.length);
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
