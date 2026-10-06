// Dump every row's stock_count from a block file. Usage: node scripts/dump-row-values.js <file.json>
const fs = require("fs");
const file = process.argv[2];
if (!file) { console.error("usage: node scripts/dump-row-values.js <file.json>"); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = doc.rows || [];
let line = "";
for (const r of rows) {
  line += (r.row_number + "=" + r.stock_count).padEnd(9);
  if (line.length >= 63) { console.log(line.trimEnd()); line = ""; }
}
if (line.trim()) console.log(line.trimEnd());
console.log("");
console.log("rows: " + rows.length);
console.log("sum:  " + rows.reduce((s, r) => s + (Number(r.stock_count) || 0), 0));
