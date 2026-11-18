const Worker = require("../models/Worker");
const Block = require("../models/Block");
const { randomUUID } = require("crypto");
const { resolveScope, rejectBlockedScope, sameName, visibleWorkerIDs } = require("../utils/supervisorScope");

// Name of the supervisor responsible for a record. Empty when auth is off or
// no identity is attached, which is stored rather than skipped so the scoping
// rules can tell "no supervisor recorded this" from "recorded by a supervisor".
function recorderName(req) {
  return resolveScope(req).supervisorName || "";
}

// Workers the request's supervisor is allowed to see. Admins get null, meaning
// "no restriction".
async function scopedWorkerIDs(req) {
  const scope = resolveScope(req);
  if (scope.scope === "all") return null;
  return visibleWorkerIDs(scope.supervisorName);
}

function isVisibleWorker(visibleIDs, workerID) {
  if (visibleIDs === null) return true;
  return visibleIDs.has(String(workerID || "").trim());
}

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

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseWorkDate(value) {
  if (!value) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Did this worker fully complete (remaining 0) this row+job on the given work
// date? A full completion is what makes a row's remaining_stock_count drop to
// 0; resetting such a row to full for the same worker and re-crediting it is
// the double-count bug, so this is the signal the check-in guard keys on.
function completedRowFor(worker, blockName, rowNumber, jobType, dateKey) {
  if (!worker || !Array.isArray(worker.blocks)) return false;
  const block = worker.blocks.find((b) => b.block_name === blockName);
  if (!block || !Array.isArray(block.rows)) return false;
  return block.rows.some(
    (row) =>
      row.row_number === rowNumber &&
      row.job_type === jobType &&
      row.date &&
      localDateKey(row.date) === dateKey &&
      (Array.isArray(row.checkout_events) ? row.checkout_events : []).some((ev) => {
        const completed = Number(ev.vines_completed) || 0;
        return completed > 0 && Number(ev.vines_remaining) === 0;
      })
  );
}

// Total vines already credited to a worker for one row+job on a specific work
// date. Used by two safeguards: keeping a completed row from being reset to
// full for the same worker the same day, and capping a check-out credit so a
// replayed/stale auto-check-out can never push a worker past one row's worth
// of vines for that date.
function creditedStockFor(worker, blockName, rowNumber, jobType, dateKey) {
  if (!worker || !Array.isArray(worker.blocks)) return 0;
  const block = worker.blocks.find((b) => b.block_name === blockName);
  if (!block || !Array.isArray(block.rows)) return 0;
  return block.rows.reduce((total, row) => {
    if (
      row.row_number === rowNumber &&
      row.job_type === jobType &&
      row.date &&
      localDateKey(row.date) === dateKey
    ) {
      return total + (Number(row.stock_count) || 0);
    }
    return total;
  }, 0);
}

function isUitknipJob(jobType) {
  return String(jobType || "").trim().toUpperCase() === "UITKNIP";
}

function roundBunches(value) {
  const n = Number(value) || 0;
  return Math.round(n);
}

function calculateUitknipBunches(row, vinesWorked, completingRow) {
  const totalVines = Number(row?.stock_count) || 0;
  const totalBunches = Number(row?.bunches) || 0;
  if (completingRow) return totalBunches;
  const worked = Number(vinesWorked) || 0;
  if (totalVines <= 0 || worked <= 0) return 0;
  // Step 1: average bunches per vine, rounded half-up/nearest whole number.
  // Step 2: multiply by vines worked (no extra rounding).
  const avgPerVineRounded = Math.round(totalBunches / totalVines);
  return avgPerVineRounded * worked;
}

function getRowRemainingBunches(row, jobType) {
  if (!isUitknipJob(jobType)) return 0;
  const stored = Number(row?.remaining_bunch_count);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return Number(row?.bunches) || 0;
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

    if (!workerID || !workerName || !rowNumber || !blockName || !jobType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const normalizedJobType = jobType.trim().toUpperCase();

    // Find block and row
    let block = await Block.findOne({ block_name: blockName });
    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    let row = block.rows.find((row) => row.row_number === rowNumber);
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
      (job) => job.worker_id === workerID && job.job_type.toUpperCase() === normalizedJobType
    );

    if (existingJob) {
      console.log("BLOCKED: Same worker already checked in");
      return res.status(409).json({
        message: `You are already checked in to Row ${rowNumber} for ${normalizedJobType}.`,
      });
    }

    // Check if ANOTHER worker is doing the SAME job type on this row
    const sameJobType = row.active_jobs.find(
      (job) => job.job_type.toUpperCase() === normalizedJobType && job.worker_id !== workerID
    );

    console.log("=== CONFLICT CHECK ===");
    console.log("sameJobType found:", sameJobType ? "YES" : "NO");
    if (sameJobType) {
      console.log("Conflicting worker:", sameJobType.worker_name);
    }

    // Shared rows are not allowed: never permit multiple workers on same row/job.
    if (sameJobType) {
      console.log("CONFLICT DETECTED - sharing not allowed");
      return res.status(409).json({
        message: `Row ${rowNumber} is currently being worked on by ${sameJobType.worker_name} for ${normalizedJobType}. Sharing the same row/job is not allowed.`,
        conflict: true,
        existingWorker: sameJobType.worker_name,
        canOverride: false,
      });
    }

    const allBlocks = await Block.find();
    const previousAssignments = [];
    for (const existingBlock of allBlocks) {
      for (const existingRow of existingBlock.rows) {
        if (
          existingBlock.block_name === blockName &&
          existingRow.row_number === rowNumber
        ) {
          continue;
        }

        if (existingRow.active_jobs && existingRow.active_jobs.length > 0) {
          for (const activeJob of existingRow.active_jobs) {
            if (activeJob.worker_id === workerID) {
              previousAssignments.push({
                blockName: existingBlock.block_name,
                rowNumber: existingRow.row_number,
                jobType: activeJob.job_type,
                workerName: activeJob.worker_name,
              });
            }
          }
        } else if (
          existingRow.worker_id === workerID &&
          existingRow.start_time &&
          !existingRow.time_spent
        ) {
          previousAssignments.push({
            blockName: existingBlock.block_name,
            rowNumber: existingRow.row_number,
            jobType: existingRow.job_type,
            workerName: existingRow.worker_name,
          });
        }
      }
    }

    for (const assignment of previousAssignments) {
      const checkoutResponse = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        send(body) {
          if (this.statusCode === null) this.statusCode = 200;
          this.body = body;
          return this;
        },
        json(body) {
          if (this.statusCode === null) this.statusCode = 200;
          this.body = body;
          return this;
        },
      };

      await exports.checkOutWorker(
        {
          body: {
            workerID,
            workerName: assignment.workerName || workerName,
            blockName: assignment.blockName,
            rowNumber: assignment.rowNumber,
            jobType: assignment.jobType,
            checkoutReason: `Automatically checked out when checking in to Row ${rowNumber}`,
          },
          mobileAuth: req.mobileAuth,
        },
        checkoutResponse
      );

      if (checkoutResponse.statusCode >= 400) {
        return res.status(500).json({
          message: `Could not automatically check out ${workerName} from Row ${assignment.rowNumber}.`,
          error: checkoutResponse.body?.message,
        });
      }
    }

    if (previousAssignments.length > 0) {
      block = await Block.findOne({ block_name: blockName });
      row = block?.rows.find((candidate) => candidate.row_number === rowNumber);
      if (!row) {
        return res.status(404).json({ message: "Row not found after automatic checkout" });
      }
    }

    // Ensure worker record exists so we can tell whether this worker already
    // completed this row today (which must NOT reset the row to full again).
    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        total_stock_count: 0,
        blocks: [],
      });
    }

    // Determine actual remaining stock
    let actualRemainingStock;
    const rowBaseStock = Number(row.stock_count) || 0;
    const rowBaseBunches = Number(row.bunches) || 0;
    const uitknip = isUitknipJob(normalizedJobType);
    const alreadyCompletedToday = creditedStockFor(
      worker,
      blockName,
      rowNumber,
      normalizedJobType,
      localDateKey()
    );
    const completedRowToday = completedRowFor(
      worker,
      blockName,
      rowNumber,
      normalizedJobType,
      localDateKey()
    );

    if (
      row.remaining_stock_count === 0 &&
      rowBaseStock > 0 &&
      (completedRowToday || alreadyCompletedToday >= rowBaseStock)
    ) {
      // Safeguard: this worker already finished this row today. Keep the row
      // completed instead of resetting it to full, otherwise the auto-checkout
      // fired by their next check-in would credit the whole row a second time
      // (the reported Block 12 / Neil James double count).
      actualRemainingStock = 0;
      console.log(
        "Row already completed by this worker today; keeping it completed (no double credit)"
      );
    } else if (
      row.remaining_stock_count !== undefined &&
      row.remaining_stock_count !== null &&
      row.remaining_stock_count > 0
    ) {
      actualRemainingStock = row.remaining_stock_count;
      console.log(
        "Using remaining_stock_count from previous session:",
        actualRemainingStock
      );
    } else {
      actualRemainingStock = row.stock_count;
      console.log(
        "First time on row, using stock_count:",
        actualRemainingStock
      );
    }

    let actualRemainingBunches = 0;
    if (uitknip) {
      if (actualRemainingStock === 0 && rowBaseStock > 0) {
        actualRemainingBunches = 0;
      } else if (
        row.remaining_bunch_count !== undefined &&
        row.remaining_bunch_count !== null &&
        row.remaining_bunch_count > 0
      ) {
        actualRemainingBunches = Number(row.remaining_bunch_count) || 0;
      } else if (
        actualRemainingStock > 0 &&
        actualRemainingStock < rowBaseStock &&
        rowBaseStock > 0
      ) {
        // Derive from vine progress if bunch remaining not stored yet.
        actualRemainingBunches = Math.max(
          0,
          rowBaseBunches -
            calculateUitknipBunches(row, rowBaseStock - actualRemainingStock, false)
        );
      } else {
        actualRemainingBunches = rowBaseBunches;
      }
    }

    // Every worker on the same row shares one remaining balance.
    row.remaining_stock_count = actualRemainingStock;
    if (uitknip) {
      row.remaining_bunch_count = actualRemainingBunches;
    }
    if (row.active_jobs.length > 0) {
      row.shared_row = true;
    }
    row.active_jobs.forEach((job) => {
      job.remaining_stock = actualRemainingStock;
      if (uitknip || isUitknipJob(job.job_type)) {
        job.remaining_bunches = actualRemainingBunches;
      }
    });

    // Add new job to active_jobs
    const recorder = recorderName(req);
    row.active_jobs.push({
      worker_name: workerName,
      worker_id: workerID,
      job_type: normalizedJobType,
      start_time: new Date(),
      remaining_stock: actualRemainingStock,
      remaining_bunches: uitknip ? actualRemainingBunches : 0,
      time_spent: null,
      recorded_by: recorder,
    });

    // Update legacy fields
    row.worker_name = workerName;
    row.worker_id = workerID;
    row.start_time = new Date();
    row.job_type = normalizedJobType;
    row.checkin_recorded_by = recorder;

    console.log("=== ROW DATA AFTER CHECK-IN (before save) ===");
    console.log("active_jobs:", JSON.stringify(row.active_jobs, null, 2));
    console.log("remaining_stock_count:", row.remaining_stock_count);

    await block.save();

    console.log("�o. Check-in successful");

    // Record the supervisor on the worker so the Totals tab can scope to the
    // crew even before the first checkout of this shift is saved.
    if (recorder && !sameName(worker.supervisor, recorder)) {
      worker.supervisor = recorder;
    }

    await worker.save();


    const autoCheckoutMessage = previousAssignments.length
      ? ` Previous row${previousAssignments.length === 1 ? "" : "s"} checked out automatically.`
      : "";
    res.json({
      message: `${allowMultipleWorkers
        ? "Check-in successful (multiple workers on same row)"
        : "Check-in successful"}${autoCheckoutMessage}`,
      rowNumber: row.row_number,
      jobType: normalizedJobType,
      remainingStock: actualRemainingStock,
      remainingBunches: uitknip ? actualRemainingBunches : 0,
      multipleWorkersAllowed: allowMultipleWorkers || false,
      autoCheckedOut: previousAssignments.map(({ blockName: previousBlock, rowNumber: previousRow }) => ({
        blockName: previousBlock,
        rowNumber: previousRow,
      })),
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
        job.job_type.toUpperCase() === sourceJob.job_type.toUpperCase() && job.worker_id !== sourceJob.worker_id
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

    const movingUitknip = isUitknipJob(sourceJob.job_type);
    let targetRemainingStock = sourceJob.remaining_stock;
    let targetRemainingBunches = Number(sourceJob.remaining_bunches) || 0;

    if (targetJobs.length > 0) {
      // Join existing shared work on target row.
      targetRemainingStock = targetRow.remaining_stock_count ?? targetJobs[0].remaining_stock ?? targetRemainingStock;
      if (movingUitknip) {
        targetRemainingBunches = targetRow.remaining_bunch_count ?? targetJobs[0].remaining_bunches ?? targetRemainingBunches;
      }
    } else {
      // Adopting target row state when empty: prefer target row's own remaining if it indicates progress.
      if (
        targetRow.remaining_stock_count !== undefined &&
        targetRow.remaining_stock_count !== null &&
        targetRow.remaining_stock_count >= 0 &&
        (targetRow.remaining_stock_count > 0 || Number(targetRow.stock_count) === 0)
      ) {
        targetRemainingStock = targetRow.remaining_stock_count;
      }
      if (movingUitknip) {
        if (
          targetRow.remaining_bunch_count !== undefined &&
          targetRow.remaining_bunch_count !== null &&
          targetRow.remaining_bunch_count >= 0
        ) {
          targetRemainingBunches = targetRow.remaining_bunch_count;
        }
      }
    }

    const movedJob = {
      worker_name: sourceJob.worker_name,
      worker_id: sourceJob.worker_id,
      job_type: sourceJob.job_type,
      start_time: sourceJob.start_time,
      remaining_stock: targetRemainingStock,
      remaining_bunches: movingUitknip ? targetRemainingBunches : (Number(sourceJob.remaining_bunches) || 0),
      time_spent: sourceJob.time_spent ?? null,
      recorded_by: sourceJob.recorded_by || "",
    };
    targetJobs.push(movedJob);

    targetRow.remaining_stock_count = targetRemainingStock;
    if (movingUitknip) targetRow.remaining_bunch_count = targetRemainingBunches;
    targetRow.shared_row = targetJobs.length > 1;
    targetJobs.forEach((j) => {
      j.remaining_stock = targetRemainingStock;
      if (movingUitknip || isUitknipJob(j.job_type)) j.remaining_bunches = targetRemainingBunches;
    });

    sourceRow.shared_row = ensureActiveJobs(sourceRow).length > 1;
    if (sourceRow.worker_id === workerID) {
      if (ensureActiveJobs(sourceRow).length > 0) {
        const nextJob = ensureActiveJobs(sourceRow)[0];
        sourceRow.worker_name = nextJob.worker_name;
        sourceRow.worker_id = nextJob.worker_id;
        sourceRow.start_time = nextJob.start_time;
        sourceRow.time_spent = null;
        sourceRow.job_type = nextJob.job_type;
      } else {
        sourceRow.worker_name = "";
        sourceRow.worker_id = "";
        sourceRow.start_time = null;
        sourceRow.time_spent = null;
        sourceRow.job_type = "";
      }
    }

    targetRow.worker_name = movedJob.worker_name;
    targetRow.worker_id = movedJob.worker_id;
    targetRow.start_time = movedJob.start_time;
    targetRow.time_spent = null;
    targetRow.job_type = movedJob.job_type;

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
      remaining_bunches: Number(secondJob.remaining_bunches) || 0,
      time_spent: secondJob.time_spent ?? null,
      recorded_by: secondJob.recorded_by || "",
    };

    ensureActiveJobs(secondRow)[secondJobIndex] = {
      worker_name: firstJob.worker_name,
      worker_id: firstJob.worker_id,
      job_type: firstJob.job_type,
      start_time: firstJob.start_time,
      remaining_stock: firstJob.remaining_stock,
      remaining_bunches: Number(firstJob.remaining_bunches) || 0,
      time_spent: firstJob.time_spent ?? null,
      recorded_by: firstJob.recorded_by || "",
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
  const {
    workerID,
    workerName,
    rowNumber,
    blockName,
    stockCount,
    jobType,
    keepCheckedIn,
    workDate,
    checkoutReason,
  } = req.body;

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

    const selectedWorkDate = parseWorkDate(workDate);
    if (!selectedWorkDate) {
      return res.status(400).send({ message: "Work date must use YYYY-MM-DD format." });
    }
    const requestedWorkDate = workDate ? String(workDate) : localDateKey();
    const isBackdated = requestedWorkDate !== localDateKey();
    if (isBackdated && !req.mobileAuth?.isAdmin) {
      return res.status(403).send({
        message: "Only an authorized admin can backdate a checkout.",
        requiresAdmin: true,
      });
    }
    if (isBackdated && !String(checkoutReason || "").trim()) {
      return res.status(400).send({
        message: "A reason is required for a backdated checkout.",
        requiresReason: true,
      });
    }

    let job = null;
    let jobIndex = -1;
    let timeSpentInMinutes = 0;
    let currentRemaining = 0;
    let currentRemainingBunches = 0;
    let checkinStartedAt = null;
    let usedJobType = jobType ? String(jobType).trim().toUpperCase() : "UNKNOWN";

    // Try NEW FORMAT first (active_jobs). Prefer a worker-plus-job match, but
    // always fall back to a worker-only match.
    if (row.active_jobs && row.active_jobs.length > 0) {
      if (jobType) {
        jobIndex = row.active_jobs.findIndex(
          (j) => j.worker_id === workerID && String(j.job_type || "").toUpperCase() === usedJobType
        );
      }
      if (jobIndex === -1) {
        jobIndex = row.active_jobs.findIndex((j) => j.worker_id === workerID);
      }

      if (jobIndex !== -1) {
        job = row.active_jobs[jobIndex];
        usedJobType = String(job.job_type || usedJobType).toUpperCase();
        const endTime = new Date();
        timeSpentInMinutes = (endTime - new Date(job.start_time)) / 1000 / 60;
        currentRemaining = row.remaining_stock_count ?? job.remaining_stock ?? 0;
        currentRemainingBunches = isUitknipJob(usedJobType)
          ? (row.remaining_bunch_count ?? job.remaining_bunches ?? getRowRemainingBunches(row, usedJobType))
          : 0;
        checkinStartedAt = job.start_time;
      }
    }

    // Fallback to OLD FORMAT only when this worker has no active job record.
    if (!job && row.worker_id === workerID) {
      if (!row.start_time || row.time_spent) {
        return res
          .status(400)
          .send({ message: "Worker is not checked in to this row" });
      }
      usedJobType = String(row.job_type || "UNKNOWN").toUpperCase();
      const endTime = new Date();
      timeSpentInMinutes = (endTime - new Date(row.start_time)) / 1000 / 60;
      currentRemaining = row.remaining_stock_count ?? row.stock_count ?? 0;
      currentRemainingBunches = isUitknipJob(usedJobType)
        ? (row.remaining_bunch_count ?? getRowRemainingBunches(row, usedJobType))
        : 0;
      checkinStartedAt = row.start_time;
    }

    if (!job && row.worker_id !== workerID) {
      return res.status(200).send({
        message: "Worker is already checked out on this row.",
        alreadyCheckedOut: true,
        stockCompleted: 0,
        bunchesCompleted: 0,
        timeSpent: "0min",
        rowNumber: row.row_number,
        remainingStocks: 0,
        remainingBunches: 0,
        jobType: usedJobType,
      });
    }

    // Validate stock count
    let stockCompleted;
    if (typeof stockCount === "undefined" || stockCount === null || stockCount === "") {
      stockCompleted = currentRemaining;
    } else {
      stockCompleted = Number(stockCount);
      if (isNaN(stockCompleted) || stockCompleted < 0) {
        return res.status(400).send({ message: "Invalid stock count value." });
      }
      if (stockCompleted > currentRemaining) {
        return res.status(400).send({
          message: `Invalid stock count: cannot complete ${stockCompleted} vines when only ${currentRemaining} remain.`,
        });
      }
    }

    // Safeguard: cap cumulative credit for this worker/row/job/work-date at one
    // row's worth of vines.
    let worker = await Worker.findOne({ workerID });
    if (!worker) {
      worker = new Worker({
        workerID,
        name: workerName,
        blocks: [],
        total_stock_count: 0,
      });
    }
    const rowBaseStock = Number(row.stock_count) || 0;
    const rowBaseBunches = Number(row.bunches) || 0;
    const alreadyCredited = creditedStockFor(
      worker,
      blockName,
      rowNumber,
      usedJobType,
      localDateKey(selectedWorkDate)
    );
    const creditAllowance = Math.max(0, rowBaseStock - alreadyCredited);
    const requestedStockCompleted = stockCompleted;
    let creditCapped = false;
    if (rowBaseStock > 0 && stockCompleted > creditAllowance) {
      stockCompleted = creditAllowance;
      creditCapped = true;
    }

    const leftover = Math.max(0, currentRemaining - stockCompleted);
    const completingRow = leftover === 0;
    const uitknip = isUitknipJob(usedJobType);

    let bunchesCompleted = 0;
    let bunchesLeftover = 0;
    if (uitknip) {
      if (completingRow) {
        // Completing remaining must reconcile to exact remaining bunches (and thus exact totals overall).
        bunchesCompleted = Math.max(0, Number(currentRemainingBunches) || 0);
        if (currentRemaining === rowBaseStock && stockCompleted === rowBaseStock) {
          bunchesCompleted = rowBaseBunches;
        }
        bunchesLeftover = 0;
      } else {
        bunchesCompleted = calculateUitknipBunches(row, stockCompleted, false);
        if (bunchesCompleted > (Number(currentRemainingBunches) || 0)) {
          bunchesCompleted = Math.max(0, Number(currentRemainingBunches) || 0);
        }
        bunchesLeftover = Math.max(0, (Number(currentRemainingBunches) || 0) - bunchesCompleted);
      }
    }

    // Update block/row state
    if (job) {
      row.remaining_stock_count = leftover;
      if (uitknip) {
        row.remaining_bunch_count = bunchesLeftover;
      }
      row.active_jobs.forEach((activeJob) => {
        activeJob.remaining_stock = leftover;
        if (uitknip || isUitknipJob(activeJob.job_type)) {
          activeJob.remaining_bunches = uitknip ? bunchesLeftover : (Number(activeJob.remaining_bunches) || 0);
        }
      });

      if (keepCheckedIn && leftover > 0) {
        job.start_time = new Date();
        job.time_spent = null;
        job.remaining_stock = leftover;
        if (uitknip) job.remaining_bunches = bunchesLeftover;
      } else {
        row.active_jobs.splice(jobIndex, 1);
        row.shared_row = row.active_jobs.length > 1;

        if (row.worker_id === workerID) {
          if (row.active_jobs.length > 0) {
            const nextJob = row.active_jobs[0];
            row.worker_name = nextJob.worker_name;
            row.worker_id = nextJob.worker_id;
            row.start_time = nextJob.start_time;
            row.time_spent = null;
            row.job_type = nextJob.job_type;
          } else {
            row.worker_name = "";
            row.worker_id = "";
            row.start_time = null;
            row.time_spent = null;
            row.job_type = "";
          }
        }
      }
    } else {
      // Legacy format
      row.remaining_stock_count = leftover;
      if (uitknip) row.remaining_bunch_count = bunchesLeftover;
      row.time_spent = null;
      row.worker_name = "";
      row.worker_id = "";
      row.start_time = null;
      row.job_type = "";
    }

    await block.save();

    // Update worker history
    const recorder = recorderName(req);
    const checkoutRecordedAt = new Date();
    const workDateKey = localDateKey(selectedWorkDate);
    const workDateObj = new Date(`${workDateKey}T12:00:00`);

    let blockEntry = worker.blocks.find((b) => b.block_name === blockName);
    if (!blockEntry) {
      blockEntry = { block_name: blockName, rows: [] };
      worker.blocks.push(blockEntry);
    }

    let rowEntry = blockEntry.rows.find(
      (r) =>
        r.row_number === rowNumber &&
        String(r.job_type || "").toUpperCase() === usedJobType &&
        r.date &&
        localDateKey(r.date) === workDateKey
    );

    if (!rowEntry) {
      rowEntry = {
        row_number: rowNumber,
        job_type: usedJobType,
        stock_count: 0,
        bunch_count: 0,
        time_spent: 0,
        date: workDateObj,
        day_of_week: workDateObj.toLocaleDateString("en-US", { weekday: "long" }),
        checkout_events: [],
        recorded_by: recorder,
        checkout_recorded_by: recorder,
        checkout_reason: checkoutReason || "",
        backdated_checkout: isBackdated,
        last_checkout_at: checkoutRecordedAt,
      };
      blockEntry.rows.push(rowEntry);
    }

    rowEntry.stock_count = (Number(rowEntry.stock_count) || 0) + stockCompleted;
    if (uitknip) {
      rowEntry.bunch_count = (Number(rowEntry.bunch_count) || 0) + bunchesCompleted;
    }
    rowEntry.time_spent = (Number(rowEntry.time_spent) || 0) + (Number(timeSpentInMinutes) || 0);
    rowEntry.checkout_recorded_at = checkoutRecordedAt;
    rowEntry.checkout_recorded_by = recorder;
    rowEntry.checkout_reason = checkoutReason || rowEntry.checkout_reason || "";
    rowEntry.backdated_checkout = Boolean(isBackdated || rowEntry.backdated_checkout);
    rowEntry.backdated_by = isBackdated ? recorder : (rowEntry.backdated_by || "");
    rowEntry.last_checkout_at = checkoutRecordedAt;

    if (!Array.isArray(rowEntry.checkout_events)) {
      rowEntry.checkout_events = [];
    }
    rowEntry.checkout_events.push({
      checkout_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      work_date: workDateKey,
      recorded_at: checkoutRecordedAt,
      recorded_by: recorder || "System",
      reason: checkoutReason || "",
      backdated: isBackdated,
      vines_before: currentRemaining,
      vines_completed: stockCompleted,
      vines_remaining: leftover,
      bunches_before: uitknip ? (Number(currentRemainingBunches) || 0) : 0,
      bunches_completed: uitknip ? bunchesCompleted : 0,
      bunches_remaining: uitknip ? bunchesLeftover : 0,
      minutes_worked: Math.round((Number(timeSpentInMinutes) || 0) * 100) / 100,
      kept_checked_in: Boolean(keepCheckedIn && leftover > 0),
      checkin_started_at: checkinStartedAt ? new Date(checkinStartedAt) : null,
    });

    worker.total_stock_count = (Number(worker.total_stock_count) || 0) + stockCompleted;
    if (recorder && !sameName(worker.supervisor, recorder)) {
      worker.supervisor = recorder;
    }
    await worker.save();

    const keptCheckedInResult = Boolean(keepCheckedIn && leftover > 0 && job);
    return res.json({
      message: keptCheckedInResult
        ? `Checkout recorded. Worker kept checked in on Row ${rowNumber}.`
        : `Checkout successful for Row ${rowNumber}.`,
      stockCompleted,
      bunchesCompleted: uitknip ? bunchesCompleted : 0,
      timeSpent: `${Math.round((Number(timeSpentInMinutes) || 0) * 100) / 100}min`,
      rowNumber: row.row_number,
      remainingStocks: leftover,
      rowRemainingStocks: leftover,
      remainingBunches: uitknip ? bunchesLeftover : 0,
      rowRemainingBunches: uitknip ? bunchesLeftover : 0,
      keptCheckedIn: keptCheckedInResult,
      jobType: usedJobType,
      workDate: workDateKey,
      checkoutRecordedAt,
      checkoutID: rowEntry.checkout_events[rowEntry.checkout_events.length - 1].checkout_id,
      backdated: isBackdated,
      backdatedBy: isBackdated ? recorder : null,
      creditCapped,
      requestedVinesCompleted: requestedStockCompleted,
      requestedStockCompleted,
    });
  } catch (error) {
    console.error("❌ Error during check-out:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


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
                stockCount: row.remaining_stock_count ?? job.remaining_stock,
                vines: row.stock_count,
                startTime: job.start_time,
                remainingStocks: row.remaining_stock_count ?? job.remaining_stock,
                rowRemainingStocks: row.remaining_stock_count ?? row.stock_count,
                sharedRow: Boolean(row.shared_row || row.active_jobs.length > 1),
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
            vines: row.stock_count,
            startTime: row.start_time,
            remainingStocks: row.remaining_stock_count || row.stock_count,
            sharedRow: Boolean(row.shared_row),
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
  const scope = resolveScope(req);
  if (scope.scope === "blocked") {
    return rejectBlockedScope(res, scope);
  }

  try {
    const blocks = await Block.find();
    let activeCheckins = [];

    blocks.forEach((block) => {
      block.rows.forEach((row) => {
        if (row.active_jobs && row.active_jobs.length > 0) {
          row.active_jobs.forEach((job) => {
            if (
              scope.scope !== "all" &&
              !sameName(job.recorded_by, scope.supervisorName)
            ) {
              return;
            }
            const jobTypeNorm = (job.job_type || "").trim().toUpperCase();
            const uitknip = isUitknipJob(jobTypeNorm);
            const remainingVines = row.remaining_stock_count ?? job.remaining_stock;
            const remainingBunches = uitknip
              ? (row.remaining_bunch_count ?? job.remaining_bunches ?? 0)
              : 0;
            activeCheckins.push({
              blockName: block.block_name,
              job_type: jobTypeNorm,
              rowNumber: row.row_number,
              workerID: job.worker_id,
              workerName: job.worker_name,
              stockCount: remainingVines,
              vines: row.stock_count,
              bunches: row.bunches || 0,
              startTime: job.start_time,
              remainingStocks: remainingVines,
              rowRemainingStocks: row.remaining_stock_count ?? row.stock_count,
              remainingBunches,
              rowRemainingBunches: uitknip ? (row.remaining_bunch_count ?? row.bunches ?? 0) : 0,
              sharedRow: Boolean(row.shared_row || row.active_jobs.length > 1),
            });
          });
        }

        if (
          (!row.active_jobs || row.active_jobs.length === 0) &&
          row.worker_id &&
          row.start_time &&
          !row.time_spent
        ) {
          if (
            scope.scope !== "all" &&
            !sameName(row.checkin_recorded_by, scope.supervisorName)
          ) {
            return;
          }
          const jobTypeNorm = (row.job_type || "").trim().toUpperCase();
          const uitknip = isUitknipJob(jobTypeNorm);
          activeCheckins.push({
            blockName: block.block_name,
            job_type: jobTypeNorm,
            rowNumber: row.row_number,
            workerID: row.worker_id,
            workerName: row.worker_name,
            stockCount: row.stock_count,
            vines: row.stock_count,
            bunches: row.bunches || 0,
            startTime: row.start_time,
            remainingStocks: row.remaining_stock_count || row.stock_count,
            remainingBunches: uitknip ? (row.remaining_bunch_count || row.bunches || 0) : 0,
            sharedRow: Boolean(row.shared_row),
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
            vines: row.stock_count,
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
