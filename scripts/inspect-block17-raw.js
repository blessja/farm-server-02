// Read-only: inspect raw BSON for Block 17 rows to see whether subdocument
// _ids actually exist in the database, and confirm the exact shape of the
// corrupt element.
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
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();

  // Raw driver access, bypassing Mongoose casting entirely.
  const db = conn.db;
  const coll = db.collection("blocks");
  const doc = await coll.findOne({ block_name: "Block 17" }, { projection: { rows: 1 } });

  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  console.log("=== raw BSON inspection, " + dbName + " ===");
  console.log("  rows (raw): " + rows.length);
  console.log("  rows with _id: " + rows.filter((r) => r && r._id).length);
  console.log("  rows WITHOUT _id: " + rows.filter((r) => !(r && r._id)).length);

  console.log("\n  sample raw row (idx 0): " + JSON.stringify(rows[0]));
  console.log("\n  corrupt row (idx 186) keys: " + JSON.stringify(Object.keys(rows[186] || {})));
  console.log("  corrupt row (idx 186) value: " + JSON.stringify(rows[186]));
  console.log("\n  real 97B (idx 187) keys: " + JSON.stringify(Object.keys(rows[187] || {})));
  console.log("  real 97B (idx 187) _id: " + JSON.stringify(rows[187] && rows[187]._id));
  console.log("  real 97B (idx 187) value: " + JSON.stringify(rows[187]));

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });