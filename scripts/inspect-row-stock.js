// READ-ONLY: print base stock_count of specific rows in a block.
// Usage: node scripts/inspect-row-stock.js [dbName] [blockLabel] [rowA,rowB,...]
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}
(async () => {
  const dbName = process.argv[2] || "farm-managment";
  const blockLabel = process.argv[3] || "Block 12";
  const wanted = (process.argv[4] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const conn = await mongoose
    .createConnection(uriFor(dbName), { readPreference: "primary" })
    .asPromise();
  const block = await conn.db.collection("blocks").findOne({ block_name: blockLabel });
  await conn.close();
  if (!block) throw new Error("block not found");
  for (const r of block.rows || []) {
    if (!wanted.length || wanted.includes(String(r.row_number))) {
      console.log(
        `row ${r.row_number}: stock_count=${r.stock_count} remaining_stock_count=${r.remaining_stock_count} shared_row=${r.shared_row}`
      );
    }
  }
})().catch((e) => {
  console.error("ERROR: " + ((e && e.stack) || e));
  process.exit(1);
});
