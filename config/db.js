const mongoose = require("mongoose");

// Two databases live on the same MongoDB cluster:
//   - production (real data, default):  farm-managment  (MONGO_DB_NAME)
//   - development (safe to experiment): Glen-Oak       (MONGO_DB_NAME_DEV)
// Set MONGO_DB=development in .env to run the server / scripts against the dev
// database; any other value (or unset) uses production.
function resolveDatabaseName() {
  const mode = String(process.env.MONGO_DB || "").toLowerCase();
  if (mode === "development") {
    return process.env.MONGO_DB_NAME_DEV || "Glen-Oak";
  }
  return process.env.MONGO_DB_NAME || "farm-managment";
}

// Swap the database path segment of MONGO_URI for the selected database name.
function resolveMongoUri() {
  const base = process.env.MONGO_URI || "";
  if (!base) return "";
  return base.replace(/\/[^/?#]+(?=[?#]|$)/, `/${resolveDatabaseName()}`);
}

const connectDB = async () => {
  try {
    const uri = resolveMongoUri();
    await mongoose.connect(uri);
    console.log(
      `MongoDB connected!! (database: ${resolveDatabaseName()}, mode: ${String(
        process.env.MONGO_DB || "production"
      )})`
    );
  } catch (error) {
    console.log("Failed to connect to MongoDB", error);
  }
};

module.exports = connectDB;
module.exports.resolveMongoUri = resolveMongoUri;
module.exports.resolveDatabaseName = resolveDatabaseName;