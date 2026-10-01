// Read-only: FULL completeness check for Block 17 across all base rows 1..97
// (the earlier check only covered 34..97 and missed earlier gaps).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");
  const doc = await coll.findOne({ block_name: "Block 17" });
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  const labels = new Set(rows.map((r) => String(r.row_number)));

  const declared = Number(doc.total_rows) || 0;
  const missing = [];
  for (let n = 1; n <= declared; n++) {
    if (!labels.has(n + "A")) missing.push(n + "A");
    if (!labels.has(n + "B")) missing.push(n + "B");
  }

  console.log("=== Block 17 FULL completeness (" + dbName + ") ===");
  console.log("  declared total_rows: " + declared);
  console.log("  rows present:        " + rows.length + " (expected " + declared * 2 + ")");
  console.log("  MISSING ROWS:        " + (missing.length ? missing.join(", ") : "none"));
  console.log("  short by:            " + (declared * 2 - rows.length) + " rows");

  // Local stock context around each missing row.
  rows.forEach((r) => {
    const l = String(r.row_number);
    if (!missing.includes(l)) return;
    const n = parseInt(l, 10);
    const half = l.slice(-1);
    const neighbourHalf = half === "A" ? "B" : "A";
    const neighbour = rows.find((x) => String(x.row_number) === n + neighbourHalf);
    const adjacentBases = [n - 1, n, n + 1]
      .filter((b) => b >= 1 && b <= declared)
      .map((b) => b + "A=" + ((rows.find((x) => String(x.row_number) === b + "A") || {}).stock_count ?? "?") +
                     " " + b + "B=" + ((rows.find((x) => String(x.row_number) === b + "B") || {}).stock_count ?? "?"));
    console.log("\n  --- context for " + l + " ---");
    console.log("    paired " + n + neighbourHalf + " stock_count: " + (neighbour ? neighbour.stock_count : "n/a"));
    console.log("    surrounding: " + adjacentBases.join("   "));
  });

  // Do the missing rows close the gap to 11890 / total_stocks?
  const sum = rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0);
  console.log("\n=== reconciliation ===");
  console.log("  current stock sum:    " + sum);
  console.log("  declared total_stocks:" + doc.total_stocks + "  (diff " + (doc.total_stocks - sum) + ")");
  if (missing.length) {
    // Assume each missing row should carry the count of its A/B pair.
    let assum = 0;
    missing.forEach((l) => {
      const n = parseInt(l, 10);
      const half = l.slice(-1);
      const partner = rows.find((x) => String(x.row_number) === n + (half === "A" ? "B" : "A"));
      assum += partner ? Number(partner.stock_count) || 0 : 0;
    });
    console.log("  missing rows paired count: " + assum + " (assuming each mirrors its partner)");
    console.log("  sum + assumed:            " + (sum + assum));
    console.log("  -> would match 11890?     " + (sum + assum === 11890 ? "YES" : "no (off by " + (11890 - (sum + assum)) + ")"));
    console.log("  -> would match 11908?     " + (sum + assum === doc.total_stocks ? "YES" : "no (off by " + (doc.total_stocks - (sum + assum)) + ")"));
  }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });