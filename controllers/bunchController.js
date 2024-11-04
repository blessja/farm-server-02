const Bunch = require("../models/Bunch");
const Stock = require("../models/Stock");

// Get all bunches for a specific stock
exports.getBunchesForStock = async (req, res) => {
  try {
    const { stockId } = req.params;
    const bunches = await Bunch.find({ stockId });
    res.status(200).json(bunches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new bunch for a stock
exports.createBunch = async (req, res) => {
  try {
    const { stockId } = req.params;
    const { quantity } = req.body;

    const stock = await Stock.findById(stockId);
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const newBunch = new Bunch({
      stockId,
      quantity,
      status: "pending",
    });

    await newBunch.save();
    res.status(201).json(newBunch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a specific bunch
exports.updateBunch = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, status } = req.body;

    const bunch = await Bunch.findById(id);
    if (!bunch) {
      return res.status(404).json({ error: "Bunch not found" });
    }

    bunch.quantity = quantity || bunch.quantity;
    bunch.status = status || bunch.status;

    await bunch.save();
    res.status(200).json(bunch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a specific bunch
exports.deleteBunch = async (req, res) => {
  try {
    const { id } = req.params;
    const bunch = await Bunch.findByIdAndDelete(id);

    if (!bunch) {
      return res.status(404).json({ error: "Bunch not found" });
    }

    res.status(200).json({ message: "Bunch deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
