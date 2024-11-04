const express = require("express");
const router = express.Router();
const VarietyModel = require("../models/Variety");

// Example controller function to get varieties for a block
router.get("/:blockName/varieties", async (req, res) => {
  const blockName = req.params.blockName;

  try {
    // Replace this with your logic to fetch varieties from the database
    const varieties = await VarietyModel.find({ blockName: blockName });

    if (varieties.length === 0) {
      return res
        .status(404)
        .json({ message: "No varieties found for this block" });
    }

    res.json(varieties);
  } catch (error) {
    res.status(500).json({ message: "Error fetching varieties" });
  }
});

module.exports = router;
