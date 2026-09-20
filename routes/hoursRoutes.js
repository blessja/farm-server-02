// routes/hoursRoutes.js
const express = require("express");
const router = express.Router();
const hoursController = require("../controllers/hoursController");

// Get all saved day hours
router.get("/", hoursController.getDayHours);

// Save hours worked for a worker on a day
router.post("/save", hoursController.saveDayHours);

// Save the same hours for a group of workers on a day (totals column fill)
router.post("/save-bulk", hoursController.saveDayHoursBulk);

// Clear hours worked for a worker on a day
router.post("/delete", hoursController.deleteDayHours);

module.exports = router;