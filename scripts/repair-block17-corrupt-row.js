// Repair: remove the malformed rows[] entry from Block 17 in production.
//
// Why match on the bogus field key instead of _id:
// Block 17's rows[] subdocuments carry NO _id (verified via raw BSON), so a
// _id-based match silently matches nothing. The corrupt element's single field
// key is the stringified JS literal; only that one element has it, which makes
// it a safe, self-validating selector.
//
// Uses the raw driver rather than Mongoose so nothing casts or rejects the
// malformed key on its way to the server.
//
// Safety model:
//   1. Full document JSON backup to disk before any write.
//   2. Preconditions asserted against fresh reads (exactly 1 malformed element,
//      exactly 1 malformed element with exactly 1 field, exactly 1 real '97B').
//   3. Majority write concern, with the corrupt key in the filter so a
//      concurrent change makes the update a no-op rather than a wrong delete.
//   4. Re-read and verify.
//
// Dry run by default. Pass --apply to write.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolveDatabaseName } = require("../config/db");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

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
  const conn = await mongoose.createConnection(uriFor(dbName), {
    readPreference: "primary",
    writeConcern: { w: "majority" },
  });
  await conn.asPromise();
  const coll = conn.db.collection("blocks");

  const doc = await coll.findOne({ block_name: "Block 17" });
  if (!doc) throw new Error("Block 17 not found in " + dbName);

  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  const bad = rows.filter(isMalformed);

  if (bad.length === 0) {
    console.log("No malformed entry in Block 17 (" + dbName + "). Nothing to do.");
    await conn.close();
    return;
  }
  if (bad.length !== 1) {
    throw new Error(
      "Refusing: found " + bad.length + " malformed entries, expected 1. Manual review needed."
    );
  }

  const badKeys = Object.keys(bad[0]);
  if (badKeys.length !== 1) {
    throw new Error(
      "Refusing: malformed entry has " + badKeys.length + " keys (" +
      JSON.stringify(badKeys) + "), expected 1. Manual review needed."
    );
  }
  const bogusKey = badKeys[0];
  if (bogusKey.includes(".")) {
    throw new Error("Refusing: bogus field key contains a '.', cannot target it safely.");
  }

  const real97b = rows.filter((r) => r && r.row_number === "97B");
  if (real97b.length !== 1) {
    throw new Error(
      "Refusing: expected exactly 1 real '97B', found " + real97b.length +
      ". Manual review needed."
    );
  }

  const stockBefore = rows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);
  const badIdx = rows.findIndex(isMalformed);

  console.log("=== Block 17 / " + dbName + " : malformed entry ===");
  console.log("  array index:       " + badIdx + " of " + rows.length);
  console.log("  bogus field key:   " + JSON.stringify(bogusKey).slice(0, 100) + "...");
  console.log("  rows before:       " + rows.length);
  console.log("  stock sum before:  " + stockBefore);
  console.log("  real 97B preserved: stock=" + real97b[0].stock_count +
              " remaining=" + real97b[0].remaining_stock_count);

  // ---- STEP 1: backup ----
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, "block17-" + dbName + "-" + stamp + ".json");
  fs.writeFileSync(backupFile, JSON.stringify(doc, null, 2));
  console.log("\n  BACKUP: " + backupFile + " (" + fs.statSync(backupFile).size + " bytes)");

  if (!APPLY) {
    console.log("\n  DRY RUN - nothing changed. Re-run with --apply to execute.");
    await conn.close();
    return;
  }

  // ---- STEP 2: targeted $pull, corrupt key present in filter ----
  const res = await coll.updateOne(
    { _id: doc._id, ["rows." + bogusKey]: "" },
    { $pull: { rows: { [bogusKey]: "" } } },
    { writeConcern: { w: "majority" } }
  );
  console.log("\n  update matched: " + res.matchedCount + ", modified: " + res.modifiedCount);
  if (res.matchedCount !== 1) {
    console.log("  WARNING: matchedCount != 1 - document changed concurrently, review needed.");
  }

  // ---- STEP 3: verify ----
  const after = await coll.findOne({ _id: doc._id });
  const afterRows = Array.isArray(after.rows) ? after.rows : [];
  const stillBad = afterRows.filter(isMalformed);
  const after97b = afterRows.filter((r) => r && r.row_number === "97B");
  const stockAfter = afterRows.reduce((s, r) => s + (Number(r && r.stock_count) || 0), 0);

  console.log("\n=== Verification ===");
  console.log("  rows after:          " + afterRows.length + " (was " + rows.length + ")");
  console.log("  malformed remaining: " + stillBad.length + (stillBad.length ? "  <-- STILL PRESENT" : "  (clean)"));
  console.log("  real 97B count:      " + after97b.length + (after97b.length === 1 ? " (intact)" : " <-- PROBLEM"));
  console.log("  stock sum after:     " + stockAfter + " (was " + stockBefore + ")");
  console.log("  rollback source:     " + backupFile);

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });