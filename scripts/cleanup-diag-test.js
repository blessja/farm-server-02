require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const DB_NAMES = ["farm-managment", "Glen-Oak"];

function uriFor(dbName) {
  const base = process.env.MONGO_URI || "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${dbName}`);
}

(async () => {
  for (const db of DB_NAMES) {
    const conn = mongoose.createConnection(uriFor(db), {
      serverSelectionTimeoutMS: 15000,
    });
    await conn.asPromise();
    const w = await conn.db.collection("workers").deleteMany({
      workerID: "W-TEST-1",
    });
    const c = await conn.db.collection("workerclocks").deleteMany({
      $or: [{ workerID: "W-TEST-1" }, { workerName: /Checkout-Diag/ }],
    });
    const p = await conn.db
      .collection("pieceworkworkers")
      .deleteMany({ $or: [{ workerID: "W-TEST-1" }, { name: /Checkout-Diag/ }] });
    console.log(
      `[${db}] removed workers:${w.deletedCount} workerclocks:${c.deletedCount} pieceworkworkers:${p.deletedCount}`
    );
    await conn.close();
  }
  process.exit(0);
})();