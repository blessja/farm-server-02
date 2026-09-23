require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const DB_NAMES = ["farm-managment", "Glen-Oak"];

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

async function countIn(dbName, model, filter) {
  try {
    const conn = mongoose.createConnection(uriFor(dbName), {
      serverSelectionTimeoutMS: 15000,
    });
    await conn.asPromise();
    const c = conn.db.collection(model);
    const n = await c.countDocuments(filter);
    const sample = await c.find(filter).limit(8).toArray();
    console.log(`[${dbName}] ${model} ${JSON.stringify(filter)} -> ${n}`);
    sample.forEach((s) => {
      const { _id, workerID, name, workerName, workerId } = s;
      console.log("   ", String(_id), "|", workerID || workerId || "-", "|", name || workerName || "-");
    });
    await conn.close();
  } catch (e) {
    console.error(`[${dbName}] ${model} ERROR: ${e.message}`);
  }
}

(async () => {
  for (const db of DB_NAMES) {
    await countIn(db, "workers", { $or: [{ name: /Test/ }, { workerID: "T-1" }] });
    await countIn(db, "workerclocks", { $or: [{ workerName: /Test/ }, { workerID: "T-1" }] });
    await countIn(db, "pieceworkworkers", { $or: [{ name: /Test/ }, { workerID: "T-1" }] });
    await countIn(db, "workeractivities", { $or: [{ workerId: "T-1" }, { type: /test/i }] });
    await countIn(db, "rows", { $or: [{ worker_name: /Test/ }, { workerID: "T-1" }] });
  }
  process.exit(0);
})();