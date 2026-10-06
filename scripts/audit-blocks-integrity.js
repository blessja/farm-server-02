// Read-only: farm-wide integrity audit with an explicit skip list.
// Reports, per block: missing halves, wholly absent base rows, duplicate or
// malformed labels, A/B pairs that disagree, zero-stock rows, bases beyond
// total_rows, and the stock sum vs total_stocks reconciliation.
//
// Usage: node scripts/audit-blocks-integrity.js <dbName> ["Block N" ...]
// No writes.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

const LABEL_RE = /^(\d+)([AB])$/;

// Rows the farm owner confirmed never existed. Their absence is not a defect,
// and each block's declared total_stocks already matches the stored sum.
const CONFIRMED_ABSENT = new Set([
  "Block 1:44B",
  "Block 2:57B",
  "Block 3:1A",
  "Block 4:45B",
  "Block 5:37B",
  "Block 6:1A",
  "Block 10:1A",
  "Block 10:30A",
  "Block 10:30B",
]);

// Block 13 is not being used for the 2026 season, so its defects are inert.
// Reported as DEFERRED rather than counted as an open issue.
const DEFERRED = new Set(["Block 13"]);

function isWellFormed(label) {
  return typeof label === "string" && label.length <= 6 && /^\d+[AB]?$/.test(label);
}

function halvesOf(rows) {
  const map = {};
  rows.forEach((r) => {
    const m = LABEL_RE.exec(String(r && r.row_number));
    if (!m) return;
    map[m[1]] = map[m[1]] || {};
    map[m[1]][m[2]] = Number(r.stock_count) || 0;
  });
  return map;
}

