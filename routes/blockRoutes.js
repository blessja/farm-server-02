const express = require("express");
const router = express.Router();
const blockController = require("../controllers/blockController");

// Get all blocks
router.get("/", blockController.getAllBlocks);

// Get a specific block by name
router.get("/:blockName", blockController.getBlockByName);

module.exports = router;
