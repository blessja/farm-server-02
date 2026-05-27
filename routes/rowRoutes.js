// routes/rowRoutes.js
const express = require("express");
const router = express.Router();
const rowController = require("../controllers/rowController");
const Block = require("../models/Block");

router.post("/checkin", rowController.checkInWorker);
router.post("/move-worker", rowController.moveWorkerToRow);
router.post("/swap-workers", rowController.swapWorkersBetweenRows);
router.post("/checkout", rowController.checkOutWorker);

router.get("/block/:blockName/row/:rowNumber", rowController.getRowByNumber);
router.get(
  "/block/:blockName/remaining-stocks",
  rowController.getRemainingStocks
);
router.get(
  "/block/:blockName/row/:rowNumber/remaining-stocks",
  rowController.getRemainingStocksForRow
);

router.get("/workers/current-checkins", rowController.getCurrentCheckins);
router.get(
  "/worker/:workerID/current-checkin",
  rowController.getCurrentCheckin
);

router.put("/workers/clearAllCheckins", rowController.clearAllCheckins);

//get rows with remaining stocks
router.get(
  "/rows-with-remaining-stocks",
  rowController.getRowsWithRemainingStocks
);

//  Delete single or multiple rows-with-remaining-stocks
router.delete(
  "/rows-with-remaining-vines",
  rowController.deleteRowsWithRemainingStocks
);

// get workers
router.get("/workers", rowController.getWorkers);

// Get a block by name
router.get("/block/:blockName", async (req, res) => {
  try {
    const block = await Block.findOne({ block_name: req.params.blockName });
    if (!block) return res.status(404).json({ message: "Block not found" });
    res.json(block);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch block", error });
  }
});

// Get all blocks for dropdown
router.get("/blocks", async (req, res) => {
  try {
    const blocks = await Block.find(
      {
        block_name: { $exists: true, $nin: [null, ""] },
      },
      { block_name: 1 }
    ).lean();

    const blockNames = [...new Set(
      blocks
        .map((block) =>
          typeof block.block_name === "string" ? block.block_name.trim() : ""
        )
        .filter(Boolean)
    )];

    res.json(blockNames);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch blocks", error });
  }
});

// Get rows for a specific block
router.get("/block/:blockName/rows", async (req, res) => {
  try {
    const block = await Block.findOne({ block_name: req.params.blockName });
    if (!block) return res.status(404).json({ message: "Block not found" });

    const rowNumbers = [...new Set(
      (Array.isArray(block.rows) ? block.rows : [])
        .map((row) =>
          typeof row?.row_number === "string"
            ? row.row_number.trim()
            : row?.row_number
        )
        .filter((rowNumber) => rowNumber !== null && rowNumber !== undefined && rowNumber !== "")
    )];

    res.json(rowNumbers);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rows", error });
  }
});

// router.get("/farm-data", rowController.getAllFarmData);

// Add these routes to your existing rowRoutes.js

// Reset completed fast piecework jobs (remaining_stock === 0)
router.post("/reset-completed-fast-piecework", rowController.resetCompletedFastPiecework);

// Reset specific row's active_jobs
router.post("/reset-row-active-jobs", rowController.resetRowActiveJobs);

// Reset ALL active_jobs (use with caution)
router.post("/reset-all-active-jobs", rowController.resetAllActiveJobs);

module.exports = router;
