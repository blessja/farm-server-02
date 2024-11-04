// routes/rowRoutes.js
const express = require("express");
const router = express.Router();
const rowController = require("../controllers/rowController");
const Block = require("../models/Block");

router.post("/checkin", rowController.checkInWorker);
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
    const blocks = await Block.find({});
    res.json(blocks.map((block) => block.block_name));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch blocks", error });
  }
});

// Get rows for a specific block
router.get("/block/:blockName/rows", async (req, res) => {
  try {
    const block = await Block.findOne({ block_name: req.params.blockName });
    if (!block) return res.status(404).json({ message: "Block not found" });
    res.json(block.rows.map((row) => row.row_number));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rows", error });
  }
});

// router.get("/farm-data", rowController.getAllFarmData);

module.exports = router;
