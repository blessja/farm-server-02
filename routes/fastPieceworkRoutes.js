const express = require("express");
const router = express.Router();
const fastPieceworkController = require("../controllers/fastPieceworkController");

// Fast check-in (single scan)
router.post("/fast-checkin", fastPieceworkController.fastCheckIn);

// Get fast piecework totals
router.get("/fast-totals", fastPieceworkController.getFastPieceworkTotals);

// Get available job types
router.get("/job-types", fastPieceworkController.getFastPieceworkJobTypes);

module.exports = router;
