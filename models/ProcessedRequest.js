// models/ProcessedRequest.js
//
// Dedupe ledger for idempotent write endpoints. When a request carries a
// requestId, the server processes it once and records the success response
// keyed by that id. A duplicate delivery (e.g. the mobile app's offline queue
// re-sending a check-in after the first attempt timed out) receives the stored
// response without re-running the action.
const mongoose = require("mongoose");

const processedRequestSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  state: { type: String, enum: ["processing", "done"], default: "processing" },
  claimedAt: { type: Date, default: Date.now },
  httpStatus: { type: Number, default: null },
  body: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
});

processedRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

const ProcessedRequest = mongoose.model(
  "ProcessedRequest",
  processedRequestSchema
);

module.exports = ProcessedRequest;