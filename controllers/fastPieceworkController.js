const Worker = require("../models/Worker");
const Block = require("../models/Block");

// Fast check-in - assigns worker to row and immediately completes it
exports.fastCheckIn = async (req, res) => {
  const { workerID, workerName, rowNumber, blockName, jobType } = req.body;

  try {
    console.log("=== FAST PIECEWORK CHECK-IN ===");
    console.log("Request Body:", req.body);

    if (!workerID || !workerName || !rowNumber || !blockName || !jobType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    const row = block.rows.find((row) => row.row_number === rowNumber);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

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

    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        total_stock_count: 0,
        blocks: [],
      });
    }

    const blockIndex = worker.blocks.findIndex(
      (b) => b.block_name === blockName
    );

    if (blockIndex === -1) {
      worker.blocks.push({
        block_name: blockName,
        rows: [
          {
            row_number: rowNumber,
            job_type: jobType,
            stock_count: stockCount,
            time_spent: timeSpentInMinutes,
            date: currentTime,
            day_of_week: currentTime.toLocaleDateString("en-US", {
              weekday: "long",
            }),
          },
        ],
      });
    } else {
      const rowIndex = worker.blocks[blockIndex].rows.findIndex(
        (r) => r.row_number === rowNumber && r.job_type === jobType
      );
      if (rowIndex === -1) {
        worker.blocks[blockIndex].rows.push({
          row_number: rowNumber,
          job_type: jobType,
          stock_count: stockCount,
          time_spent: timeSpentInMinutes,
          date: currentTime,
          day_of_week: currentTime.toLocaleDateString("en-US", {
            weekday: "long",
          }),
        });
      } else {
        worker.blocks[blockIndex].rows[rowIndex].stock_count += stockCount;
        worker.blocks[blockIndex].rows[rowIndex].time_spent +=
          timeSpentInMinutes;
        worker.blocks[blockIndex].rows[rowIndex].date = currentTime;
        worker.blocks[blockIndex].rows[rowIndex].day_of_week =
          currentTime.toLocaleDateString("en-US", { weekday: "long" });
      }
    }

    worker.total_stock_count += stockCount;
    await worker.save();

    console.log("✅ Fast piecework check-in successful");

    res.json({
      message: "Fast piecework entry successful",
      workerName: workerName,
      rowNumber: rowNumber,
      blockName: blockName,
      jobType: jobType,
      vinesCompleted: stockCount,
    });
  } catch (error) {
    console.error("❌ Error during fast piecework check-in:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get fast piecework totals with block completion tracking
exports.getFastPieceworkTotals = async (req, res) => {
  try {
    const { jobType, date } = req.query;

    const workers = await Worker.find({});
    const blocks = await Block.find({});

    // Create a map of block information from Block collection
    const blockInfo = {};
    blocks.forEach((block) => {
      blockInfo[block.block_name] = {
        totalVines: block.total_stocks, // This is the actual total vines in the block
        totalRows: block.total_rows,
        variety: block.variety,
        size: block.size_ha,
        rowsInBlock: block.rows.map((r) => r.row_number), // All row numbers in this block
      };
    });

    let filteredData = [];
    let globalBlockCompletion = {}; // Track completion across all workers

    workers.forEach((worker) => {
      let workerTotal = 0;
      let workerRows = [];
      let workerBlockSummary = {};

      worker.blocks.forEach((block) => {
        block.rows.forEach((row) => {
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

          // Track per-worker block summary
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

          // Track global block completion
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
        // Calculate worker's contribution to each block
        const workerBlockCompletion = [];
        Object.keys(workerBlockSummary).forEach((blockName) => {
          const summary = workerBlockSummary[blockName];
          const info = blockInfo[blockName];

          if (info) {
            const expectedVines = info.totalVines;
            const workerVines = summary.completedVines;
            const workerPercentage = (workerVines / expectedVines) * 100;

            workerBlockCompletion.push({
              blockName,
              expectedTotalVines: expectedVines,
              workerCompletedVines: workerVines,
              workerPercentage: Math.round(workerPercentage * 100) / 100,
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
          rows: workerRows,
          blockCompletion: workerBlockCompletion,
        });
      }
    });

    // Calculate global block completion status
    const globalBlockStatus = [];
    Object.keys(globalBlockCompletion).forEach((blockName) => {
      const completion = globalBlockCompletion[blockName];
      const info = blockInfo[blockName];

      if (info) {
        const expectedVines = info.totalVines;
        const actualVines = completion.completedVines;
        const difference = actualVines - expectedVines;
        const completionPercentage = (actualVines / expectedVines) * 100;
        const completedRowCount = completion.completedRows.size;

        globalBlockStatus.push({
          blockName,
          expectedVines,
          actualVines,
          difference,
          completionPercentage: Math.round(completionPercentage * 100) / 100,
          status:
            difference === 0 ? "complete" : difference > 0 ? "over" : "short",
          completedRows: completedRowCount,
          totalRows: info.totalRows,
          variety: info.variety,
          completedRowNumbers: Array.from(completion.completedRows).sort(
            (a, b) => {
              // Sort row numbers naturally (1A, 1B, 2A, 2B, etc.)
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
