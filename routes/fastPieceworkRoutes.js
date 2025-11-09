// routes/fastPieceworkRoutes.js
const express = require("express");
const router = express.Router();
const fastPieceworkController = require("../controllers/fastPieceworkController");

// ✅ Fast piecework (single scan) - saves to PieceworkWorker collection
router.post("/fast-checkin", fastPieceworkController.fastCheckIn);

// ✅ Fast piecework totals - reads from PieceworkWorker collection
router.get("/fast-totals", fastPieceworkController.getFastPieceworkTotals);

// Get available job types
router.get("/job-types", fastPieceworkController.getFastPieceworkJobTypes);

//swapp workers 
router.post("/swap-worker", fastPieceworkController.swapFastPieceworkWorker);

module.exports = router;
