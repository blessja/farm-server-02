const Row = require("../models/Row");
const Stock = require("../models/Stock");
const Bunch = require("../models/Bunch");
const WorkerActivity = require("../models/WorkerActivity");
const Worker = require("../models/Worker");
const PieceworkWorker = require("../models/PieceworkWorker");
const Block = require("../models/Block");

exports.checkInWorkers = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName } = req.body;

  try {
    // Find the block
    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    // Find the row in the block
    const row = block.rows.find((row) => row.row_number === rowNumber);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    // Check if the row is available
    if (row.worker_name) {
      return res.status(400).json({
        message: `Row ${rowNumber} is already being worked on by ${row.worker_name}.`,
      });
    }

    // Assign the worker and set start time
    row.worker_name = workerName;
    row.worker_id = workerID;
    row.start_time = new Date();

    await block.save();

    // Optionally save worker if not existing
    const workerExists = await PieceworkWorker.findOne({ workerID });
    if (!workerExists) {
      const newWorker = new PieceworkWorker({
        workerID,
        name: workerName,
        blocks: [],
      });
      await newWorker.save();
    }

    res.json({ message: "Check-in successful", row });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Check-out Worker
// Check-out Worker
exports.checkOutWorkers = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, stockCount } = req.body;

  try {
    // Find the block and row
    const block = await Block.findOne({ block_name: blockName });
    if (!block) return res.status(404).json({ message: "Block not found" });

    const row = block.rows.find(
      (row) => row.row_number === rowNumber && row.worker_name === workerName
    );
    if (!row)
      return res.status(404).json({ message: "Row or worker not found" });

    const endTime = new Date();
    const timeSpentInMinutes = (endTime - row.start_time) / 1000 / 60;

    let calculatedStockCount = stockCount;
    if (typeof stockCount !== "number" || isNaN(stockCount)) {
      calculatedStockCount = row.stock_count;
    } else if (stockCount > row.stock_count) {
      return res
        .status(400)
        .json({ message: "Stock count exceeds available stocks" });
    }

    // Calculate bunches worked
    const avgBunchesPerStock =
      row.stock_count > 0 ? row.bunches / row.stock_count : 0;
    let bunchesWorked = avgBunchesPerStock * stockCount;

    // Round the bunches worked according to the rules
    const decimalPart = bunchesWorked % 1;
    if (decimalPart > 0.7) {
      bunchesWorked = Math.ceil(bunchesWorked);
    } else if (decimalPart >= 0.6) {
      bunchesWorked = Math.floor(bunchesWorked);
    }

    console.log("Total bunches:", row.bunches);
    console.log("Total stocks:", row.stock_count);
    console.log("Average bunches per stock:", avgBunchesPerStock); // Log average bunches
    console.log("Bunches worked:", bunchesWorked); // Log bunches worked

    // Update worker record in PieceworkWorker collection
    let worker = await PieceworkWorker.findOne({ workerID });
    if (!worker) {
      worker = new PieceworkWorker({
        workerID,
        name: workerName,
        blocks: [{ block_name: blockName, rows: [] }],
        total_stock_count: 0,
        total_bunches_worked: 0, // Initialize total bunches worked
      });
    }

    const blockIndex = worker.blocks.findIndex(
      (b) => b.block_name === blockName
    );
    const currentDate = new Date();

    // Update worker's blocks and rows
    if (blockIndex === -1) {
      worker.blocks.push({
        block_name: blockName,
        rows: [
          {
            row_number: rowNumber,
            stock_count: calculatedStockCount,
            bunches_worked: bunchesWorked,
            time_spent: timeSpentInMinutes,
            date: currentDate,
            day_of_week: currentDate.toLocaleDateString("en-US", {
              weekday: "long",
            }),
          },
        ],
      });
    } else {
      const rowIndex = worker.blocks[blockIndex].rows.findIndex(
        (r) => r.row_number === rowNumber
      );
      if (rowIndex === -1) {
        worker.blocks[blockIndex].rows.push({
          row_number: rowNumber,
          stock_count: calculatedStockCount,
          bunches_worked: bunchesWorked,
          time_spent: timeSpentInMinutes,
          date: currentDate,
          day_of_week: currentDate.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        });
      } else {
        worker.blocks[blockIndex].rows[rowIndex] = {
          row_number: rowNumber,
          stock_count: calculatedStockCount,
          bunches_worked: bunchesWorked,
          time_spent: timeSpentInMinutes,
          date: currentDate,
          day_of_week: currentDate.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        };
      }
    }

    // Update total counts
    worker.total_stock_count = worker.total_stock_count || 0;
    worker.total_bunches_worked = worker.total_bunches_worked || 0;
    worker.total_stock_count += calculatedStockCount;
    worker.total_bunches_worked += bunchesWorked; // Add bunches worked

    await worker.save();

    // Clear worker from the row in Block collection
    row.worker_name = "";
    row.worker_id = "";
    row.start_time = null;
    row.time_spent = null;

    // Save updated block
    await Block.findByIdAndUpdate(block._id, { $set: { rows: block.rows } });

    res.json({
      message: "Check-out successful",
      timeSpent: `${Math.floor(timeSpentInMinutes / 60)}hr ${Math.round(
        timeSpentInMinutes % 60
      )}min`,
      stockCount: calculatedStockCount,
      bunchesWorked,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
