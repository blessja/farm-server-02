// Read-only diagnosis for blocks where sum(rows.stock_count) disagrees with
// total_stocks: reports A/B mismatches, missing halves, stray bases, field
// shape anomalies, and per-base pair sums so the drift can be localised.
//
// Usage: node scripts/diagnose-stock-gaps.js <dbName> "Block 8" ...
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const LABEL_RE = /^(\d+)([AB])$/;

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

function buildHalves(rows) {
  const h = {};
  rows.forEach((r) => {
    const m = LABEL_RE.exec(String(r && r.row_number));
    if (!m) return;
    h[m[1]] = h[m[1]] || { A: null, B: null };
    h[m[1]][m[2]] = Number(r.stock_count) || 0;
  });
  return h;
}

async function main() {
  const dbName = process.argv[2];
  const names = process.argv.slice(3);
  if (!dbName || !names.length) {
    console.error('usage: node scripts/diagnose-stock-gaps.js <dbName> "Block 8" ...');
    process.exit(1);
  }

  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();

  for (const name of names) {
    const b = await conn.db.collection("blocks").findOne({ block_name: name });
    if (!b) { console.log(name + " NOT FOUND"); continue; }

    const rows = Array.isArray(b.rows) ? b.rows : [];
    const declared = Number(b.total_rows) || 0;
    const ts = Number(b.total_stocks) || 0;
    const sum = rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
    const h = buildHalves(rows);

    console.log("=== " + name + " ===");
    console.log("  rows=" + rows.length + "/" + (declared * 2) +
      "  total_rows=" + declared +
      "  sum=" + sum +
      "  total_stocks=" + ts +
      "  gap=" + (ts - sum));

    // labels that are not nA / nB
    const malformed = rows.filter((r) => !LABEL_RE.test(String(r && r.row_number)));
    console.log("  malformed labels: " + (malformed.length ? malformed.map((r) => r.row_number).join(", ") : "none"));

    // duplicate labels
    const counts = {};
    rows.forEach((r) => { const l = String(r && r.row_number); counts[l] = (counts[l] || 0) + 1; });
    const dupes = Object.keys(counts).filter((k) => counts[k] > 1);
    console.log("  duplicate labels: " + (dupes.length ? dupes.join(", ") : "none"));

    // missing halves across the full declared range
    const missing = [];
    for (let n = 1; n <= declared; n++) {
      const p = h[String(n)];
      if (!p || p.A === null) missing.push(n + "A");
      if (!p || p.B === null) missing.push(n + "B");
    }
    console.log("  missing halves in 1.." + declared + ": " + (missing.length ? missing.join(", ") : "none"));

    // bases present beyond total_rows
    const labels = rows.map((r) => String(r && r.row_number));
    const beyond = labels.filter((l) => { const m = LABEL_RE.exec(l); return m && Number(m[1]) > declared; });
    console.log("  labels beyond total_rows: " + (beyond.length ? beyond.join(", ") : "none"));

    // A/B mismatches
    const bad = Object.keys(h)
      .map(Number)
      .sort((a, c) => a - c)
      .filter((n) => h[String(n)].A !== null && h[String(n)].B !== null && h[String(n)].A !== h[String(n)].B);
    console.log("  mismatched pairs: " + (bad.length
      ? bad.map((n) => "base " + n + " A=" + h[String(n)].A + " B=" + h[String(n)].B).join(", ")
      : "none"));

    // rows with no worker activity residue but non-zero stock is normal;
    // look instead for rows whose stock differs from its own A/B partner
    const soloMissing = missing.filter((l) => {
      const m = LABEL_RE.exec(l);
      const partner = h[m[1]] && h[m[1]][m[2] === "A" ? "B" : "A"];
      return partner === null || partner === undefined;
    });
    console.log("  missing with no partner (whole base gone): " +
      (soloMissing.length ? soloMissing.join(", ") : "none"));

    // field shape: union of keys across rows
    const keySet = new Set();
    rows.forEach((r) => Object.keys(r || {}).forEach((k) => keySet.add(k)));
    const anomalies = rows.filter((r) => {
      const present = new Set(Object.keys(r || {}));
      const expected = ["row_number", "worker_name", "stock_count", "start_time",
        "worker_id", "remaining_stock_count", "time_spent", "job_type", "active_jobs"];
      return expected.some((k) => !present.has(k)) || [...present].some((k) => !keySet.has(k));
    });
    console.log("  row key union: " + [...keySet].sort().join(", "));
    console.log("  rows missing expected keys: " + (anomalies.length
      ? anomalies.map((r) => r.row_number).join(", ")
      : "none"));

    // per-base pair sums, flagged when far from the block median
    const ks = Object.keys(h).map(Number).sort((a, c) => a - c);
    const pairSums = ks.map((n) => h[String(n)].A + h[String(n)].B);
    const sorted = pairSums.slice().sort((a, c) => a - c);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const outliers = ks.filter((n) => {
      const v = h[String(n)].A + h[String(n)].B;
      return median > 0 && Math.abs(v - median) > 0.5 * median;
    });
    console.log("  pair-sum median=" + median + "  outliers: " +
      (outliers.length ? outliers.map((n) => "base " + n + "=" + (h[String(n)].A + h[String(n)].B)).join(", ") : "none"));

    console.log("  --- pair sums (base: A/B) ---");
    let line = "";
    ks.forEach((k, i) => {
      line += k + ":" + h[String(k)].A + "/" + h[String(k)].B + "  ";
      if ((i + 1) % 8 === 0) { console.log("    " + line); line = ""; }
    });
    if (line) console.log("    " + line);
    console.log("");
  }

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });