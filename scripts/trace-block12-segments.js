require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  const conn = await mongoose.createConnection(uriFor(process.argv[2]), { readPreference: "primary" }).asPromise();
  const blocks = await conn.db.collection("blocks").find({}, { projection: { block_name: 1, rows: 1 } }).sort({ block_name: 1 }).toArray();

  const series = {};
  for (const b of blocks) {
    const A = {};
    for (const r of b.rows) {
      const m = /^(\d+)A$/.exec(String(r.row_number));
      if (m) A[Number(m[1])] = Number(r.stock_count) || 0;
    }
    const hi = Math.max(...Object.keys(A).map(Number));
    series[b.block_name] = Array.from({ length: hi }, (_, i) => A[i + 1] ?? null);
  }

  const target = "Block 12";
  const t = series[target];
  console.log("Block 12 A-series length", t.length);

  function findSub(arr, sub) {
    const out = [];
    for (let i = 0; i + sub.length <= arr.length; i++) {
      if (sub.every((v, j) => arr[i + j] === v)) out.push(i + 1);
    }
    return out;
  }

  // anomalous segments
  const probes = {
    "kink 62,66,68,70,71,73,75,75,76 (bases 26-34)": [62, 66, 68, 70, 71, 73, 75, 75, 76],
    "run 66,68,70,71,73,75,75,76 (bases 27-34)": [66, 68, 70, 71, 73, 75, 75, 76],
    "head 86,86,85,85,84,83,82,81,80,79": [86, 86, 85, 85, 84, 83, 82, 81, 80, 79],
    "tail 33,30,26,22,18,14,11,7": [33, 30, 26, 22, 18, 14, 11, 7],
  };

  for (const [label, sub] of Object.entries(probes)) {
    console.log(`\nprobe: ${label}`);
    for (const [name, arr] of Object.entries(series)) {
      const hits = findSub(arr, sub);
      const rhits = findSub(arr, [...sub].reverse());
      if (hits.length) console.log(`   ${name} @ base ${hits.join(",")}`);
      if (rhits.length) console.log(`   ${name} REVERSED @ base ${rhits.join(",")}`);
    }
  }

  // pairwise identical A-series (full or long overlap)
  console.log("\n--- identical/duplicate long runs between blocks ---");
  const names = Object.keys(series);
  const LEN = 10;
  const sig = new Map();
  for (const n of names) {
    const a = series[n];
    for (let i = 0; i + LEN <= a.length; i++) {
      const k = a.slice(i, i + LEN).join(",");
      if (!sig.has(k)) sig.set(k, []);
      sig.get(k).push(`${n}@${i + 1}`);
    }
  }
  const seen = new Set();
  let shown = 0;
  for (const [k, v] of sig) {
    if (v.length < 2) continue;
    const owners = new Set(v.map((x) => x.split("@")[0]));
    if (owners.size < 2) continue;
    const key = [...owners].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (shown++ > 15) break;
    console.log(`  ${key}  runs: ${v.slice(0, 6).join("  ")}`);
  }

  await conn.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
