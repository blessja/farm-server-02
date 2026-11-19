const Block = require("../models/Block");
const Worker = require("../models/Worker");
const UitknipDayHours = require("../models/UitknipDayHours");
const {
  resolveScope,
  rejectBlockedScope,
  sameName,
  namePattern,
} = require("../utils/supervisorScope");

function normalizeDate(dateStr) {
  if (typeof dateStr !== "string") return "";
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function parseHours(rawHours) {
  if (rawHours === "" || rawHours === undefined || rawHours === null) {
    return { error: "Hours is required." };
  }
  const value = Number(rawHours);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Hours must be a non-negative number." };
  }
  return { value: Math.round(value * 100) / 100 };
}

function recorderName(req) {
  const scope = resolveScope(req);
  return scope.supervisorName || "";
}

function normalizeRowsInput(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return null;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function toInt(val) {
  if (val === undefined || val === null || val === "") return NaN;
  const n = Number(String(val).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

exports.previewBunchImport = async (req, res) => {
  try {
    const rows = normalizeRowsInput(req.body);
    if (!rows) {
      return res.status(400).json({ message: "Provide an array of rows or { rows: [...] }." });
    }

    const blocks = await Block.find({}, { block_name: 1, rows: 1 }).lean();
    const blockMap = new Map();
    blocks.forEach((b) => blockMap.set(String(b.block_name || "").trim(), b));

    const results = [];
    let matches = 0;
    let differences = 0;
    let missingBlocks = 0;
    let missingRows = 0;
    let invalid = 0;

    rows.forEach((item, index) => {
      const blockName = String(
        pick(item, ["block_name", "blockName", "block", "Block", "BLOCK"]) || ""
      ).trim();
      const rowNumber = String(
        pick(item, ["row_number", "rowNumber", "row", "Row", "ROW", "row_no"]) || ""
      ).trim();
      const bunches = toInt(pick(item, ["bunches", "Bunches", "BUNCHES", "tros", "Tros"]));

      const base = {
        index,
        blockName,
        rowNumber,
        importedBunches: Number.isFinite(bunches) ? bunches : null,
      };

      if (!blockName || !rowNumber || !Number.isFinite(bunches) || bunches < 0) {
        invalid++;
        results.push({ ...base, status: "invalid", message: "Missing/invalid block, row, or bunches." });
        return;
      }

      const block = blockMap.get(blockName);
      if (!block) {
        missingBlocks++;
        results.push({ ...base, status: "missing_block", message: "Block not found." });
        return;
      }

      const row = (block.rows || []).find((r) => String(r.row_number) === rowNumber);
      if (!row) {
        missingRows++;
        results.push({ ...base, status: "missing_row", message: "Row not found in block." });
        return;
      }

      const existingBunches = Number(row.bunches) || 0;
      const hasExisting = existingBunches > 0;
      const different = hasExisting && existingBunches !== bunches;
      if (hasExisting) matches++;
      if (different) differences++;

      results.push({
        ...base,
        status: different ? "different" : (hasExisting ? "same" : "new"),
        existingBunches,
        hasExisting,
        different,
        vines: Number(row.stock_count) || 0,
        canApply: true,
      });
    });

    res.json({
      summary: {
        total: rows.length,
        matches,
        differences,
        missingBlocks,
        missingRows,
        invalid,
      },
      rows: results,
    });
  } catch (error) {
    console.error("Error previewing bunch import:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.applyBunchImport = async (req, res) => {
  try {
    const rows = normalizeRowsInput(req.body);
    const decisions = req.body?.decisions || {}; // key: `${blockName}::${rowNumber}` or index string -> "overwrite"|"skip"
    const overwriteAll = req.body?.overwriteAll === true;
    const skipAll = req.body?.skipAll === true;
    if (!rows) {
      return res.status(400).json({ message: "Provide an array of rows or { rows: [...] }." });
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const details = [];

    // Group by block to reduce saves
    const grouped = new Map();
    rows.forEach((item, index) => {
      const blockName = String(
        pick(item, ["block_name", "blockName", "block", "Block", "BLOCK"]) || ""
      ).trim();
      const rowNumber = String(
        pick(item, ["row_number", "rowNumber", "row", "Row", "ROW", "row_no"]) || ""
      ).trim();
      const bunches = toInt(pick(item, ["bunches", "Bunches", "BUNCHES", "tros", "Tros"]));
      if (!blockName || !rowNumber || !Number.isFinite(bunches) || bunches < 0) {
        failed++;
        details.push({ index, blockName, rowNumber, status: "invalid" });
        return;
      }
      if (!grouped.has(blockName)) grouped.set(blockName, []);
      grouped.get(blockName).push({ index, blockName, rowNumber, bunches });
    });

    for (const [blockName, items] of grouped.entries()) {
      const block = await Block.findOne({ block_name: blockName });
      if (!block) {
        items.forEach((it) => {
          failed++;
          details.push({ ...it, status: "missing_block" });
        });
        continue;
      }

      let changed = false;
      for (const it of items) {
        const row = block.rows.find((r) => String(r.row_number) === it.rowNumber);
        if (!row) {
          failed++;
          details.push({ ...it, status: "missing_row" });
          continue;
        }
        const existingBunches = Number(row.bunches) || 0;
        const different = existingBunches > 0 && existingBunches !== it.bunches;
        const key = `${it.blockName}::${it.rowNumber}`;
        let decision = decisions[key] ?? decisions[String(it.index)];
        if (!decision) {
          if (different) decision = overwriteAll ? "overwrite" : (skipAll ? "skip" : "skip");
          else decision = "overwrite"; // new or same
        }

        if (different && decision === "skip") {
          skipped++;
          details.push({ ...it, status: "skipped", existingBunches });
          continue;
        }

        row.bunches = it.bunches;
        changed = true;
        updated++;
        details.push({ ...it, status: different ? "overwritten" : (existingBunches > 0 ? "unchanged" : "set"), existingBunches });
      }

      if (changed) await block.save();
    }

    res.json({
      message: `Bunch import applied. Updated: ${updated}, skipped: ${skipped}, failed: ${failed}.`,
      summary: { updated, skipped, failed },
      details,
    });
  } catch (error) {
    console.error("Error applying bunch import:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

function isUitknipLikeJob(jobType) {
  const jt = String(jobType || "").trim().toUpperCase();
  return jt === "UITKNIP" || jt === "UITKNIP02";
}

async function buildUitknipTotals(req, res, { includeUitknip02 = false } = {}) {
  const scope = resolveScope(req);
  if (scope.scope === "blocked") {
    return rejectBlockedScope(res, scope);
  }

  try {
    const workers = await Worker.find(
      {},
      { workerID: 1, name: 1, blocks: 1, supervisor: 1 }
    ).lean();
    const blocks = await Block.find(
      {},
      { block_name: 1, total_stocks: 1, total_rows: 1, variety: 1, bunches: 1, rows: 1 }
    ).lean();

    const blockInfo = {};
    blocks.forEach((block) => {
      blockInfo[block.block_name] = {
        totalVines: block.total_stocks,
        totalRows: block.total_rows,
        variety: block.variety,
      };
    });

    const filteredData = [];
    workers.forEach((worker) => {
      let totalVines = 0;
      let totalBunches = 0;
      const outRows = [];

      (worker.blocks || []).forEach((block) => {
        (block.rows || []).forEach((row) => {
          const jobType = String(row.job_type || "").toUpperCase();
          const match = includeUitknip02 ? isUitknipLikeJob(jobType) : jobType === "UITKNIP";
          if (!match) return;

          // Avoid double-counting: when showing combined UITKNIP+UITKNIP02 (e.g. hours table),
          // skip UITKNIP rows that are duplicates of UITKNIP02 records.
          if (includeUitknip02 && row.totalsExcluded && jobType === "UITKNIP") return;

          const vines = Number(row.stock_count) || 0;
          const bunches = Number(row.bunch_count) || 0;
          if (vines <= 0 && bunches <= 0) return;
          totalVines += vines;
          totalBunches += bunches;
          outRows.push({
            blockName: block.block_name,
            rowNumber: row.row_number,
            vines,
            bunches,
            date: row.date,
            jobType,
            timeSpent: row.time_spent || 0,
            variety: (blockInfo[block.block_name] || {}).variety || "",
          });
        });
      });

      if (totalVines > 0 || totalBunches > 0) {
        filteredData.push({
          workerID: worker.workerID,
          workerName: worker.name,
          totalVines,
          totalBunches,
          rows: outRows,
        });
      }
    });

    filteredData.sort((a, b) => b.totalVines - a.totalVines || b.totalBunches - a.totalBunches);

    res.json({
      workers: filteredData,
      summary: {
        totalWorkers: filteredData.length,
        totalVines: filteredData.reduce((s, w) => s + (w.totalVines || 0), 0),
        totalBunches: filteredData.reduce((s, w) => s + (w.totalBunches || 0), 0),
        source: includeUitknip02 ? "Worker collection (UITKNIP/UITKNIP02)" : "Worker collection (UITKNIP)",
      },
    });
  } catch (error) {
    console.error("Error fetching uitknip totals:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

exports.getUitknipTotals = async (req, res) => {
  return buildUitknipTotals(req, res, { includeUitknip02: false });
};

exports.getUitknipHoursTotals = async (req, res) => {
  return buildUitknipTotals(req, res, { includeUitknip02: true });
};

exports.getUitknipIntervalHours = async (req, res) => {
  const scope = resolveScope(req);
  if (scope.scope === "blocked") return rejectBlockedScope(res, scope);
  try {
    const query = scope.scope === "all" ? {} : { recordedBy: namePattern(scope.supervisorName) };
    const hours = await UitknipDayHours.find(query).lean();
    res.json(
      hours.map((entry) => ({
        workerID: entry.workerID,
        workerName: entry.workerName || "",
        date: entry.date,
        interval1Hours: Number(entry.interval1Hours) || 0,
        interval2Hours: Number(entry.interval2Hours) || 0,
      }))
    );
  } catch (error) {
    console.error("Error fetching uitknip interval hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.saveUitknipIntervalHours = async (req, res) => {
  const scope = resolveScope(req);
  if (scope.scope === "blocked") return rejectBlockedScope(res, scope);
  try {
    const { workerID, workerName, date, interval1Hours, interval2Hours } = req.body || {};
    const cleanDate = normalizeDate(date);
    const cleanID = String(workerID || "").trim();
    if (!cleanID) return res.status(400).json({ message: "Worker ID is required." });
    if (!cleanDate) return res.status(400).json({ message: "A valid date (yyyy-mm-dd) is required." });
    const h1 = parseHours(interval1Hours ?? 0);
    const h2 = parseHours(interval2Hours ?? 0);
    if (h1.error) return res.status(400).json({ message: `05:00-07:00: ${h1.error}` });
    if (h2.error) return res.status(400).json({ message: `17:30-19:00: ${h2.error}` });
    const recordedBy = recorderName(req);
    const entry = await UitknipDayHours.findOneAndUpdate(
      { workerID: cleanID, date: cleanDate, recordedBy },
      {
        $set: {
          workerID: cleanID,
          workerName: String(workerName || ""),
          date: cleanDate,
          interval1Hours: h1.value,
          interval2Hours: h2.value,
          recordedBy,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({
      message: "Uitknip hours saved.",
      entry: {
        workerID: entry.workerID,
        workerName: entry.workerName,
        date: entry.date,
        interval1Hours: entry.interval1Hours,
        interval2Hours: entry.interval2Hours,
      },
    });
  } catch (error) {
    console.error("Error saving uitknip interval hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.saveUitknipIntervalHoursBulk = async (req, res) => {
  const scope = resolveScope(req);
  if (scope.scope === "blocked") return rejectBlockedScope(res, scope);
  try {
    const { date, entries } = req.body || {};
    const cleanDate = normalizeDate(date);
    if (!cleanDate) return res.status(400).json({ message: "A valid date (yyyy-mm-dd) is required." });
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "Entries array is required." });
    }
    const recordedBy = recorderName(req);
    const ops = [];
    for (const item of entries) {
      const cleanID = String(item?.workerID || "").trim();
      if (!cleanID) continue;
      const h1 = parseHours(item?.interval1Hours ?? 0);
      const h2 = parseHours(item?.interval2Hours ?? 0);
      if (h1.error || h2.error) {
        return res.status(400).json({ message: `Invalid hours for worker ${cleanID}.` });
      }
      ops.push({
        updateOne: {
          filter: { workerID: cleanID, date: cleanDate, recordedBy },
          update: {
            $set: {
              workerID: cleanID,
              workerName: String(item?.workerName || ""),
              date: cleanDate,
              interval1Hours: h1.value,
              interval2Hours: h2.value,
              recordedBy,
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length) await UitknipDayHours.bulkWrite(ops);
    res.json({ message: `Saved uitknip hours for ${ops.length} worker(s).`, count: ops.length });
  } catch (error) {
    console.error("Error bulk saving uitknip interval hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.deleteUitknipIntervalHours = async (req, res) => {
  const scope = resolveScope(req);
  if (scope.scope === "blocked") return rejectBlockedScope(res, scope);
  try {
    const { workerID, date } = req.body || {};
    const cleanDate = normalizeDate(date);
    const cleanID = String(workerID || "").trim();
    if (!cleanID || !cleanDate) return res.status(400).json({ message: "workerID and date are required." });
    const recordedBy = recorderName(req);
    await UitknipDayHours.deleteOne({ workerID: cleanID, date: cleanDate, recordedBy });
    res.json({ message: "Uitknip hours cleared." });
  } catch (error) {
    console.error("Error deleting uitknip interval hours:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
