// scripts/seed-dev.js
//
// Bootstraps the DEVELOPMENT database (Glen-Oak) with:
//   1. A copy of the production Block layouts (read-only from farm-managment),
//      so row selection, fast piecework and block summaries behave like prod.
//   2. One month of seeded totals (workers + fast piecework + day hours) via
//      seed-monthly.js.
//
// Run:  node scripts/seed-dev.js
//
// Safety: only ever writes to the MONGO_DB=development database (Glen-Oak).
// It refuses to run if the dev URI equals the production URI.

const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ path: "./.env" });

const mongoose = require("mongoose");
const Block = require("../models/Block");
const { resolveMongoUri } = require("../config/db");

async function main() {
  process.env.MONGO_DB = "production";
  const prodUri = resolveMongoUri();

  process.env.MONGO_DB = "development";
  const devUri = resolveMongoUri();

  if (!prodUri || !devUri) throw new Error("MONGO_URI is missing.");
  if (prodUri === devUri) {
    throw new Error("Refusing to seed: production and development URIs are identical.");
  }

  console.log(`Copying Block layouts from ${process.env.MONGO_DB_NAME} (production)...`);
  await mongoose.connect(prodUri, { serverSelectionTimeoutMS: 20000 });
  const blocks = await Block.find().lean();
  await mongoose.disconnect();
  console.log(`Read ${blocks.length} block(s) from production.\n`);

  console.log(`Seeding development database (${process.env.MONGO_DB_NAME_DEV})...`);
  await mongoose.connect(devUri, { serverSelectionTimeoutMS: 20000 });
  await Block.deleteMany({});
  await Block.insertMany(blocks);
  await mongoose.disconnect();
  console.log(`Inserted ${blocks.length} block(s) into development.\n`);

  console.log("Running seed-monthly.js against development...");
  const result = spawnSync(process.execPath, [path.join(__dirname, "seed-monthly.js")], {
    stdio: "inherit",
    env: { ...process.env, MONGO_DB: "development" },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  console.log("\nDevelopment database seeded.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exit(1);
  });