async function main() {
  const dbName = process.argv[2];
  if (!dbName) {
    console.error("usage: node audit-blocks-integrity.js <dbName> [\"Block N\" ...]");
    process.exit(1);
  }
  const skip = new Set(process.argv.slice(3));

  const conn = await mongoose.createConnection(uriFor(dbName), { readPreference: "primary" });
  await conn.asPromise();
  const blocks = await conn.db.collection("blocks").find({}).toArray();
  blocks.sort((a, b) =>
    String(a.block_name).localeCompare(String(b.block_name), undefined, { numeric: true })
  );

  console.log(`=== BLOCK INTEGRITY AUDIT: ${dbName} ===`);
  if (skip.size) console.log(`skipping: ${[...skip].join(", ")}`);
  console.log("");

  const flagged = [];
  const deferredList = [];

  for (const b of blocks) {
    const name = String(b.block_name);
    if (skip.has(name)) {
      console.log(`${name.padEnd(9)} SKIPPED`);
      continue;
    }

    const rows = Array.isArray(b.rows) ? b.rows : [];
    const declared = Number(b.total_rows) || 0;
    const declaredStocks = Number(b.total_stocks) || 0;
    const labels = rows.map((r) => String(r && r.row_number));
    const labelSet = new Set(labels);
    const halves = halvesOf(rows);
    const sum = rows.reduce((acc, r) => acc + (Number(r && r.stock_count) || 0), 0);
    const gap = declaredStocks - sum;

    // missing halves, scanned across the full declared range
    const missingHalves = [];
    const confirmedAbsent = [];
    for (let n = 1; n <= declared; n++) {
      const p = halves[String(n)];
      if (!p || p.A == null) (CONFIRMED_ABSENT.has(`${name}:${n}A`) ? confirmedAbsent : missingHalves).push(`${n}A`);
      if (!p || p.B == null) (CONFIRMED_ABSENT.has(`${name}:${n}B`) ? confirmedAbsent : missingHalves).push(`${n}B`);
    }

    // base rows where neither half exists
    const deadBases = [];
    for (let n = 1; n <= declared; n++) {
      const p = halves[String(n)];
      if (!p || (p.A == null && p.B == null)) {
        const bothConfirmed = confirmedAbsent.includes(`${n}A`) && confirmedAbsent.includes(`${n}B`);
        if (!bothConfirmed) deadBases.push(n);
      }
    }

    // duplicate labels
    const counts = {};
    labels.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
    const dupes = Object.keys(counts).filter((k) => counts[k] > 1);

    // labels that are not nA / nB
    const malformed = labels.filter((l) => !LABEL_RE.test(l));

    // A/B pairs that disagree
    const disagree = Object.keys(halves)
      .filter((n) => halves[n].A != null && halves[n].B != null && halves[n].A !== halves[n].B)
      .sort((a, c) => a - c);

    // bases present beyond total_rows
    const basesPresent = [...new Set(labels.map((l) => parseInt(l, 10)).filter(Number.isFinite))];
    const highestBase = basesPresent.length ? Math.max(...basesPresent) : 0;
    const lowestBase = basesPresent.length ? Math.min(...basesPresent) : 0;
    const beyond = basesPresent.filter((n) => n > declared).sort((a, c) => a - c);
    const beyondLabels = labels.filter((l) => beyond.includes(parseInt(l, 10)));

    const zeroStock = rows.filter((r) => (Number(r && r.stock_count) || 0) === 0);

    const issues = [];
    if (missingHalves.length) issues.push(`${missingHalves.length} missing half-row(s)`);
    if (deadBases.length) issues.push(`${deadBases.length} base(s) entirely absent`);
    if (dupes.length) issues.push(`${dupes.length} duplicate label(s)`);
    if (malformed.length) issues.push(`${malformed.length} malformed label(s)`);
    if (disagree.length) issues.push(`${disagree.length} mismatched pair(s)`);
    if (zeroStock.length) issues.push(`${zeroStock.length} zero-stock row(s)`);
    if (beyond.length) issues.push(`base beyond total_rows`);
    if (gap !== 0) issues.push(`stock gap ${gap > 0 ? "+" : ""}${gap}`);

    const clean = issues.length === 0;
    const deferred = DEFERRED.has(name);
    console.log(
      `${name.padEnd(9)} rows=${String(rows.length).padStart(4)}/${String(declared * 2).padStart(4)} expected  ` +
      `bases ${lowestBase}-${highestBase} of ${declared}  ` +
      `sum=${String(sum).padStart(5)} total_stocks=${String(declaredStocks).padStart(5)} (${gap > 0 ? "+" : ""}${gap})  ` +
      `${deferred ? "DEFERRED (not used for 2026)" : clean ? "CLEAN" : issues.join(" | ")}`
    );
    if (deferred && !clean) console.log(`           (issues noted, not counted: ${issues.join(" | ")})`);

    if (missingHalves.length) {
      const hints = missingHalves.map((l) => {
        const m = LABEL_RE.exec(l);
        const partner = halves[m[1]] && halves[m[1]][m[2] === "A" ? "B" : "A"];
        return `${l}=${partner === undefined ? "no partner" : partner}`;
      });
      const known = missingHalves.reduce((acc, l) => {
        const m = LABEL_RE.exec(l);
        const partner = halves[m[1]] && halves[m[1]][m[2] === "A" ? "B" : "A"];
        return acc + (partner === undefined ? 0 : partner);
      }, 0);
      const unknown = missingHalves.filter((l) => {
        const m = LABEL_RE.exec(l);
        const partner = halves[m[1]] && halves[m[1]][m[2] === "A" ? "B" : "A"];
        return partner === undefined;
      });
      console.log(`           missing: ${hints.join(", ")}`);
      console.log(`           partner-matched total ${known} -> sum would be ${sum + known} against total_stocks ${declaredStocks}` +
        (unknown.length ? `  (${unknown.length} row(s) have no partner: ${unknown.join(", ")})` : ""));
      if (sum + known === declaredStocks) {
        console.log(`           RECONCILES EXACTLY`);
      } else if (sum + known < declaredStocks) {
        console.log(`           still short ${declaredStocks - (sum + known)} after partner match`);
      } else {
        console.log(`           would OVERSHOOT by ${(sum + known) - declaredStocks} - declared total already matches the stored sum`);
      }
    }
    if (confirmedAbsent.length) {
      console.log(`           confirmed absent (owner, not a defect): ${confirmedAbsent.join(", ")}`);
    }
    if (deadBases.length) console.log(`           base(s) entirely absent: ${deadBases.join(", ")}`);
    if (dupes.length) console.log(`           duplicates: ${dupes.join(", ")}`);
    if (malformed.length) console.log(`           malformed: ${malformed.join(", ")}`);
    if (disagree.length) {
      console.log(`           mismatched pairs: ${disagree.map((n) => `base ${n} A=${halves[n].A} B=${halves[n].B}`).join(", ")}`);
    }
    if (zeroStock.length) {
      console.log(`           zero-stock rows: ${zeroStock.length} (${zeroStock.slice(0, 12).map((r) => r.row_number).join(", ")}${zeroStock.length > 12 ? ", ..." : ""})`);
    }
    if (beyond.length) {
      console.log(`           total_rows=${declared} understated: ${beyondLabels.join(", ")} present`);
    }

    if (!clean && !deferred) flagged.push(name);
    if (!clean && deferred) deferredList.push(name);
    console.log("");
  }

  console.log("=".repeat(70));
  console.log(`blocks audited:      ${blocks.length - skip.size}`);
  console.log(`blocks with issues:  ${flagged.length}  ${flagged.length ? "-> " + flagged.join(", ") : ""}`);
  if (deferredList.length) console.log(`deferred (2026):     ${deferredList.length}  -> ${deferredList.join(", ")}`);
  console.log(`blocks fully clean:  ${blocks.length - skip.size - flagged.length - deferredList.length}`);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + (e && e.stack || e)); process.exit(1); });