require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const { resolveMongoUri } = require("../config/db");
const Block = require("../models/Block");

async function main() {
  await mongoose.connect(resolveMongoUri(), { serverSelectionTimeoutMS: 15000 });

  const allBlocks = await Block.find().lean();

  console.log("=== Rows with remaining_stock_count > 0 (leftover vines) ===");
  let farmTotals = { rows: 0, vines: 0 };
  allBlocks.forEach((b) => {
    (b.rows || []).forEach((r) => {
      if ((r.remaining_stock_count ?? 0) > 0) {
        farmTotals.rows += 1;
        farmTotals.vines += r.remaining_stock_count;
        if (b.block_name === "Block 16") {
          console.log(
            "  Block 16 row " + r.row_number +
              ": full " + r.stock_count +
              " | remaining " + r.remaining_stock_count +
              " | worker " + (r.worker_id || "-")
          );
        }
      }
    });
  });
  console.log("Total rows with leftover in ALL blocks:", farmTotals.rows, "| leftover vines:", farmTotals.vines);

  const b16 = allBlocks.find((b) => b.block_name === "Block 16");
  console.log("\n=== Block 16 summary (155 row records) ===");
  const completed = { n: 0, vines: 0 };
  const untouched = { n: 0, vines: 0 };
  const partial = { n: 0, vines: 0 };
  (b16.rows || []).forEach((r) => {
    const rem = r.remaining_stock_count;
    if (rem === 0) {
      completed.n += 1;
      completed.vines += r.stock_count || 0;
    } else if (rem == null) {
      untouched.n += 1;
      untouched.vines += r.stock_count || 0;
    } else {
      partial.n += 1;
      partial.vines += rem;
    }
  });
  console.log("Completed (remaining = 0):", completed.n, "rows /", completed.vines, "vines");
  console.log("Untouched (remaining = null):", untouched.n, "rows /", untouched.vines, "vines");
  console.log("Partial/leftover (remaining > 0):", partial.n, "rows /", partial.vines, "vines");

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });