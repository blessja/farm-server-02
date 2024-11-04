const mongoose = require("mongoose");

const varietySchema = new mongoose.Schema({
  blockName: { type: String, required: true },
  varietyName: { type: String, required: true },
});

const Variety = mongoose.model("Variety", varietySchema);

module.exports = Variety;
