// models/stockModel.js
const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema({
  rowId: { type: mongoose.Schema.Types.ObjectId, ref: "Row", required: true },
  stock_number: { type: Number, required: true }, // e.g., 1, 2, ..., 36
  bunches: [{ type: mongoose.Schema.Types.ObjectId, ref: "Bunch" }],
});

module.exports = mongoose.model("Stock", stockSchema);
