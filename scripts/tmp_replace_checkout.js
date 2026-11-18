const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'controllers', 'rowController.js');
const s = fs.readFileSync(file, 'utf8');
const start = 25619, end = 38566;
const replacement = `exports.checkOutWorker = async (req, res) => {
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
          message: \`Invalid stock count: cannot complete \${stockCompleted} vines when only \${currentRemaining} remain.\`,
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
    const workDateObj = new Date(\`\${workDateKey}T12:00:00\`);

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
      checkout_id: \`\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}\`,
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
        ? \`Checkout recorded. Worker kept checked in on Row \${rowNumber}.\`
        : \`Checkout successful for Row \${rowNumber}.\`,
      stockCompleted,
      bunchesCompleted: uitknip ? bunchesCompleted : 0,
      timeSpent: \`\${Math.round((Number(timeSpentInMinutes) || 0) * 100) / 100}min\`,
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

`;
fs.writeFileSync(file, s.slice(0, start) + replacement + s.slice(end));
console.log('replaced checkout', start, end);
