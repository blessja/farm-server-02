// Read-only: deep dive on specific blocks to distinguish genuinely missing
// rows from declared-metadata drift. No writes.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function sortKey(label) {
  const m = /^(\d+)([AB]?)$/.exec(String(label));
  if (!m) return [Infinity, "Z"];
  return [Number(m[1]), m[2] === "A" ? 0 : m[2] === "B" ? 1 : 2];
}
function cmp(a, b) {
  const [na, sa] = sortKey(a);
  const [nb, sb] = sortKey(b);
  if (na !== nb) return na - nb;
  return sa - sb;
}

async function main() {
  const dbName = process.argv[2] || resolveDatabaseName();
  const names = process.argv.slice(3);
  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  for (const name of names) {
    const b = await coll.findOne({ block_name: name });
    if (!b) { console.log("not found: " + name); continue; }
    const rows = [...(b.rows || [])].sort((x, y) => cmp(x.row_number, y.row_number));
    const declared = Number(b.total_rows) || 0;
    const labelSet = new Set(rows.map((r) => String(r.row_number)));
    const missing = [];
    for (let n = 1; n <= declared; n++) {
      if (!labelSet.has(n + "A")) missing.push(n + "A");
      if (!labelSet.has(n + "B")) missing.push(n + "B");
    }

    console.log(`\n${"=".repeat(66)}`);
    console.log(`${name}  rows=${rows.length}  declared total_rows=${declared}  total_stocks=${b.total_stocks}  variety=${b.variety}`);
    console.log(`missing: ${missing.length ? missing.join(", ") : "none"}`);

    // Which bases have both halves, and do the halves match in count?
    const byBase = {};
    rows.forEach((r) => {
      const m = /^(\d+)([AB])$/.exec(String(r.row_number));
      if (!m) return;
      byBase[m[1]] = byBase[m[1]] || {};
      byBase[m[1]][m[2]] = { stock: Number(r.stock_count) || 0, rem: r.remaining_stock_count, worker: r.worker_id || "" };
    });

    const singleHalves = Object.keys(byBase).filter((n) => byBase[n].A || byBase[n].B)
      .filter((n) => !(byBase[n].A && byBase[n].B))
      .sort((a, b2) => a - b2);

    console.log(`bases missing one half: ${singleHalves.length ? singleHalves.join(", ") : "none"}`);
    singleHalves.forEach((n) => {
      console.log(`   base ${n}: A=${byBase[n].A ? byBase[n].A.stock : "-"} B=${byBase[n].B ? byBase[n].B.stock : "-"}`);
    });

    // Do pairs agree on stock_count?
    const disagree = Object.keys(byBase)
      .filter((n) => byBase[n].A && byBase[n].B && byBase[n].A.stock !== byBase[n].B.stock)
      .sort((a, b2) => a - b2);
    console.log(`pairs where A stock != B stock: ${disagree.length}`);
    if (disagree.length) {
      disagree.slice(0, 20).forEach((n) =>
        console.log(`   base ${n}: A=${byBase[n].A.stock} B=${byBase[n].B.stock}`)
      );
      if (disagree.length > 20) console.log(`   ... and ${disagree.length - 20} more`);
    }

    // Stock profile: does the block taper, like Block 17?
    const stocks = rows.map((r) => Number(r.stock_count) || 0);
    console.log(`stock min/max: ${Math.min(...stocks)}/${Math.max(...stocks)}`);
    const dist = {};
    stocks.forEach((v) => { dist[v] = (dist[v] || 0) + 1; });
    const top = Object.keys(dist).map(Number).sort((a, c) => c - a).slice(0, 6);
    console.log(`most common counts: ${top.map((v) => `${v}x${dist[v]}`).join("  ")}`);

    // Sequence gaps in storage order (row deleted from the middle).
    const nums = rows.map((r) => sortKey(r.row_number));
    console.log(`first labels: ${rows.slice(0, 6).map((r) => r.row_number).join(", ")}`);
    console.log(`last labels:  ${rows.slice(-6).map((r) => r.row_number).join(", ")}`);

    // Stock sum vs declared
    const sum = stocks.reduce((a, c) => a + c, 0);
    console.log(`sum=${sum} total_stocks=${b.total_stocks} diff=${b.total_stocks - sum}`);
    if (missing.length) {
      const partnerSum = missing.reduce((acc, l) => {
        const n = parseInt(l, 10);
        const half = l.slice(-1);
        const p = byBase[n] && byBase[n][half === "A" ? "B" : "A"];
        return acc + (p ? p.stock : 0);
      }, 0);
      console.log(`=> partner-matched insert would give sum=${sum + partnerSum} (target ${b.total_stocks})`);
    }
  }
  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });