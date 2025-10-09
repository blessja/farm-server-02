const Worker = require("../models/Worker");
const Block = require("../models/Block");

// Check-in a worker
exports.checkInWorker = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, jobType } = req.body;

  try {
    console.log("Check-in request:", req.body);

    if (!workerID || !workerName || !rowNumber || !blockName || !jobType) {
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

    // Initialize active_jobs array if it doesn't exist
    if (!row.active_jobs) {
      row.active_jobs = [];
    }

    // Check if THIS WORKER is already checked in to THIS ROW with THIS JOB
    const existingJob = row.active_jobs.find(
      (job) => job.worker_id === workerID && job.job_type === jobType
    );

    if (existingJob) {
      return res.status(409).json({
        message: `You are already checked in to Row ${rowNumber} for ${jobType}.`,
      });
    }

    // Check if ANOTHER worker is doing the SAME job type on this row
    const sameJobType = row.active_jobs.find(
      (job) => job.job_type === jobType && job.worker_id !== workerID
    );

    if (sameJobType) {
      return res.status(409).json({
        message: `Row ${rowNumber} is currently being worked on by ${sameJobType.worker_name} for ${jobType}.`,
      });
    }

    // ✅ FIX: Determine the actual remaining stock for this job
    let actualRemainingStock;

    // If remaining_stock_count exists and is not 0, use it (partial work from previous session)
    if (
      row.remaining_stock_count !== undefined &&
      row.remaining_stock_count !== null &&
      row.remaining_stock_count > 0
    ) {
      actualRemainingStock = row.remaining_stock_count;
      console.log(
        `Using remaining_stock_count from previous session: ${actualRemainingStock}`
      );
    } else {
      // Otherwise, this is the first time working on this row, use full stock_count
      actualRemainingStock = row.stock_count;
      console.log(
        `First time on this row, using full stock_count: ${actualRemainingStock}`
      );
    }

    console.log("Check-in details:", {
      rowNumber: row.row_number,
      jobType: jobType,
      originalStockCount: row.stock_count,
      remainingStockCount: row.remaining_stock_count,
      actualRemainingStock: actualRemainingStock,
    });

    // Add new job to active_jobs
    row.active_jobs.push({
      worker_name: workerName,
      worker_id: workerID,
      job_type: jobType,
      start_time: new Date(),
      remaining_stock: actualRemainingStock, // ✅ Use actual remaining
      time_spent: null,
    });

    // ✅ IMPORTANT: Also update legacy fields for backward compatibility
    row.worker_name = workerName;
    row.worker_id = workerID;
    row.start_time = new Date();
    row.job_type = jobType;
    // DON'T reset remaining_stock_count to 0 here!
    // It should keep its value from the previous checkout

    await block.save();

    // Ensure worker record exists
    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        total_stock_count: 0,
        blocks: [],
      });
      await worker.save();
    }

    res.json({
      message: "Check-in successful",
      rowNumber: row.row_number,
      jobType: jobType,
      remainingStock: actualRemainingStock,
    });
  } catch (error) {
    console.error("Error during check-in:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Check-out a worker
exports.checkOutWorker = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, stockCount, jobType } =
    req.body;

  try {
    console.log("=== CHECKOUT REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    if (!workerID || !rowNumber || !blockName) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).send({ message: "Block not found" });
    }

    const row = block.rows.find((row) => row.row_number === rowNumber);
    if (!row) {
      return res.status(404).send({ message: "Row not found" });
    }

    console.log("=== ROW DATA BEFORE CHECKOUT ===");
    console.log("Row number:", row.row_number);
    console.log("stock_count:", row.stock_count);
    console.log("remaining_stock_count:", row.remaining_stock_count);
    console.log("worker_id:", row.worker_id);
    console.log("worker_name:", row.worker_name);
    console.log("job_type:", row.job_type);
    console.log("active_jobs:", JSON.stringify(row.active_jobs, null, 2));

    let job, jobIndex, timeSpentInMinutes, currentRemaining, stockCompleted;
    let usedJobType = jobType || "UNKNOWN";

    // Try NEW FORMAT first (active_jobs)
    if (row.active_jobs && row.active_jobs.length > 0) {
      console.log("=== USING NEW FORMAT (active_jobs) ===");

      if (jobType) {
        jobIndex = row.active_jobs.findIndex(
          (job) => job.worker_id === workerID && job.job_type === jobType
        );
      } else {
        jobIndex = row.active_jobs.findIndex(
          (job) => job.worker_id === workerID
        );
      }

      console.log("Job index found:", jobIndex);

      if (jobIndex !== -1) {
        job = row.active_jobs[jobIndex];
        usedJobType = job.job_type;
        const endTime = new Date();
        timeSpentInMinutes = (endTime - job.start_time) / 1000 / 60;
        currentRemaining = job.remaining_stock;

        console.log("Job found in active_jobs:");
        console.log("  - remaining_stock:", job.remaining_stock);
        console.log("  - currentRemaining:", currentRemaining);
        console.log("  - stockCount from request:", stockCount);

        // Calculate stock completed
        if (typeof stockCount === "undefined" || stockCount === null) {
          stockCompleted = currentRemaining;
          console.log(
            "  - No stockCount provided, using currentRemaining:",
            stockCompleted
          );
        } else {
          stockCompleted = Number(stockCount);
          console.log("  - stockCount provided:", stockCompleted);

          if (isNaN(stockCompleted) || stockCompleted < 0) {
            return res
              .status(400)
              .send({ message: "Invalid stock count value." });
          }
          if (stockCompleted > currentRemaining) {
            console.log("  - ERROR: stockCompleted > currentRemaining");
            return res.status(400).send({
              message: `Invalid stock count: cannot complete ${stockCompleted} trees when only ${currentRemaining} remain.`,
            });
          }
        }

        // Update remaining stock
        job.remaining_stock = currentRemaining - stockCompleted;
        row.remaining_stock_count = job.remaining_stock;

        console.log("  - New remaining_stock:", job.remaining_stock);

        row.active_jobs.splice(jobIndex, 1);
        console.log("  - Removed job from active_jobs");
      }
    }

    // Fallback to OLD FORMAT if not found in active_jobs
    if (!job && row.worker_id === workerID) {
      console.log("=== USING OLD FORMAT ===");

      if (!row.start_time) {
        return res
          .status(400)
          .send({ message: "Worker is not checked in to this row" });
      }

      usedJobType = row.job_type || "UNKNOWN";
      const endTime = new Date();
      timeSpentInMinutes = (endTime - row.start_time) / 1000 / 60;

      currentRemaining =
        row.remaining_stock_count !== undefined &&
        row.remaining_stock_count !== null
          ? row.remaining_stock_count
          : row.stock_count;

      console.log("Old format values:");
      console.log("  - row.remaining_stock_count:", row.remaining_stock_count);
      console.log("  - row.stock_count:", row.stock_count);
      console.log("  - currentRemaining:", currentRemaining);
      console.log("  - stockCount from request:", stockCount);

      // Calculate stock completed
      if (typeof stockCount === "undefined" || stockCount === null) {
        stockCompleted = currentRemaining;
        console.log(
          "  - No stockCount provided, using currentRemaining:",
          stockCompleted
        );
      } else {
        stockCompleted = Number(stockCount);
        console.log("  - stockCount provided:", stockCompleted);

        if (isNaN(stockCompleted) || stockCompleted < 0) {
          return res
            .status(400)
            .send({ message: "Invalid stock count value." });
        }
        if (stockCompleted > currentRemaining) {
          console.log("  - ERROR: stockCompleted > currentRemaining");
          console.log("  - stockCompleted:", stockCompleted);
          console.log("  - currentRemaining:", currentRemaining);
          return res.status(400).send({
            message: `Invalid stock count: cannot complete ${stockCompleted} trees when only ${currentRemaining} remain.`,
          });
        }
      }

      // Update remaining stock count
      row.remaining_stock_count = currentRemaining - stockCompleted;
      console.log("  - New remaining_stock_count:", row.remaining_stock_count);

      row.worker_name = "";
      row.worker_id = "";
      row.start_time = null;
      row.time_spent = null;
    }

    if (!job && row.worker_id !== workerID) {
      return res.status(404).send({
        message: `No active job found for ${workerName} on Row ${rowNumber}.`,
      });
    }

    console.log("=== FINAL VALUES ===");
    console.log("stockCompleted:", stockCompleted);
    console.log("timeSpentInMinutes:", timeSpentInMinutes);

    await block.save();

    // Update worker record
    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        blocks: [],
        total_stock_count: 0,
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
            job_type: usedJobType,
            stock_count: stockCompleted,
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
        (r) => r.row_number === rowNumber && r.job_type === usedJobType
      );
      if (rowIndex === -1) {
        worker.blocks[blockIndex].rows.push({
          row_number: rowNumber,
          job_type: usedJobType,
          stock_count: stockCompleted,
          time_spent: timeSpentInMinutes,
          date: currentDate,
          day_of_week: currentDate.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        });
      } else {
        worker.blocks[blockIndex].rows[rowIndex].stock_count += stockCompleted;
        worker.blocks[blockIndex].rows[rowIndex].time_spent +=
          timeSpentInMinutes;
        worker.blocks[blockIndex].rows[rowIndex].date = currentDate;
        worker.blocks[blockIndex].rows[rowIndex].day_of_week =
          currentDate.toLocaleDateString("en-US", { weekday: "long" });
      }
    }

    worker.total_stock_count += stockCompleted;
    console.log("Worker total_stock_count:", worker.total_stock_count);

    await worker.save();

    res.send({
      message: "Check-out successful",
      stockCompleted: stockCompleted,
      timeSpent: `${Math.floor(timeSpentInMinutes / 60)}hr ${Math.round(
        timeSpentInMinutes % 60
      )}min`,
      rowNumber: row.row_number,
      remainingStocks:
        row.remaining_stock_count !== undefined
          ? row.remaining_stock_count
          : job
          ? job.remaining_stock
          : 0,
      jobType: usedJobType,
    });
  } catch (error) {
    console.error("Error during worker check-out:", error);
    res.status(500).send({ message: "Server error", error: error.message });
  }
};

// Get the worker's current check-in
exports.getCurrentCheckin = async (req, res) => {
  const { workerID } = req.params;

  try {
    const blocks = await Block.find();
    let activeCheckins = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        // NEW FORMAT: Check active_jobs array first
        if (row.active_jobs && row.active_jobs.length > 0) {
          row.active_jobs.forEach((job) => {
            if (job.worker_id === workerID) {
              activeCheckins.push({
                blockName: block.block_name,
                job_type: job.job_type,
                rowNumber: row.row_number,
                workerID: job.worker_id,
                workerName: job.worker_name,
                stockCount: job.remaining_stock,
                startTime: job.start_time,
                remainingStocks: job.remaining_stock,
              });
            }
          });
        }

        // OLD FORMAT: Fallback to legacy fields if active_jobs doesn't exist or is empty
        if (
          (!row.active_jobs || row.active_jobs.length === 0) &&
          row.worker_id === workerID &&
          row.start_time &&
          !row.time_spent
        ) {
          activeCheckins.push({
            blockName: block.block_name,
            job_type: row.job_type,
            rowNumber: row.row_number,
            workerID: row.worker_id,
            workerName: row.worker_name,
            stockCount: row.remaining_stock_count || row.stock_count,
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
            job_type: row.job_type,
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
            job_type: row.job_type,
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

// clear all currently active checkins
exports.clearAllCheckins = async (req, res) => {
  try {
    // Find all blocks
    const blocks = await Block.find();

    // Iterate through each block and its rows
    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        // Clear check-in details if there's an active check-in
        if (row.worker_id && row.start_time) {
          row.worker_id = "";
          row.worker_name = "";
          row.start_time = null;
          row.time_spent = 0;
          row.job_type = "";
          row.remaining_stock_count = null;
        }
      });
    });

    // Save updated blocks
    await Promise.all(blocks.map((block) => block.save()));

    return res.status(200).json({ message: "All active check-ins cleared." });
  } catch (error) {
    console.error("Error clearing check-ins:", error);
    return res.status(500).json({ message: "An error occurred." });
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

// Get remaining stocks for a specific row in a specific block
exports.getRemainingStocksForBlockRow = async (req, res) => {
  try {
    const { blockName, rowNumber } = req.params;

    // Find the block by name
    const block = await Block.findOne({ block_name: blockName });

    if (!block) {
      return res.status(404).send({ message: "Block not found" });
    }

    // Find the specific row within the block
    const row = block.rows.find((r) => r.row_number === rowNumber);

    if (!row) {
      return res.status(404).send({ message: "Row not found in this block" });
    }

    // Get remaining stocks from the row
    // If remaining_stock_count exists, use it; otherwise fall back to stock_count
    const remainingStocks =
      row.remaining_stock_count !== undefined
        ? row.remaining_stock_count
        : row.stock_count;

    res.send({
      blockName,
      rowNumber: row.row_number,
      remainingStocks,
      originalStockCount: row.stock_count,
    });
  } catch (error) {
    console.error("Error fetching remaining stocks for row:", error);
    res.status(500).send({ message: "Server error", error });
  }
};

// Alternative: Get remaining stocks using worker ID and row number
// (if you want to keep the original API structure)
exports.getRemainingStocksForWorkerRow = async (req, res) => {
  try {
    const { workerID, rowNumber } = req.params;

    // Find the block that has this worker checked in to this row
    const block = await Block.findOne({
      "rows.row_number": rowNumber,
      "rows.worker_id": workerID,
    });

    if (!block) {
      return res.status(404).send({
        message: "No active check-in found for this worker and row",
      });
    }

    // Find the specific row
    const row = block.rows.find(
      (r) => r.row_number === rowNumber && r.worker_id === workerID
    );

    if (!row) {
      return res.status(404).send({ message: "Row not found" });
    }

    // Get remaining stocks
    const remainingStocks =
      row.remaining_stock_count !== undefined
        ? row.remaining_stock_count
        : row.stock_count;

    res.send({
      blockName: block.block_name,
      rowNumber: row.row_number,
      remainingStocks,
      originalStockCount: row.stock_count,
      workerID: row.worker_id,
      workerName: row.worker_name,
    });
  } catch (error) {
    console.error("Error fetching remaining stocks:", error);
    res.status(500).send({ message: "Server error", error });
  }
};
