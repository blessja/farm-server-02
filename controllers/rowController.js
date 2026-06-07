const Worker = require("../models/Worker");
const Block = require("../models/Block");

function ensureActiveJobs(row) {
  if (!row.active_jobs) {
    row.active_jobs = [];
  }

  return row.active_jobs;
}

function findWorkerJobIndex(row, workerID, jobType) {
  const activeJobs = ensureActiveJobs(row);

  if (jobType) {
    return activeJobs.findIndex(
      (job) => job.worker_id === workerID && job.job_type === jobType
    );
  }

  return activeJobs.findIndex((job) => job.worker_id === workerID);
}

// Debug version of checkInWorker with detailed logging
exports.checkInWorker = async (req, res) => {
  console.log("=== CHECK-IN REQUEST RECEIVED ===");
  const {
    workerID,
    workerName,
    rowNumber,
    blockName,
    jobType,
    allowMultipleWorkers,
  } = req.body;

  try {
    console.log("=== CHECK-IN REQUEST ===");
    console.log("Request Body:", req.body);
    console.log(
      "allowMultipleWorkers:",
      allowMultipleWorkers,
      typeof allowMultipleWorkers
    );

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

    console.log("=== ROW DATA BEFORE CHECK-IN ===");
    console.log("Row number:", row.row_number);
    console.log("stock_count:", row.stock_count);
    console.log("remaining_stock_count:", row.remaining_stock_count);
    console.log("worker_id:", row.worker_id);
    console.log(
      "active_jobs length:",
      row.active_jobs ? row.active_jobs.length : 0
    );

    // Initialize active_jobs array if it doesn't exist
    if (!row.active_jobs) {
      row.active_jobs = [];
    }

    // Check if THIS WORKER is already checked in to THIS ROW with THIS JOB
    const existingJob = row.active_jobs.find(
      (job) => job.worker_id === workerID && job.job_type === jobType
    );

    if (existingJob) {
      console.log("BLOCKED: Same worker already checked in");
      return res.status(409).json({
        message: `You are already checked in to Row ${rowNumber} for ${jobType}.`,
      });
    }

    // Check if ANOTHER worker is doing the SAME job type on this row
    const sameJobType = row.active_jobs.find(
      (job) => job.job_type === jobType && job.worker_id !== workerID
    );

    console.log("=== CONFLICT CHECK ===");
    console.log("sameJobType found:", sameJobType ? "YES" : "NO");
    if (sameJobType) {
      console.log("Conflicting worker:", sameJobType.worker_name);
      console.log("allowMultipleWorkers:", allowMultipleWorkers);
    }

    // Only block if override is NOT enabled
    if (sameJobType && !allowMultipleWorkers) {
      console.log("CONFLICT DETECTED - Sending override response");
      return res.status(409).json({
        message: `Row ${rowNumber} is currently being worked on by ${sameJobType.worker_name} for ${jobType}.`,
        conflict: true,
        existingWorker: sameJobType.worker_name,
        canOverride: true,
      });
    }

    if (sameJobType && allowMultipleWorkers) {
      console.log("OVERRIDE ALLOWED - Multiple workers permitted");
    }

    // Determine actual remaining stock
    let actualRemainingStock;

    if (
      row.remaining_stock_count !== undefined &&
      row.remaining_stock_count !== null &&
      row.remaining_stock_count > 0
    ) {
      actualRemainingStock = row.remaining_stock_count;
      console.log(
        "Using remaining_stock_count from previous session:",
        actualRemainingStock
      );
    } else if (row.remaining_stock_count === 0) {
      actualRemainingStock = row.stock_count;
      console.log(
        "Row was completed, starting fresh with stock_count:",
        actualRemainingStock
      );
    } else {
      actualRemainingStock = row.stock_count;
      console.log(
        "First time on row, using stock_count:",
        actualRemainingStock
      );
    }

    // Add new job to active_jobs
    row.active_jobs.push({
      worker_name: workerName,
      worker_id: workerID,
      job_type: jobType,
      start_time: new Date(),
      remaining_stock: actualRemainingStock,
      time_spent: null,
    });

    // Update legacy fields
    row.worker_name = workerName;
    row.worker_id = workerID;
    row.start_time = new Date();
    row.job_type = jobType;

    console.log("=== ROW DATA AFTER CHECK-IN (before save) ===");
    console.log("active_jobs:", JSON.stringify(row.active_jobs, null, 2));
    console.log("remaining_stock_count:", row.remaining_stock_count);

    await block.save();

    console.log("✅ Check-in successful");

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
      message: allowMultipleWorkers
        ? "Check-in successful (multiple workers on same row)"
        : "Check-in successful",
      rowNumber: row.row_number,
      jobType: jobType,
      remainingStock: actualRemainingStock,
      multipleWorkersAllowed: allowMultipleWorkers || false,
    });
  } catch (error) {
    console.error("❌ Error during check-in:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.moveWorkerToRow = async (req, res) => {
  const {
    workerID,
    workerName,
    blockName,
    fromRowNumber,
    toRowNumber,
    jobType,
    allowMultipleWorkers,
  } = req.body;

  try {
    if (!workerID || !blockName || !toRowNumber) {
      return res.status(400).json({
        message:
          "workerID, blockName and toRowNumber are required to move a worker.",
      });
    }

    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    let sourceRow = null;
    let sourceJob = null;
    let sourceJobIndex = -1;

    if (fromRowNumber) {
      sourceRow = block.rows.find((row) => row.row_number === fromRowNumber);
      if (!sourceRow) {
        return res.status(404).json({ message: "Source row not found" });
      }

      sourceJobIndex = findWorkerJobIndex(sourceRow, workerID, jobType);
      if (sourceJobIndex !== -1) {
        sourceJob = ensureActiveJobs(sourceRow)[sourceJobIndex];
      }
    } else {
      for (const row of block.rows) {
        const jobIndex = findWorkerJobIndex(row, workerID, jobType);
        if (jobIndex !== -1) {
          sourceRow = row;
          sourceJobIndex = jobIndex;
          sourceJob = ensureActiveJobs(row)[jobIndex];
          break;
        }
      }
    }

    if (!sourceRow || !sourceJob || sourceJobIndex === -1) {
      return res.status(404).json({
        message: "No active job found for this worker on the source row.",
      });
    }

    const targetRow = block.rows.find((row) => row.row_number === toRowNumber);
    if (!targetRow) {
      return res.status(404).json({ message: "Target row not found" });
    }

    if (sourceRow.row_number === targetRow.row_number) {
      return res.status(400).json({
        message: "Source row and target row cannot be the same.",
      });
    }

    const targetJobs = ensureActiveJobs(targetRow);

    const sameWorkerOnTarget = targetJobs.find(
      (job) => job.worker_id === workerID
    );

    if (sameWorkerOnTarget) {
      return res.status(409).json({
        message: `Worker ${workerName || sourceJob.worker_name} already has an active assignment on Row ${toRowNumber}.`,
        conflict: true,
        existingWorker: sameWorkerOnTarget.worker_name,
        existingJobType: sameWorkerOnTarget.job_type,
      });
    }

    const sameJobTypeOnTarget = targetJobs.find(
      (job) =>
        job.job_type === sourceJob.job_type && job.worker_id !== sourceJob.worker_id
    );

    if (sameJobTypeOnTarget && !allowMultipleWorkers) {
      return res.status(409).json({
        message: `Row ${toRowNumber} is currently being worked on by ${sameJobTypeOnTarget.worker_name} for ${sourceJob.job_type}.`,
        conflict: true,
        existingWorker: sameJobTypeOnTarget.worker_name,
        existingJobType: sameJobTypeOnTarget.job_type,
        canOverride: true,
      });
    }

    ensureActiveJobs(sourceRow).splice(sourceJobIndex, 1);

    targetJobs.push({
      worker_name: sourceJob.worker_name,
      worker_id: sourceJob.worker_id,
      job_type: sourceJob.job_type,
      start_time: sourceJob.start_time,
      remaining_stock: sourceJob.remaining_stock,
      time_spent: sourceJob.time_spent,
    });

    if (sourceRow.worker_id === workerID) {
      sourceRow.worker_name = "";
      sourceRow.worker_id = "";
      sourceRow.start_time = null;
      sourceRow.time_spent = null;
      sourceRow.job_type = "";
    }

    targetRow.worker_name = sourceJob.worker_name;
    targetRow.worker_id = sourceJob.worker_id;
    targetRow.start_time = sourceJob.start_time;
    targetRow.time_spent = null;
    targetRow.job_type = sourceJob.job_type;

    await block.save();

    return res.json({
      message: allowMultipleWorkers
        ? `Worker moved to Row ${toRowNumber} with override allowed.`
        : `Worker moved to Row ${toRowNumber} successfully.`,
      workerID,
      workerName: sourceJob.worker_name,
      blockName,
      fromRowNumber: sourceRow.row_number,
      toRowNumber: targetRow.row_number,
      jobType: sourceJob.job_type,
      multipleWorkersAllowed: allowMultipleWorkers || false,
    });
  } catch (error) {
    console.error("Error moving worker to another row:", error);
    return res.status(500).json({
      message: "Server error while moving worker to another row.",
      error: error.message,
    });
  }
};

exports.swapWorkersBetweenRows = async (req, res) => {
  const {
    firstWorkerID,
    secondWorkerID,
    blockName,
    firstJobType,
    secondJobType,
  } = req.body;

  try {
    if (!firstWorkerID || !secondWorkerID || !blockName) {
      return res.status(400).json({
        message:
          "firstWorkerID, secondWorkerID and blockName are required to swap workers.",
      });
    }

    if (firstWorkerID === secondWorkerID) {
      return res.status(400).json({
        message: "Cannot swap a worker with themselves.",
      });
    }

    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    let firstRow = null;
    let firstJob = null;
    let firstJobIndex = -1;
    let secondRow = null;
    let secondJob = null;
    let secondJobIndex = -1;

    for (const row of block.rows) {
      if (!firstJob) {
        const index = findWorkerJobIndex(row, firstWorkerID, firstJobType);
        if (index !== -1) {
          firstRow = row;
          firstJobIndex = index;
          firstJob = ensureActiveJobs(row)[index];
        }
      }

      if (!secondJob) {
        const index = findWorkerJobIndex(row, secondWorkerID, secondJobType);
        if (index !== -1) {
          secondRow = row;
          secondJobIndex = index;
          secondJob = ensureActiveJobs(row)[index];
        }
      }
    }

    if (!firstRow || !firstJob || firstJobIndex === -1) {
      return res.status(404).json({
        message: "First worker does not have an active assignment in this block.",
      });
    }

    if (!secondRow || !secondJob || secondJobIndex === -1) {
      return res.status(404).json({
        message: "Second worker does not have an active assignment in this block.",
      });
    }

    if (firstRow.row_number === secondRow.row_number) {
      return res.status(400).json({
        message: "Both workers are already on the same row.",
      });
    }

    const firstTargetJobs = ensureActiveJobs(secondRow).filter(
      (_, index) => index !== secondJobIndex
    );
    const secondTargetJobs = ensureActiveJobs(firstRow).filter(
      (_, index) => index !== firstJobIndex
    );

    const firstTargetConflict = firstTargetJobs.find(
      (job) => job.worker_id === firstWorkerID
    );
    if (firstTargetConflict) {
      return res.status(409).json({
        message: `${firstJob.worker_name} already has an assignment on Row ${secondRow.row_number}.`,
      });
    }

    const secondTargetConflict = secondTargetJobs.find(
      (job) => job.worker_id === secondWorkerID
    );
    if (secondTargetConflict) {
      return res.status(409).json({
        message: `${secondJob.worker_name} already has an assignment on Row ${firstRow.row_number}.`,
      });
    }

    ensureActiveJobs(firstRow)[firstJobIndex] = {
      worker_name: secondJob.worker_name,
      worker_id: secondJob.worker_id,
      job_type: secondJob.job_type,
      start_time: secondJob.start_time,
      remaining_stock: secondJob.remaining_stock,
      time_spent: secondJob.time_spent,
    };

    ensureActiveJobs(secondRow)[secondJobIndex] = {
      worker_name: firstJob.worker_name,
      worker_id: firstJob.worker_id,
      job_type: firstJob.job_type,
      start_time: firstJob.start_time,
      remaining_stock: firstJob.remaining_stock,
      time_spent: firstJob.time_spent,
    };

    if (firstRow.worker_id === firstWorkerID) {
      firstRow.worker_name = secondJob.worker_name;
      firstRow.worker_id = secondJob.worker_id;
      firstRow.start_time = secondJob.start_time;
      firstRow.time_spent = null;
      firstRow.job_type = secondJob.job_type;
    }

    if (secondRow.worker_id === secondWorkerID) {
      secondRow.worker_name = firstJob.worker_name;
      secondRow.worker_id = firstJob.worker_id;
      secondRow.start_time = firstJob.start_time;
      secondRow.time_spent = null;
      secondRow.job_type = firstJob.job_type;
    }

    await block.save();

    return res.json({
      message: "Workers swapped successfully.",
      blockName,
      firstWorker: {
        workerID: firstJob.worker_id,
        workerName: firstJob.worker_name,
        fromRowNumber: firstRow.row_number,
        toRowNumber: secondRow.row_number,
        jobType: firstJob.job_type,
      },
      secondWorker: {
        workerID: secondJob.worker_id,
        workerName: secondJob.worker_name,
        fromRowNumber: secondRow.row_number,
        toRowNumber: firstRow.row_number,
        jobType: secondJob.job_type,
      },
    });
  } catch (error) {
    console.error("Error swapping workers between rows:", error);
    return res.status(500).json({
      message: "Server error while swapping workers.",
      error: error.message,
    });
  }
};

// Check-out a worker
exports.checkOutWorker = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, stockCount, jobType } =
    req.body;

  try {
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

    let job, jobIndex, timeSpentInMinutes, currentRemaining;
    let usedJobType = jobType || "UNKNOWN"; // Fallback if jobType not provided

    // Try NEW FORMAT first (active_jobs)
    if (row.active_jobs && row.active_jobs.length > 0) {
      // If jobType provided, find specific job
      if (jobType) {
        jobIndex = row.active_jobs.findIndex(
          (job) => job.worker_id === workerID && job.job_type === jobType
        );
      } else {
        // If no jobType, find any job for this worker
        jobIndex = row.active_jobs.findIndex(
          (job) => job.worker_id === workerID
        );
      }

      if (jobIndex !== -1) {
        job = row.active_jobs[jobIndex];
        usedJobType = job.job_type; // Use the actual job type from the record
        const endTime = new Date();
        timeSpentInMinutes = (endTime - job.start_time) / 1000 / 60;
        currentRemaining = job.remaining_stock;
      }
    }

    // Fallback to OLD FORMAT if not found in active_jobs
    if (!job && row.worker_id === workerID) {
      if (!row.start_time) {
        return res
          .status(400)
          .send({ message: "Worker is not checked in to this row" });
      }
      usedJobType = row.job_type || "UNKNOWN";
      const endTime = new Date();
      timeSpentInMinutes = (endTime - row.start_time) / 1000 / 60;
      currentRemaining = row.remaining_stock_count || row.stock_count;
    }

    if (!job && row.worker_id !== workerID) {
      return res.status(404).send({
        message: `No active job found for ${workerName} on Row ${rowNumber}.`,
      });
    }

    // Validate stock count
    let stockCompleted;
    if (typeof stockCount === "undefined" || stockCount === null) {
      stockCompleted = currentRemaining;
    } else {
      stockCompleted = Number(stockCount);
      if (isNaN(stockCompleted) || stockCompleted < 0) {
        return res.status(400).send({ message: "Invalid stock count value." });
      }
      if (stockCompleted > currentRemaining) {
        return res.status(400).send({
          message: `Invalid stock count: cannot complete ${stockCompleted} trees when only ${currentRemaining} remain.`,
        });
      }
    }

    // Update based on format
    if (job) {
      // NEW FORMAT
      job.remaining_stock = currentRemaining - stockCompleted;
      row.active_jobs.splice(jobIndex, 1);
    } else {
      // OLD FORMAT
      row.remaining_stock_count = currentRemaining - stockCompleted;
      row.worker_name = "";
      row.worker_id = "";
      row.start_time = null;
      row.time_spent = null;
    }

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
            job_type: usedJobType, // IMPORTANT: Always include job_type
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
          job_type: usedJobType, // IMPORTANT: Always include job_type
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
    await worker.save();

    res.send({
      message: "Check-out successful",
      stockCompleted: stockCompleted,
      timeSpent: `${Math.floor(timeSpentInMinutes / 60)}hr ${Math.round(
        timeSpentInMinutes % 60
      )}min`,
      rowNumber: row.row_number,
      remainingStocks: job ? job.remaining_stock : row.remaining_stock_count,
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
    const blocks = await Block.find();
    let activeCheckins = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        if (row.active_jobs && row.active_jobs.length > 0) {
          row.active_jobs.forEach((job) => {
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
          });
        }

        if (
          (!row.active_jobs || row.active_jobs.length === 0) &&
          row.worker_id &&
          row.start_time &&
          !row.time_spent
        ) {
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
    const result = await Block.updateMany(
      {
        rows: { $exists: true, $type: "array" },
      },
      {
        $set: {
          "rows.$[].worker_id": "",
          "rows.$[].worker_name": "",
          "rows.$[].start_time": null,
          "rows.$[].time_spent": 0,
          "rows.$[].job_type": "",
          "rows.$[].remaining_stock_count": null,
          "rows.$[].active_jobs": [],
        },
      }
    );

    return res.status(200).json({
      message: "All active check-ins cleared.",
      matchedBlocks: result.matchedCount,
      updatedBlocks: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error clearing check-ins:", error);
    return res.status(500).json({
      message: "An error occurred while clearing check-ins.",
      error: error.message,
    });
  }
};

// Get row data by row number
exports.getRowByNumber = async (req, res) => {
  try {
    const { blockName, rowNumber } = req.params;
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
    const { blockName } = req.params;
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
    const { blockName } = req.params;
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
    const { blockName } = req.params;
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

// check for any rows which have an remaining stock count of more than 0 but no active jobs and reset them
exports.resetStuckRows = async (req, res) => {
  try {
    const blocks = await Block.find();
    let resetCount = 0;

    for (const block of blocks) {
      let blockModified = false;

      for (const row of block.rows) {
        // If remaining_stock_count > 0 but no active jobs, reset it
        if (
          row.remaining_stock_count > 0 &&
          (!row.active_jobs || row.active_jobs.length === 0) &&
          !row.worker_id
        ) {
          console.log(
            `Resetting stuck row: Block ${block.block_name}, Row ${row.row_number}`
          );
          row.remaining_stock_count = null; // or set to row.stock_count if you want to reset to full
          row.worker_id = "";
          row.worker_name = "";
          row.start_time = null;
          row.time_spent = null;
          row.job_type = "";
          blockModified = true;
          resetCount++;
        }
      }

      if (blockModified) {
        await block.save();
      }
    }

    res.send({
      message: `Reset ${resetCount} stuck rows.`,
    });
  } catch (error) {
    console.error("Error resetting stuck rows:", error);
    res.status(500).send({ message: "Server error", error });
  }
};

// get all rows which have remaining stock count
exports.getRowsWithRemainingStocks = async (req, res) => {
  try {
    const blocks = await Block.find();
    let rowsWithRemainingStocks = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        if (row.remaining_stock_count > 0) {
          rowsWithRemainingStocks.push({
            blockName: block.block_name,
            rowNumber: row.row_number,
            remainingStocks: row.remaining_stock_count,
            originalStockCount: row.stock_count,
            workerID: row.worker_id,
            workerName: row.worker_name,
            jobType: row.job_type,
            startTime: row.start_time,
          });
        }
      });
    });

    if (rowsWithRemainingStocks.length === 0) {
      return res
        .status(404)
        .json({ message: "No rows with remaining stocks found." });
    }

    return res.json(rowsWithRemainingStocks);
  } catch (error) {
    console.error("Error fetching rows with remaining stocks:", error);
    res.status(500).send({ message: "Server error", error });
  }
};

//  Delete single or multiple rows-with-remaining-stocks
exports.deleteRowsWithRemainingStocks = async (req, res) => {
  try {
    const { blockName, rowNumber, rows } = req.body;

    // ✅ Bulk delete case
    if (Array.isArray(rows) && rows.length > 0) {
      let deletedCount = 0;

      for (const r of rows) {
        const result = await Block.updateOne(
          { block_name: r.blockName }, // ✅ Fixed field name
          {
            $pull: {
              rows: {
                row_number: r.rowNumber, // ✅ Fixed field name
                remaining_stock_count: { $gt: 0 }, // ✅ Fixed field name
              },
            },
          }
        );
        deletedCount += result.modifiedCount;
      }

      return res.json({
        message: `${deletedCount} rows with remaining stocks deleted successfully.`,
        deletedCount,
      });
    }

    // ✅ Single delete case
    const result = await Block.updateOne(
      { block_name: blockName }, // ✅ Fixed field name
      {
        $pull: {
          rows: {
            row_number: rowNumber, // ✅ Fixed field name
            remaining_stock_count: { $gt: 0 }, // ✅ Fixed field name
          },
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "No row with remaining stocks found." });
    }

    return res.json({ message: "Row deleted successfully." });
  } catch (error) {
    console.error("Delete rows error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reset completed fast piecework jobs from active_jobs
exports.resetCompletedFastPiecework = async (req, res) => {
  try {
    const blocks = await Block.find();
    let resetCount = 0;
    let resetDetails = [];

    for (const block of blocks) {
      let blockModified = false;

      for (const row of block.rows) {
        if (row.active_jobs && row.active_jobs.length > 0) {
          const initialJobCount = row.active_jobs.length;
          
          // Filter out completed jobs (remaining_stock === 0)
          const completedJobs = row.active_jobs.filter(
            (job) => job.remaining_stock === 0
          );
          
          if (completedJobs.length > 0) {
            // Remove completed jobs
            row.active_jobs = row.active_jobs.filter(
              (job) => job.remaining_stock > 0
            );
            
            blockModified = true;
            resetCount += completedJobs.length;
            
            completedJobs.forEach((job) => {
              resetDetails.push({
                blockName: block.block_name,
                rowNumber: row.row_number,
                workerName: job.worker_name,
                workerID: job.worker_id,
                jobType: job.job_type,
                startTime: job.start_time,
              });
            });
            
            console.log(
              `Reset ${completedJobs.length} completed job(s) from Block ${block.block_name}, Row ${row.row_number}`
            );
          }
        }
      }

      if (blockModified) {
        await block.save();
      }
    }

    res.json({
      message: `Reset ${resetCount} completed fast piecework job(s).`,
      resetCount,
      details: resetDetails,
    });
  } catch (error) {
    console.error("Error resetting completed fast piecework:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reset specific row's active_jobs (manual reset)
exports.resetRowActiveJobs = async (req, res) => {
  try {
    const { blockName, rowNumber } = req.body;

    if (!blockName || !rowNumber) {
      return res.status(400).json({ 
        message: "Missing required fields: blockName and rowNumber" 
      });
    }

    const block = await Block.findOne({ block_name: blockName });
    
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    const row = block.rows.find((r) => r.row_number === rowNumber);
    
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    const removedJobs = row.active_jobs || [];
    row.active_jobs = [];
    
    await block.save();

    res.json({
      message: `Successfully reset active jobs for Block ${blockName}, Row ${rowNumber}`,
      removedJobs: removedJobs.map((job) => ({
        workerName: job.worker_name,
        workerID: job.worker_id,
        jobType: job.job_type,
        remainingStock: job.remaining_stock,
      })),
    });
  } catch (error) {
    console.error("Error resetting row active jobs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reset all active_jobs across all blocks (nuclear option)
exports.resetAllActiveJobs = async (req, res) => {
  try {
    const blocks = await Block.find();
    let resetCount = 0;
    let resetDetails = [];

    for (const block of blocks) {
      for (const row of block.rows) {
        if (row.active_jobs && row.active_jobs.length > 0) {
          row.active_jobs.forEach((job) => {
            resetDetails.push({
              blockName: block.block_name,
              rowNumber: row.row_number,
              workerName: job.worker_name,
              workerID: job.worker_id,
              jobType: job.job_type,
              remainingStock: job.remaining_stock,
            });
          });
          
          resetCount += row.active_jobs.length;
          row.active_jobs = [];
        }
      }
      await block.save();
    }

    res.json({
      message: `Reset all active jobs. Total jobs cleared: ${resetCount}`,
      resetCount,
      details: resetDetails,
    });
  } catch (error) {
    console.error("Error resetting all active jobs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
