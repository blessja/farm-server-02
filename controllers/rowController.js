const Worker = require("../models/Worker");
const Block = require("../models/Block");

// Check-in a worker
exports.checkInWorker = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, jobType } = req.body;

  try {
    console.log("Check-in request:", req.body);

    if (!workerID || !workerName || !rowNumber || !blockName) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Find block and row
    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    const row = block.rows.find((row) => row.row_number === rowNumber);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    if (row.worker_name) {
      return res.status(409).json({
        message: `Row ${rowNumber} is currently being worked on by ${row.worker_name}.`,
        remainingStocks: row.remaining_stock_count,
      });
    }

    // Set worker details and job type in the Block's row
    row.worker_name = workerName;
    row.worker_id = workerID;
    row.start_time = new Date();
    row.job_type = jobType; // Set the job type

    await block.save();

    // Ensure worker record exists with initial fields
    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        total_stock_count: 0,
        blocks: [],
      });
    }

    // Find block and row within the worker record
    let workerBlock = worker.blocks.find((b) => b.block_name === blockName);
    if (!workerBlock) {
      workerBlock = { block_name: blockName, rows: [] };
      worker.blocks.push(workerBlock);
    }

    let workerRow = workerBlock.rows.find((r) => r.row_number === rowNumber);
    if (!workerRow) {
      workerRow = {
        row_number: rowNumber,
        job_type: jobType, // Save job type in worker's row
        stock_count: 0, // Initialize stock count to avoid NaN errors
        time_spent: 0, // Initialize time spent to avoid NaN errors
        date: new Date(),
        day_of_week: new Date().toLocaleDateString("en-US", {
          weekday: "long",
        }),
      };
      workerBlock.rows.push(workerRow);
    }

    await worker.save();

    res.json({
      message: "Check-in successful",
      rowNumber: row.row_number,
      jobType: row.job_type,
    });
  } catch (error) {
    console.error("Error during check-in:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Check-out a worker
exports.checkOutWorker = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, stockCount } = req.body;

  try {
    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).send({ message: "Block not found" });
    }

    const row = block.rows.find(
      (row) => row.row_number === rowNumber && row.worker_name === workerName
    );
    if (!row) {
      return res.status(404).send({ message: "Row or worker not found" });
    }

    const endTime = new Date();
    const timeSpentInMinutes = (endTime - row.start_time) / 1000 / 60; // time in minutes

    // Validate and set calculated stock count
    let calculatedStockCount;
    if (typeof stockCount === "undefined" || stockCount === null) {
      calculatedStockCount = row.remaining_stock_count || row.stock_count;
    } else {
      calculatedStockCount = Number(stockCount);
      if (isNaN(calculatedStockCount)) {
        return res.status(400).send({ message: "Invalid stock count value." });
      }

      if (
        calculatedStockCount > (row.remaining_stock_count || row.stock_count)
      ) {
        return res
          .status(400)
          .send({ message: "Invalid stock count: exceeds available stocks" });
      }
    }

    // Update remaining stock count
    row.remaining_stock_count =
      (row.remaining_stock_count || row.stock_count) - calculatedStockCount;

    // Clear worker-specific details but keep the job type intact
    row.worker_name = "";
    row.worker_id = "";
    row.start_time = null;
    row.time_spent = null;

    await block.save();

    // Update or create worker record
    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        blocks: [],
        total_stock_count: 0,
        jobType: row.job_type, // Initial jobType set from row if worker does not exist
      });
    }

    const blockIndex = worker.blocks.findIndex(
      (b) => b.block_name === blockName
    );

    const currentDate = new Date();
    if (blockIndex === -1) {
      worker.blocks.push({
        block_name: blockName,
        rows: [
          {
            row_number: rowNumber,
            stock_count: calculatedStockCount,
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
          time_spent: timeSpentInMinutes,
          date: currentDate,
          day_of_week: currentDate.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        });
      } else {
        worker.blocks[blockIndex].rows[rowIndex].stock_count +=
          calculatedStockCount;
        worker.blocks[blockIndex].rows[rowIndex].time_spent +=
          timeSpentInMinutes;
        worker.blocks[blockIndex].rows[rowIndex].date = currentDate;
        worker.blocks[blockIndex].rows[rowIndex].day_of_week =
          currentDate.toLocaleDateString("en-US", {
            weekday: "long",
          });
      }
    }

    // Increment total stock count
    worker.total_stock_count += calculatedStockCount;
    await worker.save();

    res.send({
      message: "Check-out successful",
      timeSpent: `${Math.floor(timeSpentInMinutes / 60)}hr ${Math.round(
        timeSpentInMinutes % 60
      )}min`,
      rowNumber: row.row_number,
      remainingStocks: row.remaining_stock_count,
    });
  } catch (error) {
    console.error("Error during worker check-out:", error);
    res.status(500).send({ message: "Server error", error });
  }
};

