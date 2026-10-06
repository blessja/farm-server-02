// Read Block 15 exactly the way the app does: rows + remaining + block totals. Read-only.
// Usage: node scripts/api-read-check.js [dbName] [block]
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  const dbName = process.argv[2] || "farm-managment";
  const label = process.argv[3] || "Block 15";
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" }).asPromise();
  const doc = await conn.db.collection("blocks").findOne({ block_name: label });
  await conn.close();
  if (!doc) throw new Error(label + " not found in " + dbName);

  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  const sum = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);

  // rowController start path (lines ~238-256)
  const effective = (r) => {
    const rem = r.remaining_stock_count;
    if (rem !== undefined && rem !== null && rem > 0) return rem;   // in-progress session
    if (rem === 0) return r.stock_count;                            // completed, start fresh
    return r.stock_count;                                           // first time on row
  };

  console.log("=== " + label + " / " + dbName + " ===");
  console.log("total_stocks: " + doc.total_stocks + "   total_rows: " + doc.total_rows + "   size_ha: " + doc.size_ha);
  console.log("row sum: " + sum);
  console.log("block-level remaining (total_stocks - sum): " + (doc.total_stocks - sum));
  console.log("");
  console.log("first 5 rows as the app reads them:");
  console.log("row    stock_count  remaining_stock_count  effective_remaining  worker");
  for (const r of rows.slice(0, 5)) {
    console.log(
      String(r.row_number).padEnd(6) +
      String(r.stock_count).padStart(11) +
      String(r.remaining_stock_count).padStart(22) +
      String(effective(r)).padStart(21) + "   " + (r.worker_name || "(none)")
    );
  }
  const zeroVines = rows.filter((r) => !(Number(r.stock_count) > 0));
  const withWork = rows.filter((r) => (r.worker_name || "").trim() || r.start_time);
  console.log("");
  console.log("rows with stock_count 0:  " + zeroVines.length + (zeroVines.length ? " -> " + zeroVines.map((r) => r.row_number).join(", ") : ""));
  console.log("rows already having work:  " + withWork.length + (withWork.length ? " -> " + withWork.map((r) => r.row_number).join(", ") : ""));
  console.log("rows summing to block total: " + (sum === doc.total_stocks ? "YES" : "NO (" + (doc.total_stocks - sum) + ")"));
})().catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });
