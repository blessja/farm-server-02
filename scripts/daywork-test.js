// scripts/daywork-test.js
//
// Daywork (regular check-in / check-out) scenario tests.
//
// Covers:
//   - Full row completion round-trip
//   - Multiple check-ins (duplicate blocked, same-row conflict, override, multi-row/multi-job)
//   - Partial checkout then resume the same row (remaining vines carry over)
//   - Another worker continuing half a row "from yesterday"
//
// Safety: runs against an ISOLATED throwaway Mongo database
// (`farm-daywork-test`) on the same cluster as MONGO_URI. The test DB is
// dropped before and after the run. Real data is never touched.
//
// Run: node --test scripts/daywork-test.js

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const mongoose = require("mongoose");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const Block = require("../models/Block");
const Worker = require("../models/Worker");
const rowController = require("../controllers/rowController");

const TEST_DB = "farm-daywork-test";
const BLOCK = "BLOCK-1";

if (!process.env.DEBUG_LOGS) {
  console.log = () => {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (body) {
    this.body = body;
    return this;
  };
  res.send = function (body) {
    this.body = body;
    return this;
  };
  return res;
}

async function call(fn, body) {
  const req = { body, params: {}, query: {} };
  const res = makeRes();
  await fn(req, res);
  return { status: res.statusCode, body: res.body };
}

const checkin = (workerID, workerName, rowNumber, jobType, allowMultipleWorkers) =>
  call(rowController.checkInWorker, {
    workerID,
    workerName,
    rowNumber,
    blockName: BLOCK,
    jobType,
    allowMultipleWorkers,
  });

const checkout = (workerID, workerName, rowNumber, jobType, stockCount) =>
  call(rowController.checkOutWorker, {
    workerID,
    workerName,
    rowNumber,
    blockName: BLOCK,
    jobType,
    stockCount,
  });

async function rowState(rowNumber) {
  const block = await Block.findOne({ block_name: BLOCK });
  return block.rows.find((r) => r.row_number === rowNumber);
}

async function workerState(workerID) {
  return Worker.findOne({ workerID });
}

async function currentCheckinsFor(workerID) {
  const r = await call(rowController.getCurrentCheckins, {});
  if (r.status === 404 || !Array.isArray(r.body)) return [];
  return r.body.filter((c) => c.workerID === workerID);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
before(async () => {
  const uri = process.env.MONGO_URI;
  assert.ok(uri, "MONGO_URI missing from .env");
  const testUri = uri.replace("farm-managment", TEST_DB);
  if (testUri === uri) throw new Error("Could not derive test DB URI from MONGO_URI");
  await mongoose.connect(testUri);
  await mongoose.connection.dropDatabase();

  const block = new Block({
    block_name: BLOCK,
    variety: "Merlot",
    year_planted: 2018,
    rootstock: "101-14",
    total_stocks: 440,
    total_rows: 5,
    size_ha: 2.5,
    rows: [
      { row_number: "1", stock_count: 100, bunches: 20 },
      { row_number: "2", stock_count: 80, bunches: 16 },
      { row_number: "3", stock_count: 60, bunches: 12 },
      { row_number: "4", stock_count: 100, bunches: 20 },
      { row_number: "5", stock_count: 100, bunches: 20 },
    ],
  });
  await block.save();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test("T1: full completion - check in and complete an entire row", async () => {
  const r = await checkin("W001", "Alice", "1", "PRUNING");
  assert.equal(r.status, 200);
  assert.equal(r.body.remainingStock, 100);

  // She must appear in current check-ins while active.
  const during = await currentCheckinsFor("W001");
  assert.equal(during.length, 1);
  assert.equal(during[0].rowNumber, "1");

  const o = await checkout("W001", "Alice", "1", "PRUNING");
  assert.equal(o.status, 200);
  assert.equal(o.body.stockCompleted, 100);
  assert.equal(o.body.remainingStocks, 0);

  const state = await rowState("1");
  assert.equal(state.active_jobs.length, 0);

  // After full checkout she must no longer appear in current check-ins.
  assert.deepEqual(
    await currentCheckinsFor("W001"),
    [],
    "no phantom check-in should remain after a full checkout"
  );

  const w = await workerState("W001");
  assert.equal(w.total_stock_count, 100);
});

test("T2: duplicate check-in by the same worker is blocked", async () => {
  await checkin("W002", "Bob", "2", "PRUNING");
  const r = await checkin("W002", "Bob", "2", "PRUNING");
  assert.equal(r.status, 409);
  assert.ok(/already checked in/i.test(r.body.message));
  await checkout("W002", "Bob", "2", "PRUNING");
});

test("T3: same row+job by another worker -> conflict, then override allows both", async () => {
  await checkin("W003", "Cara", "2", "PRUNING");
  let r = await checkin("W004", "Dan", "2", "PRUNING");
  assert.equal(r.status, 409);
  assert.equal(r.body.conflict, true);
  assert.equal(r.body.canOverride, true);

  r = await checkin("W004", "Dan", "2", "PRUNING", true);
  assert.equal(r.status, 200);
  assert.equal(r.body.multipleWorkersAllowed, true);

  const state = await rowState("2");
  assert.equal(state.active_jobs.length, 2);

  await checkout("W003", "Cara", "2", "PRUNING");
  await checkout("W004", "Dan", "2", "PRUNING");
});

test("T4: different job on the same row is allowed without a conflict", async () => {
  await checkin("W005", "Eve", "3", "PRUNING");
  const r = await checkin("W006", "Finn", "3", "SUCKERING");
  assert.equal(r.status, 200);

  const state = await rowState("3");
  assert.equal(state.active_jobs.length, 2);

  await checkout("W005", "Eve", "3", "PRUNING");
  await checkout("W006", "Finn", "3", "SUCKERING");
});

test("T5: worker can check into two different rows concurrently", async () => {
  await checkin("W001", "Alice", "1", "PRUNING");
  const r = await checkin("W001", "Alice", "3", "SUCKERING");
  assert.equal(r.status, 200);

  const state1 = await rowState("1");
  assert.equal(state1.active_jobs.length, 1);

  await checkout("W001", "Alice", "1", "PRUNING");
  await checkout("W001", "Alice", "3", "SUCKERING");
});

test("T6: partial checkout then resume the SAME row (remaining vines carry over)", async () => {
  // Gina does 40 of row 4's 100 vines, then checks out.
  await checkin("W007", "Gina", "4", "PRUNING");
  let r = await checkout("W007", "Gina", "4", "PRUNING", 40);
  assert.equal(r.status, 200);
  assert.equal(r.body.stockCompleted, 40);
  assert.equal(r.body.remainingStocks, 60, "60 vines should remain after partial checkout");

  // A worker who has checked out must not appear in current check-ins.
  assert.deepEqual(await currentCheckinsFor("W007"), []);

  // Come back and continue the same row later.
  r = await checkin("W007", "Gina", "4", "PRUNING");
  assert.equal(r.status, 200);
  assert.equal(
    r.body.remainingStock,
    60,
    "should resume with the 60 remaining vines, NOT reset to the full 100"
  );

  // Finish the remaining 60.
  r = await checkout("W007", "Gina", "4", "PRUNING", 60);
  assert.equal(r.status, 200);
  assert.equal(r.body.remainingStocks, 0, "row should be fully complete after resume");

  const w = await workerState("W007");
  assert.equal(w.total_stock_count, 100, "Gina should have completed 100 vines in total");
});

test("T7: another worker continues HALF a row the next day", async () => {
  // Day 1: Hannah does half of row 5 (50 of 100) then leaves.
  await checkin("W008", "Hannah", "5", "PRUNING");
  let r = await checkout("W008", "Hannah", "5", "PRUNING", 50);
  assert.equal(r.status, 200);
  assert.equal(r.body.remainingStocks, 50, "50 vines should remain after Hannah's half row");

  assert.deepEqual(await currentCheckinsFor("W008"), []);

  // Day 2: Isaac picks up the remaining half of the same row.
  r = await checkin("W009", "Isaac", "5", "PRUNING");
  assert.equal(r.status, 200);
  assert.equal(
    r.body.remainingStock,
    50,
    "Isaac should start with the 50 vines Hannah left behind, NOT the full 100"
  );

  r = await checkout("W009", "Isaac", "5", "PRUNING");
  assert.equal(r.status, 200);
  assert.equal(r.body.stockCompleted, 50, "Isaac should complete the remaining 50 vines");
  assert.equal(r.body.remainingStocks, 0);

  const h = await workerState("W008");
  const i = await workerState("W009");
  assert.equal(h.total_stock_count, 50, "Hannah's total should be 50");
  assert.equal(i.total_stock_count, 50, "Isaac's total should be 50");
});