// Get the worker's current check-in
exports.getCurrentCheckin = async (req, res) => {
  const { workerID } = req.params;

  try {
    // Find all blocks that contain rows
    const blocks = await Block.find();

    let activeCheckins = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        // Check if the row is checked in by the worker and not yet checked out
        if (row.worker_id === workerID && row.start_time && !row.time_spent) {
          activeCheckins.push({
            blockName: block.block_name,
            rowNumber: row.row_number,
            workerID: row.worker_id,
            workerName: row.worker_name,
            stockCount: row.stock_count,
            startTime: row.start_time,
            remainingStocks: row.remaining_stock_count || row.stock_count,
          });
        }
      });
    });

    if (activeCheckins.length === 0) {
      return res
        .status(404)
        .json({ message: "No active check-in found for this worker." });
    }

    return res.json(activeCheckins);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get the worker's current check-in
exports.getCurrentCheckins = async (req, res) => {
  try {
    // Find all blocks that contain rows
    const blocks = await Block.find();

    let activeCheckins = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        // Check if the row is checked in by any worker and not yet checked out
        if (row.worker_id && row.start_time && !row.time_spent) {
          activeCheckins.push({
            blockName: block.block_name,
            rowNumber: row.row_number,
            workerID: row.worker_id,
            workerName: row.worker_name,
            stockCount: row.stock_count,
            startTime: row.start_time,
            remainingStocks: row.remaining_stock_count || row.stock_count,
          });
        }
      });
    });

    if (activeCheckins.length === 0) {
      return res.status(404).json({ message: "No active check-ins found." });
    }

    return res.json(activeCheckins);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// get worker current checkin
exports.getCurrentCheckin = async (req, res) => {
  const { workerID } = req.params;

  try {
    // Find all blocks that contain rows
    const blocks = await Block.find();

    let activeCheckins = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        // Check if the row is checked in by the worker and not yet checked out
        if (row.worker_id === workerID && row.start_time && !row.time_spent) {
          activeCheckins.push({
            blockName: block.block_name,
            rowNumber: row.row_number,
            workerID: row.worker_id,
            workerName: row.worker_name,
            stockCount: row.stock_count,
            startTime: row.start_time,
            remainingStocks: row.remaining_stock_count || row.stock_count,
          });
        }
      });
    });

    if (activeCheckins.length === 0) {
      return res
        .status(404)
        .json({ message: "No active check-in found for this worker." });
    }

    return res.json(activeCheckins);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get row data by row number
exports.getRowByNumber = async (req, res) => {
  try {
    const { rowNumber } = req.params;
    const block = await Block.findOne({ block_name: blockName });

    if (!block) {
      return res.status(404).send({ message: "Block not found" });
    }

    const row = block.rows.find(
      (row) => row.row_number === parseInt(rowNumber)
    );

    if (!row) {
      return res.status(404).send({ message: "Row not found" });
    }

    res.send(row);
  } catch (error) {
    res.status(500).send({ message: "Server error", error });
  }
};

// Get all block data
exports.getAllBlockData = async (req, res) => {
  try {
    const block = await Block.findOne({ block_name: blockName });

    if (!block) {
      return res.status(404).json({ message: "Block data not found" });
    }

    res.json(block);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Get a block by name
exports.getBlockByName = async (req, res) => {
  try {
    const block = await Block.findOne({ block_name: blockName });

    if (!block) {
      return res.status(404).send({ message: "Block not found" });
    }

    res.send(block);
  } catch (error) {
    res.status(500).send({ message: "Server error", error });
  }
};

exports.getRemainingStocks = async (req, res) => {
  try {
    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).send({ message: "Block not found" });
    }

    // Calculate total used stocks
    const totalUsedStocks = block.rows.reduce(
      (acc, row) => acc + row.stock_count,
      0
    );

    // Calculate remaining stocks
    const remainingStocks = block.total_stocks - totalUsedStocks;

    res.send({ remainingStocks });
  } catch (error) {
    res.status(500).send({ message: "Server error", error });
  }
};

exports.getRemainingStocksForRow = async (req, res) => {
  try {
    const { rowNumber } = req.params;

    // Find the block document that contains the specific row
    const block = await Block.findOne({
      "rows.row_number": parseInt(rowNumber),
    });

    if (!block) {
      return res.status(404).send({ message: "Block or Row not found" });
    }

    // Find the specific row within the block document
    const row = block.rows.find(
      (row) => row.row_number === parseInt(rowNumber)
    );

    if (!row) {
      return res.status(404).send({ message: "Row not found" });
    }

    // Calculate the total stocks accounted for by summing up all stock counts in rows
    const totalCountedStocks = block.rows.reduce(
      (total, row) => total + row.stock_count,
      0
    );

    // Calculate the remaining stocks for the specific row
    const remainingStocks =
      block.total_stocks - totalCountedStocks + row.stock_count;

    res.send({ rowNumber: row.row_number, remainingStocks });
  } catch (error) {
    res.status(500).send({ message: "Server error", error });
  }
};

// get workers
exports.getWorkers = async (req, res) => {
  try {
    const workers = await Worker.find({});
    res.send(workers);
  } catch (error) {
    res.status(500).send({ message: "Server error", error });
  }
};
