const mongoose = require("mongoose");
const rowSchema = require("./Row").schema;

const farmSchema = new mongoose.Schema({
  block_name: { type: String, required: true },
  variety: { type: String, required: true },
  year_planted: { type: Number, required: true },
  rootstock: { type: String, required: true },
  total_stocks: { type: Number, required: true },
  total_rows: { type: Number, required: true },
  size_ha: { type: Number, required: true },
  rows: [rowSchema],
});

const Farm = mongoose.model("Farm", farmSchema);

module.exports = Farm;
