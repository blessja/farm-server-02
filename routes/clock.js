const express = require("express");
const router = express.Router();
const { monitorClockIns } = require("../controllers/clockController");

// Monitoring clock-ins and outs
router.get("/monitor-clockins", monitorClockIns);

module.exports = router;
