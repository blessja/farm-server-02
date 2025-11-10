// controllers/fastPieceworkController.js
const PieceworkWorker = require("../models/PieceworkWorker");
const Block = require("../models/Block");

// Fast check-in - saves to PieceworkWorker collection
exports.fastCheckIn = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, jobType } = req.body;

  try {
    console.log("=== FAST PIECEWORK CHECK-IN ===");
    console.log("Request Body:", req.body);

    if (!workerID || !workerName || !rowNumber || !blockName || !jobType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate it's a fast piecework job type
    const fastJobTypes = [
      "LEAF PICKING",
      "SUCKER REMOVAL",
      "SHOOT THINNING",
      "OTHER",
    ];
    if (!fastJobTypes.includes(jobType.toUpperCase())) {
      return res.status(400).json({
        message: `Invalid job type for fast piecework. Must be one of: ${fastJobTypes.join(
          ", "
        )}`,
      });
    }

    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    const row = block.rows.find((row) => row.row_number === rowNumber);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    // Check if already completed for this job type
    if (row.active_jobs && row.active_jobs.length > 0) {
      const existingJob = row.active_jobs.find(
        (job) => job.job_type === jobType
      );
      if (existingJob) {
        return res.status(409).json({
          message: `Row ${rowNumber} has already been completed for ${jobType} by ${existingJob.worker_name}.`,
        });
      }
    }

    const stockCount = row.stock_count;
    const currentTime = new Date();
    const timeSpentInMinutes = 1;

    // Mark row as completed in Block collection
    if (!row.active_jobs) {
      row.active_jobs = [];
    }

    row.active_jobs.push({
      worker_name: workerName,
      worker_id: workerID,
      job_type: jobType,
      start_time: currentTime,
      remaining_stock: 0,
      time_spent: timeSpentInMinutes,
    });

    await block.save();

    // ✅ Save to PieceworkWorker collection (NOT Worker collection)
    let pieceworkWorker = await PieceworkWorker.findOne({ workerID });

    if (!pieceworkWorker) {
      pieceworkWorker = new PieceworkWorker({
        workerID,
        name: workerName,
        piecework_stock_count: 0,
        blocks: [],
      });
    }

    const blockIndex = pieceworkWorker.blocks.findIndex(
      (b) => b.block_name === blockName
    );

    if (blockIndex === -1) {
      pieceworkWorker.blocks.push({
        block_name: blockName,
        rows: [
          {
            row_number: rowNumber,
            job_type: jobType,
            stock_count: stockCount,
            date: currentTime,
            day_of_week: currentTime.toLocaleDateString("en-US", {
              weekday: "long",
            }),
          },
        ],
      });
    } else {
      const rowIndex = pieceworkWorker.blocks[blockIndex].rows.findIndex(
        (r) => r.row_number === rowNumber && r.job_type === jobType
      );

      if (rowIndex === -1) {
        pieceworkWorker.blocks[blockIndex].rows.push({
          row_number: rowNumber,
          job_type: jobType,
          stock_count: stockCount,
          date: currentTime,
          day_of_week: currentTime.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        });
      } else {
        // Update existing entry
        pieceworkWorker.blocks[blockIndex].rows[rowIndex].stock_count +=
          stockCount;
        pieceworkWorker.blocks[blockIndex].rows[rowIndex].date = currentTime;
        pieceworkWorker.blocks[blockIndex].rows[rowIndex].day_of_week =
          currentTime.toLocaleDateString("en-US", { weekday: "long" });
      }
    }

    await pieceworkWorker.save();

    console.log("✅ Fast piecework check-in successful");

    res.json({
      message: "Fast piecework entry successful",
      workerName: workerName,
      rowNumber: rowNumber,
      blockName: blockName,
      jobType: jobType,
      vinesCompleted: stockCount,
      savedTo: "PieceworkWorker collection",
    });
  } catch (error) {
    console.error("❌ Error during fast piecework check-in:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get fast piecework totals - reads from PieceworkWorker collection
exports.getFastPieceworkTotals = async (req, res) => {
  try {
    const { jobType, date } = req.query;

    // ✅ Query PieceworkWorker collection instead of Worker
    const pieceworkWorkers = await PieceworkWorker.find({});
    const blocks = await Block.find({});

    const blockInfo = {};
    blocks.forEach((block) => {
      blockInfo[block.block_name] = {
        totalVines: block.total_stocks,
        totalRows: block.total_rows,
        variety: block.variety,
        size: block.size_ha,
        rowsInBlock: block.rows.map((r) => r.row_number),
      };
    });

    let filteredData = [];
    let globalBlockCompletion = {};

    pieceworkWorkers.forEach((worker) => {
      let workerTotal = 0;
      let workerRows = [];
      let workerBlockSummary = {};

      worker.blocks.forEach((block) => {
        block.rows.forEach((row) => {
          // Apply filters
          if (jobType && row.job_type !== jobType) return;
          if (date) {
            const rowDate = new Date(row.date).toISOString().split("T")[0];
            if (rowDate !== date) return;
          }

          workerTotal += row.stock_count;
          workerRows.push({
            blockName: block.block_name,
            rowNumber: row.row_number,
            vines: row.stock_count,
            date: row.date,
            jobType: row.job_type,
          });

          // Track block completion
          if (!workerBlockSummary[block.block_name]) {
            workerBlockSummary[block.block_name] = {
              completedVines: 0,
              completedRows: new Set(),
            };
          }
          workerBlockSummary[block.block_name].completedVines +=
            row.stock_count;
          workerBlockSummary[block.block_name].completedRows.add(
            row.row_number
          );

          // Global block tracking
          if (!globalBlockCompletion[block.block_name]) {
            globalBlockCompletion[block.block_name] = {
              completedVines: 0,
              completedRows: new Set(),
            };
          }
          globalBlockCompletion[block.block_name].completedVines +=
            row.stock_count;
          globalBlockCompletion[block.block_name].completedRows.add(
            row.row_number
          );
        });
      });

      if (workerTotal > 0) {
        const workerBlockCompletion = [];
        Object.keys(workerBlockSummary).forEach((blockName) => {
          const summary = workerBlockSummary[blockName];
          const info = blockInfo[blockName];

          if (info) {
            workerBlockCompletion.push({
              blockName,
              expectedTotalVines: info.totalVines,
              workerCompletedVines: summary.completedVines,
              workerPercentage:
                Math.round((summary.completedVines / info.totalVines) * 10000) /
                100,
              workerCompletedRows: summary.completedRows.size,
              totalRowsInBlock: info.totalRows,
              variety: info.variety,
            });
          }
        });

        filteredData.push({
          workerID: worker.workerID,
          workerName: worker.name,
          totalVines: workerTotal,
          piecework_stock_count: worker.piecework_stock_count,
          rows: workerRows,
          blockCompletion: workerBlockCompletion,
        });
      }
    });

    // Calculate global block status
    const globalBlockStatus = [];
    Object.keys(globalBlockCompletion).forEach((blockName) => {
      const completion = globalBlockCompletion[blockName];
      const info = blockInfo[blockName];

      if (info) {
        const expectedVines = info.totalVines;
        const actualVines = completion.completedVines;
        const difference = actualVines - expectedVines;
        const completionPercentage = (actualVines / expectedVines) * 100;

        globalBlockStatus.push({
          blockName,
          expectedVines,
          actualVines,
          difference,
          completionPercentage: Math.round(completionPercentage * 100) / 100,
          status:
            difference === 0 ? "complete" : difference > 0 ? "over" : "short",
          completedRows: completion.completedRows.size,
          totalRows: info.totalRows,
          variety: info.variety,
          completedRowNumbers: Array.from(completion.completedRows).sort(
            (a, b) => {
              const aNum = parseInt(a);
              const bNum = parseInt(b);
              if (aNum !== bNum) return aNum - bNum;
              return a.localeCompare(b);
            }
          ),
        });
      }
    });

    filteredData.sort((a, b) => b.totalVines - a.totalVines);

    res.json({
      workers: filteredData,
      globalBlockStatus: globalBlockStatus.sort((a, b) =>
        a.blockName.localeCompare(b.blockName, undefined, { numeric: true })
      ),
      summary: {
        totalWorkers: filteredData.length,
        totalVines: filteredData.reduce((sum, w) => sum + w.totalVines, 0),
        source: "PieceworkWorker collection",
      },
    });
  } catch (error) {
    console.error("Error fetching fast piecework totals:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getFastPieceworkJobTypes = async (req, res) => {
  try {
    const fastJobTypes = [
      "LEAF PICKING",
      "SUCKER REMOVAL",
      "SHOOT THINNING",
      "OTHER",
    ];

    res.json(fastJobTypes);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Swap/Change worker for a fast piecework entry
exports.swapFastPieceworkWorker = async (req, res) => {
  const { 
    oldWorkerID, 
    newWorkerID, 
    newWorkerName, 
    blockName, 
    rowNumber, 
    jobType,
    newRowNumber // NEW: for moving to different row
  } = req.body;

  try {
    console.log("=== SWAP/MOVE FAST PIECEWORK WORKER ===");
    console.log("Request Body:", req.body);

    if (!oldWorkerID || !newWorkerID || !newWorkerName || !blockName || !rowNumber || !jobType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Find the block
    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    const oldRow = block.rows.find((row) => row.row_number === rowNumber);
    if (!oldRow) {
      return res.status(404).json({ message: "Original row not found" });
    }

    // Find the active job to swap/move
    if (!oldRow.active_jobs || oldRow.active_jobs.length === 0) {
      return res.status(404).json({ 
        message: "No active job found for this row" 
      });
    }

    const jobIndex = oldRow.active_jobs.findIndex(
      (job) => job.worker_id === oldWorkerID && job.job_type === jobType
    );

    if (jobIndex === -1) {
      return res.status(404).json({ 
        message: "No matching job found for the specified worker" 
      });
    }

    // If newRowNumber is provided, we're moving to a different row
    const targetRowNumber = newRowNumber || rowNumber;
    const targetRow = block.rows.find((row) => row.row_number === targetRowNumber);
    
    if (!targetRow) {
      return res.status(404).json({ message: "Target row not found" });
    }

    // Check if new worker is already on target row with same job type
    const newWorkerExists = targetRow.active_jobs && targetRow.active_jobs.find(
      (job) => job.worker_id === newWorkerID && job.job_type === jobType
    );

    if (newWorkerExists && targetRowNumber !== rowNumber) {
      return res.status(409).json({
        message: `${newWorkerName} is already working on row ${targetRowNumber} with job type ${jobType}`
      });
    }

    // Remove entry from old worker in PieceworkWorker collection
    const oldPieceworkWorker = await PieceworkWorker.findOne({ 
      workerID: oldWorkerID 
    });

    let oldStockCount = 0;

    if (oldPieceworkWorker) {
      const blockIndex = oldPieceworkWorker.blocks.findIndex(
        (b) => b.block_name === blockName
      );

      if (blockIndex !== -1) {
        const rowIndex = oldPieceworkWorker.blocks[blockIndex].rows.findIndex(
          (r) => r.row_number === rowNumber && r.job_type === jobType
        );

        if (rowIndex !== -1) {
          // Save the stock count before removing
          oldStockCount = oldPieceworkWorker.blocks[blockIndex].rows[rowIndex].stock_count;
          
          // Remove this specific row entry
          oldPieceworkWorker.blocks[blockIndex].rows.splice(rowIndex, 1);
          
          // If block has no more rows, remove the block
          if (oldPieceworkWorker.blocks[blockIndex].rows.length === 0) {
            oldPieceworkWorker.blocks.splice(blockIndex, 1);
          }
          
          await oldPieceworkWorker.save();
        }
      }
    }

    // Remove from old row in Block collection
    oldRow.active_jobs.splice(jobIndex, 1);

    // Get stock count for target row
    const stockCount = targetRow.stock_count;
    const currentTime = new Date();
    
    // Add to new/target row in Block collection
    if (!targetRow.active_jobs) {
      targetRow.active_jobs = [];
    }

    // If moving to different row, check again for conflicts
    if (targetRowNumber !== rowNumber) {
      const existingJobOnNewRow = targetRow.active_jobs.find(
        (job) => job.worker_id === newWorkerID && job.job_type === jobType
      );
      
      if (existingJobOnNewRow) {
        return res.status(409).json({
          message: `Worker already has an entry on row ${targetRowNumber}`
        });
      }
    }

    targetRow.active_jobs.push({
      worker_name: newWorkerName,
      worker_id: newWorkerID,
      job_type: jobType,
      start_time: currentTime,
      remaining_stock: 0,
      time_spent: 1,
    });

    await block.save();

    // Add entry to new worker in PieceworkWorker collection
    let newPieceworkWorker = await PieceworkWorker.findOne({ 
      workerID: newWorkerID 
    });

    if (!newPieceworkWorker) {
      newPieceworkWorker = new PieceworkWorker({
        workerID: newWorkerID,
        name: newWorkerName,
        piecework_stock_count: 0,
        blocks: [],
      });
    }

    const newBlockIndex = newPieceworkWorker.blocks.findIndex(
      (b) => b.block_name === blockName
    );

    if (newBlockIndex === -1) {
      newPieceworkWorker.blocks.push({
        block_name: blockName,
        rows: [
          {
            row_number: targetRowNumber,
            job_type: jobType,
            stock_count: stockCount,
            date: currentTime,
            day_of_week: currentTime.toLocaleDateString("en-US", {
              weekday: "long",
            }),
          },
        ],
      });
    } else {
      const newRowIndex = newPieceworkWorker.blocks[newBlockIndex].rows.findIndex(
        (r) => r.row_number === targetRowNumber && r.job_type === jobType
      );

      if (newRowIndex === -1) {
        newPieceworkWorker.blocks[newBlockIndex].rows.push({
          row_number: targetRowNumber,
          job_type: jobType,
          stock_count: stockCount,
          date: currentTime,
          day_of_week: currentTime.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        });
      } else {
        // Update existing entry
        newPieceworkWorker.blocks[newBlockIndex].rows[newRowIndex].stock_count += stockCount;
        newPieceworkWorker.blocks[newBlockIndex].rows[newRowIndex].date = currentTime;
        newPieceworkWorker.blocks[newBlockIndex].rows[newRowIndex].day_of_week =
          currentTime.toLocaleDateString("en-US", { weekday: "long" });
      }
    }

    await newPieceworkWorker.save();

    const actionType = newRowNumber ? "moved" : "swapped";
    console.log(`✅ Worker ${actionType} successfully`);

    res.json({
      message: `Worker ${actionType} successfully`,
      oldWorker: oldWorkerID,
      newWorker: newWorkerName,
      blockName: blockName,
      oldRowNumber: rowNumber,
      newRowNumber: targetRowNumber,
      jobType: jobType,
      actionType: actionType
    });
  } catch (error) {
    console.error("❌ Error during worker swap/move:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};