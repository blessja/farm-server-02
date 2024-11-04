const express = require("express");
const router = express.Router();
const workerController = require("../controllers/workerController");

// Check-in a worker
router.post("/checkinworker", workerController.checkInWorkers);

// Check-out a worker
router.post("/checkoutworker", workerController.checkOutWorkers);

module.exports = router;
