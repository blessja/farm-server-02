const express = require("express");
const router = express.Router();
const bunchController = require("../controllers/bunchController");

// Get all bunches for a specific stock
router.get("/:stockId/bunches", bunchController.getBunchesForStock);

// Create a new bunch for a stock
router.post("/:stockId/bunches", bunchController.createBunch);

// Update a specific bunch
router.put("/bunches/:id", bunchController.updateBunch);

// Delete a specific bunch
router.delete("/bunches/:id", bunchController.deleteBunch);

module.exports = router;
