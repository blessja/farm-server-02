// routes/hoursRoutes.js
const express = require("express");
const router = express.Router();
const hoursController = require("../controllers/hoursController");

// Get all saved day hours
router.get("/", hoursController.getDayHours);

// Save hours worked for a worker on a day
router.post("/save", hoursController.saveDayHours);

// Clear hours worked for a worker on a day
router.post("/delete", hoursController.deleteDayHours);

module.exports = router;