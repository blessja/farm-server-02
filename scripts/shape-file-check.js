// Shape check for an owner-supplied block file: A-series sum, A/B mirror, local anomalies.
// Usage: node scripts/shape-file-check.js <file.json>
const fs = require("fs");
const file = process.argv[2];
if (!file) { console.error("usage: node scripts/shape-file-check.js <file.json>"); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = doc.rows || [];
const by = {};
for (const r of rows) by[String(r.row_number)] = Number(r.stock_count) || 0;

const bases = {};
for (const k of Object.keys(by)) {
  const m = /^(\d+)([AB])$/.exec(k);
  if (m) (bases[m[1]] = bases[m[1]] || {})[m[2]] = by[k];
}
const nums = Object.keys(bases).map(Number).sort((a, b) => a - b);

const aSum = nums.reduce((s, n) => s + (bases[n].A || 0), 0);
const bSum = nums.reduce((s, n) => s + (bases[n].B || 0), 0);
const total = aSum + bSum;
const mirrorBad = nums.filter((n) => bases[n].A !== bases[n].B);

console.log("file: " + file);
console.log("bases: " + nums.length + "  rows: " + rows.length);
console.log("A sum: " + aSum + "   B sum: " + bSum + "   total: " + total);
console.log("declared total_stocks: " + doc.total_stocks + "  x2: " + (Number(doc.total_stocks) * 2));
console.log("declared total_rows: " + doc.total_rows + "  (bases match: " + (Number(doc.total_rows) === nums.length) + ")");
console.log("A/B mirror breaks: " + (mirrorBad.length ? mirrorBad.join(", ") : "none"));
console.log("");

console.log("base  A   B   delta-to-next");
for (let i = 0; i < nums.length; i++) {
  const n = nums[i];
  const v = bases[n].A;
  const nxt = i + 1 < nums.length ? bases[nums[i + 1]].A : null;
  console.log(String(n).padStart(4) + String(v).padStart(4) + String(bases[n].B).padStart(4) + (nxt === null ? "" : String(nxt - v).padStart(14)));
}
console.log("");

console.log("local anomalies (value vs mean of neighbours):");
for (let i = 1; i < nums.length - 1; i++) {
  const prev = bases[nums[i - 1]].A, cur = bases[nums[i]].A, next = bases[nums[i + 1]].A;
  const mean = (prev + next) / 2;
  const dev = cur - mean;
  if (Math.abs(dev) >= 2.5) console.log("  base " + nums[i] + ": " + cur + "  (prev " + prev + ", next " + next + ")  dev " + (dev > 0 ? "+" : "") + dev);
}
console.log("");
const drops = [];
for (let i = 1; i < nums.length; i++) drops.push({ base: nums[i], d: bases[nums[i]].A - bases[nums[i - 1]].A });
console.log("largest rises: " + drops.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5).map((x) => "base " + x.base + " +" + x.d).join(", "));
console.log("largest drops: " + drops.slice().sort((a, b) => a.d - b.d).slice(0, 5).map((x) => "base " + x.base + " " + x.d).join(", "));
