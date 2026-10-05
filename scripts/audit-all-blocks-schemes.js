// Read-only: learn each block's row-numbering scheme before auditing.
// Prints, per block, the sample labels and whether A/B suffixes are used.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function isMalformed(r) {
  const v = r && r.row_number;
  return !(typeof v === "string" && v.length <= 6 && /^\d+[AB]?$/.test(v));
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");
  const blocks = await coll.find({}).toArray();

  blocks.sort((a, b) =>
    String(a.block_name).localeCompare(String(b.block_name), undefined, { numeric: true })
  );

  console.log("=== row_numbering schemes (" + dbName + ") ===");
  for (const b of blocks) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const labels = rows.map((r) => String(r && r.row_number));
    const suffixCount = labels.filter((l) => /^[0-9]+[AB]$/.test(l)).length;
    const plainCount = labels.filter((l) => /^[0-9]+$/.test(l)).length;
    const malformed = rows.filter(isMalformed).length;
    const scheme =
      suffixCount > plainCount ? "A/B" : plainCount > suffixCount ? "numeric" : "mixed/unknown";
    const bases = [...new Set(labels.map((l) => parseInt(l, 10)).filter((n) => Number.isFinite(n)))].sort((x, y) => x - y);
    const dupes = {};
    labels.filter((l) => /^[0-9]+[AB]?$/.test(l)).forEach((l) => { dupes[l] = (dupes[l] || 0) + 1; });
    const dupeCount = Object.keys(dupes).filter((k) => dupes[k] > 1).length;
    console.log(
      `  ${String(b.block_name).padEnd(9)} rows=${String(rows.length).padStart(4)}  ` +
      `total_rows=${String(b.total_rows).padStart(4)}  total_stocks=${String(b.total_stocks).padStart(6)}  ` +
      `sum=${String(rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0)).padStart(6)}  ` +
      `scheme=${scheme.padEnd(13)} A/B=${suffixCount} plain=${plainCount}  ` +
      `bases=${bases[0] ?? "-"}..${bases[bases.length - 1] ?? "-"} (${bases.length})  ` +
      `malformed=${malformed} dupes=${dupeCount}`
    );
    if (malformed > 0) {
      rows.forEach((r, i) => {
        if (isMalformed(r)) console.log(`      malformed idx=${i}: ${JSON.stringify(r).slice(0, 140)}`);
      });
    }
  }
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });