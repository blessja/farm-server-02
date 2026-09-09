const express = require("express");
const router = express.Router();
const workerController = require("../controllers/workerController");

// Check-in a worker
router.post("/checkinworker", workerController.checkInWorkers);

// Check-out a worker
router.post("/checkoutworker", workerController.checkOutWorkers);

// routes/workerRoutes.js - Add this route
router.get(
  "/regular-piecework-totals",
  workerController.getRegularPieceworkTotals
);

// List workers
router.get("/list", workerController.listWorkers);

// Add a new worker
router.post("/add", workerController.addWorker);

module.exports = router;
