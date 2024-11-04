const Block = require("../models/Block");

// get the blocks from the database
exports.getAllBlocks = async (req, res) => {
  try {
    const blocks = await Block.find({});
    res.json(blocks);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch blocks", error });
  }
};

// get a specific block by its name
exports.getBlockByName = async (req, res) => {
  const { blockName } = req.params;

  try {
    const block = await Block.findOne({ blockName });

    if (!block) {
      return res.status(404).json({ message: "Block not found" });
    }

    res.json(block);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
