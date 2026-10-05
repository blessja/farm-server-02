// Read-only: compare the *shape* of the row subdocuments across all blocks.
// _id presence, which optional fields exist, and where stock_count sits. This
// separates "rows inserted by a raw-driver import" from "rows written through
// Mongoose", which tells us how Block 15's all-zero rows came to exist.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) { console.error("usage: node inspect-row-shapes.js <dbName>"); process.exit(1); }
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const all = await conn.db.collection("blocks").find({}).toArray();

  console.log("block".padEnd(10), "withId".padEnd(8), "bunchesSet".padEnd(12),
    "chkBySet".padEnd(10), "shapes");
  const shapeUnion = new Set();
  for (const b of all) {
    const rows = b.rows || [];
    const withId = rows.filter((r) => r._id).length;
    const bunchesSet = rows.filter((r) => r.bunches !== undefined).length;
    const chkBySet = rows.filter((r) => r.checkin_recorded_by !== undefined).length;
    const shapes = new Map();
    rows.forEach((r) => {
      const k = Object.keys(r).sort().join(",");
      shapes.set(k, (shapes.get(k) || 0) + 1);
      shapeUnion.add(k);
    });
    console.log(
      String(b.block_name).padEnd(10),
      `${withId}/${rows.length}`.padEnd(8),
      `${bunchesSet}/${rows.length}`.padEnd(12),
      `${chkBySet}/${rows.length}`.padEnd(10),
      [...shapes.entries()].map(([k, n]) => `${n}x[${k}]`).join("  ")
    );
  }

  console.log("\ndistinct shapes seen across the farm:");
  [...shapeUnion].forEach((k) => console.log(`  {${k}}`));

  // Block 9 full taper, to judge whether 3A=23 or 3B=66 fits the sequence.
  const b9 = all.find((x) => x.block_name === "Block 9");
  if (b9) {
    console.log("\nBlock 9 full per-base listing:");
    const h = {};
    (b9.rows || []).forEach((r) => {
      const m = /^(\d+)([AB])$/.exec(String(r.row_number));
      if (!m) return;
      h[m[1]] = h[m[1]] || {};
      h[m[1]][m[2]] = Number(r.stock_count) || 0;
    });
    Object.keys(h).map(Number).sort((a, c) => a - c).forEach((n) => {
      const p = h[n];
      const a = p.A, bb = p.B;
      const flag = a === bb ? "" : "   <-- MISMATCH";
      console.log(`  base ${String(n).padStart(2)}: A=${String(a).padStart(3)}  B=${String(bb).padStart(3)}  combined=${String((a || 0) + (bb || 0)).padStart(4)}${flag}`);
    });
  }

  // Sanity: does any block have a per-base pair where A != B by a small
  // amount? That would weaken "pairs always mirror" as a rule.
  console.log("\nall mismatched A/B pairs across the farm:");
  all.forEach((b) => {
    const h = {};
    (b.rows || []).forEach((r) => {
      const m = /^(\d+)([AB])$/.exec(String(r.row_number));
      if (!m) return;
      h[m[1]] = h[m[1]] || {};
      h[m[1]][m[2]] = Number(r.stock_count) || 0;
    });
    const bad = Object.keys(h).filter((n) => h[n].A != null && h[n].B != null && h[n].A !== h[n].B)
      .sort((x, y) => x - y);
    if (bad.length) console.log(`  ${b.block_name}: ${bad.map((n) => `${n}(A=${h[n].A},B=${h[n].B})`).join("  ")}`);
  });

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });