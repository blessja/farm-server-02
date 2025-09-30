// migration-script.js
const mongoose = require("mongoose");
const Block = require("./models/Block"); // Adjust path to your Block model

// MongoDB connection string
const MONGO_URI =
  "mongodb+srv://admin-Jackson:jaydenjackson1@cluster0.bnu3c.mongodb.net/farm-managment?retryWrites=true&w=majority";

async function migrateToActiveJobs() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const blocks = await Block.find();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const block of blocks) {
      let blockModified = false;

      for (const row of block.rows) {
        // Skip if already migrated or no worker checked in
        if (row.active_jobs || !row.worker_id) {
          skippedCount++;
          continue;
        }

        // Initialize active_jobs array
        row.active_jobs = [];

        // If there's an active check-in (has worker_id and start_time, no time_spent)
        if (row.worker_id && row.start_time && !row.time_spent) {
          console.log(
            `Migrating active check-in: Block ${block.block_name}, Row ${row.row_number}, Worker ${row.worker_id}`
          );

          row.active_jobs.push({
            worker_name: row.worker_name || "",
            worker_id: row.worker_id,
            job_type: row.job_type || "UNKNOWN", // Default if missing
            start_time: row.start_time,
            remaining_stock: row.remaining_stock_count || row.stock_count || 0,
            time_spent: null,
          });

          blockModified = true;
          migratedCount++;
        }
      }

      if (blockModified) {
        await block.save();
        console.log(`✓ Saved Block ${block.block_name}`);
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Migrated: ${migratedCount} active check-ins`);
    console.log(
      `Skipped: ${skippedCount} rows (no active check-in or already migrated)`
    );
    console.log("==========================\n");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

// Run migration
migrateToActiveJobs();
