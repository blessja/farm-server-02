/**
 * Seed script: populates ~150 workers with 2 months of daily piecework totals.
 * Run once:  node scripts/seed-totals.js
 * Cleanup:   node scripts/seed-totals.js --clear
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Worker = require("../models/Worker");

const MONGO_URI = process.env.MONGO_URI;

const FIRST_NAMES = [
  "Amahle", "Bongani", "Thando", "Lungile", "Sipho", "Nompumelelo", "Khanyi",
  "Mandla", "Zanele", "Sibusiso", "Ayanda", "Thembeka", "Nkosi", "Lwazi",
  "Anitha", "Brenda", "Chantal", "Diane", "Eleanor", "Fiona", "Gloria",
  "Hannah", "Irene", "Janet", "Karen", "Laura", "Maria", "Nancy",
  "Olivia", "Patricia", "Rachel", "Sarah", "Teresa", "Vanessa", "Wendy",
  "Yvonne", "Zelda", "Adrian", "Benjamin", "Charles", "Daniel", "Edward",
  "Francis", "George", "Henry", "Ivan", "James", "Kevin", "Leonard",
  "Michael", "Nicholas", "Oscar", "Patrick", "Raymond", "Steven", "Thomas",
  "Victor", "William", "Xavier", "Yusuf", "Zander", "Abigail", "Bethlehem",
  "Celeste", "Dikeledi", "Esther", "Fikile", "Gugulethu", "Hlengiwe",
  "Imelda", "Jabulile", "Kgomotso", "Lerato", "Mandisa", "Ntombi",
  "Precious", "Refilwe", "Siphosethu", "Thandeka", "Unathi", "Vuyiswa",
  "Zinhle", "Ashleigh", "Bianca", "Carmen", "Demi", "Emma", "Gabriella",
  "Hope", "Isabella", "Jade", "Kayla", "Lily", "Megan", "Natalie",
  "Paula", "Queenie", "Rebecca", "Stacey", "Tiffany", "Ursula", "Violet",
];

const LAST_NAMES = [
  "Mthembu", "Ndlovu", "Dlamini", "Mokoena", "Khumalo", "Zulu", "Nkosi",
  "Molefe", "Mahlangu", "Sithole", "Bongwe", "Cele", "Mkhize", "Gumede",
  "Barends", "Chamisa", "Van Wyk", "Kanyinji", "Smith", "Johnson", "Brown",
  "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin",
  "Garcia", "Robinson", "Clark", "Lewis", "Walker", "Hall", "Young",
  "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Hill",
  "Ramirez", "Campbell", "Mitchell", "Roberts", "Carter", "Phillips",
  "Evans", "Turner", "Torres", "Parker", "Collins", "Edwards", "Stewart",
  "Flores", "Morris", "Nguyen", "Murphy", "Rivera", "Cook", "Rogers",
  "Morgan", "Peterson", "Cooper", "Reed", "Bailey", "Bell", "Gomez",
  "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson",
  "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray",
  "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders",
  "Patel", "Myers", "Long", "Ross", "Foster", "Jimenez", "Powell",
];

const BLOCKS = [
  "Block 1", "Block 2", "Block 3", "Block 4", "Block 5",
  "Block 6", "Block 7", "Block 8", "Block 9", "Block 10",
];

const ROWS_PER_BLOCK = ["1A", "1B", "1C", "2A", "2B", "2C", "3A", "3B", "3C", "4A", "4B", "4C", "5A", "5B", "5C"];

const JOB_TYPES = ["PRUNING", "TYING", "PLANTING", "THINNING"];

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

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    if (process.argv.includes("--clear")) {
      await Worker.deleteMany({});
      console.log("Cleared all Worker documents");
      await mongoose.disconnect();
      return;
    }

    const startDate = new Date("2026-06-22");
    const endDate = new Date("2026-08-21");
    const workDays = getWorkDays(startDate, endDate);
    console.log(`Generating ${workDays.length} work days from ${startDate.toDateString()} to ${endDate.toDateString()}`);

    const names = [];
    for (let i = 0; i < 150; i++) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[i % LAST_NAMES.length];
      names.push({ first, last, id: String(1001 + i) });
    }

    const workers = [];

    for (const { first, last, id } of names) {
      const workerName = `${first} ${last}`;
      const assignedBlock = pick(BLOCKS);
      const assignedRow = pick(ROWS_PER_BLOCK);
      const primaryJob = pick(JOB_TYPES);

      const blocks = {};
      blocks[assignedBlock] = [];

      const workDaysThisWorker = workDays.filter(() => Math.random() < 0.75);

      for (const day of workDaysThisWorker) {
        const vines = randInt(18, 85);
        const minutes = randInt(30, 420);
        const dayKey = day.toISOString().split("T")[0];

        blocks[assignedBlock].push({
          row_number: assignedRow,
          job_type: primaryJob,
          stock_count: vines,
          time_spent: minutes,
          date: day,
          day_of_week: formatDayOfWeek(day),
        });
      }

      const blockDocs = Object.entries(blocks).map(([block_name, rows]) => ({
        block_name,
        rows,
      }));

      workers.push({
        workerID: id,
        name: workerName,
        blocks: blockDocs,
      });
    }

    console.log(`Inserting ${workers.length} workers...`);
    await Worker.insertMany(workers, { ordered: false });
    console.log("Done! Seeded 150 workers with 2 months of piecework data.");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Seed failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
