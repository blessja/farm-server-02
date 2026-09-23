/**
 * Seed script: populates one month of piecework data for the Totals screen.
 * Covers regular (Workday) totals -> Worker collection,
 * fast totals -> PieceworkWorker collection,
 * and per-worker-per-day hours -> WorkerDayHours collection.
 *
 * Run once:  node scripts/seed-monthly.js
 * Cleanup:   node scripts/seed-monthly.js --clear
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Worker = require("../models/Worker");
const PieceworkWorker = require("../models/PieceworkWorker");
const WorkerDayHours = require("../models/WorkerDayHours");
const { resolveMongoUri } = require("../config/db");

const MONGO_URI = resolveMongoUri();

const FIRST_NAMES = [
  "Amahle", "Bongani", "Thando", "Lungile", "Sipho", "Nompumelelo", "Khanyi",
  "Mandla", "Zanele", "Sibusiso", "Ayanda", "Thembeka", "Nkosi", "Lwazi",
  "Anitha", "Brenda", "Chantal", "Diane", "Eleanor", "Fiona", "Gloria",
  "Hannah", "Irene", "Janet", "Karen", "Laura", "Maria", "Nancy",
  "Olivia", "Patricia", "Rachel", "Sarah", "Teresa", "Vanessa", "Wendy",
  "Yvonne", "Zelda", "Adrian", "Benjamin", "Charles", "Daniel", "Edward",
];

const LAST_NAMES = [
  "Mthembu", "Ndlovu", "Dlamini", "Mokoena", "Khumalo", "Zulu", "Nkosi",
  "Molefe", "Mahlangu", "Sithole", "Bongwe", "Cele", "Mkhize", "Gumede",
  "Barends", "Chamisa", "Van Wyk", "Kanyinji", "Smith", "Johnson", "Brown",
  "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin",
  "Garcia", "Robinson", "Clark", "Lewis", "Walker", "Hall", "Young",
  "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson",
];

const BLOCKS = ["Block 1", "Block 3", "Block 5", "Block 7"];
const ROWS_PER_BLOCK = ["1A", "1B", "2A", "2B", "3A", "3B"];

// Regular (Workday) job types
const JOB_TYPES = ["PRUNING", "TYING", "PLANTING", "THINNING"];

// Fast piecework job types
const FAST_JOB_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];

const START_DATE = new Date("2026-08-03");
const END_DATE = new Date("2026-08-31");

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getWorkDays(startDate, endDate) {
  const days = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      days.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDayOfWeek(date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function formatDateKey(date) {
  return date.toISOString().split("T")[0];
}

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    if (process.argv.includes("--clear")) {
      await Worker.deleteMany({});
      await PieceworkWorker.deleteMany({});
      await WorkerDayHours.deleteMany({});
      console.log("Cleared Worker, PieceworkWorker and WorkerDayHours documents");
      await mongoose.disconnect();
      return;
    }

    const workDays = getWorkDays(START_DATE, END_DATE);
    console.log(
      `Generating ${workDays.length} work days from ${START_DATE.toDateString()} to ${END_DATE.toDateString()}`
    );

    const numWorkers = 40;
    const names = [];
    for (let i = 0; i < numWorkers; i++) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[i % LAST_NAMES.length];
      names.push({ first, last, id: String(2001 + i) });
    }

    const regularWorkers = [];
    const fastWorkers = [];
    const dayHourDocs = [];

    for (const { first, last, id } of names) {
      const workerName = `${first} ${last}`;
      const assignedBlock = pick(BLOCKS);
      const assignedRow = pick(ROWS_PER_BLOCK);
      const primaryJob = pick(JOB_TYPES);

      // ── Workday (regular) totals ──
      const regularBlocks = {};
      regularBlocks[assignedBlock] = [];
      const hoursByDate = {};

      const regularDays = workDays.filter(() => Math.random() < 0.7);
      for (const day of regularDays) {
        const vines = randInt(18, 85);
        const minutes = randInt(30, 420);
        const dayKey = formatDateKey(day);

        regularBlocks[assignedBlock].push({
          row_number: assignedRow,
          job_type: primaryJob,
          stock_count: vines,
          time_spent: minutes,
          date: day,
          day_of_week: formatDayOfWeek(day),
        });
        hoursByDate[dayKey] = Math.round((minutes / 60 + 0.3) * 10) / 10;
      }

      const regularBlockDocs = Object.entries(regularBlocks).map(
        ([block_name, rows]) => ({ block_name, rows })
      );

      regularWorkers.push({
        workerID: id,
        name: workerName,
        blocks: regularBlockDocs,
      });

      // ── Fast totals ──
      const doesFast = Math.random() < 0.65;
      if (doesFast) {
        const fastBlocks = {};
        const fastDays = workDays.filter(() => Math.random() < 0.5);
        for (const day of fastDays) {
          const fastBlock = pick(BLOCKS);
          const fastRow = pick(ROWS_PER_BLOCK);
          const fastJob = pick(FAST_JOB_TYPES);
          const stockCount = randInt(40, 140); // a completed row of vines
          const dayKey = formatDateKey(day);

          if (!fastBlocks[fastBlock]) fastBlocks[fastBlock] = [];
          fastBlocks[fastBlock].push({
            row_number: fastRow,
            job_type: fastJob,
            stock_count: stockCount,
            date: day,
            day_of_week: formatDayOfWeek(day),
          });

          const existing = hoursByDate[dayKey] || 0;
          hoursByDate[dayKey] = Math.round((Math.max(existing, 2 + Math.random() * 6)) * 10) / 10;
        }

        const fastBlockDocs = Object.entries(fastBlocks).map(
          ([block_name, rows]) => ({ block_name, rows })
        );

        fastWorkers.push({
          workerID: id,
          name: workerName,
          blocks: fastBlockDocs,
        });
      }

      // ── Hours worked per day (shared by worker regardless of source) ──
      Object.keys(hoursByDate).forEach((dayKey) => {
        dayHourDocs.push({
          workerID: id,
          workerName,
          date: dayKey,
          hours: hoursByDate[dayKey],
        });
      });
    }

    console.log(`Inserting ${regularWorkers.length} worker documents...`);
    await Worker.insertMany(regularWorkers, { ordered: false });

    console.log(`Inserting ${fastWorkers.length} fast piecework documents...`);
    await PieceworkWorker.insertMany(fastWorkers, { ordered: false });

    console.log(`Inserting ${dayHourDocs.length} day-hour entries...`);
    await WorkerDayHours.insertMany(dayHourDocs, { ordered: false });

    console.log("Done! Seeded one month of piecework totals + day hours.");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Seed failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();