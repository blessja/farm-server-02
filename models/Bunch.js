// models/bunchModel.js
const mongoose = require("mongoose");

const bunchSchema = new mongoose.Schema({
  stockId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Stock",
    required: true,
  },
  quantity: { type: Number, required: true },
  status: { type: String, enum: ["pending", "picked"], default: "pending" },
});

module.exports = mongoose.model("Bunch", bunchSchema);
