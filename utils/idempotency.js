// utils/idempotency.js
//
// Wraps an Express route handler so that requests carrying a requestId in the
// body are executed at most once. Duplicate deliveries (the mobile app queues
// writes that time out and re-sends them later) are answered with the original
// success response instead of re-running the action. This stops a stale /
// silently replayed check-in from moving a worker or auto-checking them out of
// a row they already left.
//
// Only success responses (< 400) are cached and replayed; error responses drop
// the claim so the same action can be legitimately retried after the problem is
// fixed. A claim left mid-flight by a crashed request is stolen after 15s.

const ProcessedRequest = require("../models/ProcessedRequest");

const CLAIM_TTL_MS = 15000;
const POLL_LIMIT_MS = 10000;
const MAX_KEY_LENGTH = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestKey(req) {
  const raw = req && req.body && req.body.requestId;
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key ? key.slice(0, MAX_KEY_LENGTH) : null;
}

async function waitForCompletion(key) {
  const deadline = Date.now() + POLL_LIMIT_MS;
  while (Date.now() < deadline) {
    const doc = await ProcessedRequest.findOne({ key });
    if (doc && doc.state === "done") return doc;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(250, remaining));
  }
  return null;
}

module.exports.idempotent = function idempotent(handler) {
  return async function (req, res) {
    const key = requestKey(req);
    if (!key) return handler(req, res);

    let existing;
    try {
      existing = await ProcessedRequest.findOne({ key });
    } catch (error) {
      return res.status(500).send({ message: "Server error", error: error.message });
    }

    if (existing && existing.state === "done") {
      return res.status(existing.httpStatus || 200).send(existing.body);
    }

    const claimIsStale =
      existing &&
      existing.claimedAt &&
      Date.now() - new Date(existing.claimedAt).getTime() >= CLAIM_TTL_MS;

    if (existing && existing.state === "processing" && !claimIsStale) {
      const completed = await waitForCompletion(key);
      if (completed) {
        return res.status(completed.httpStatus || 200).send(completed.body);
      }
      return res
        .status(409)
        .send({ message: "This request is still being processed. Please try again in a moment." });
    }

    // We own the key: it was never seen, or the previous claim is stale.
    try {
      await ProcessedRequest.findOneAndUpdate(
        { key },
        {
          $set: { state: "processing", claimedAt: new Date() },
          $setOnInsert: { key, createdAt: new Date() },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      return res.status(500).send({ message: "Server error", error: error.message });
    }

    const capture = (original) => {
      return function (body) {
        const statusCode = res.statusCode || 200;
        const result = original.call(this, body);
        if (statusCode < 400) {
          ProcessedRequest.updateOne(
            { key },
            { $set: { state: "done", httpStatus: statusCode, body } }
          ).catch(() => {});
        } else {
          ProcessedRequest.deleteOne({ key }).catch(() => {});
        }
        return result;
      };
    };

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    res.send = capture(originalSend);
    res.json = capture(originalJson);

    try {
      await handler(req, res);
    } catch (error) {
      ProcessedRequest.deleteOne({ key }).catch(() => {});
      throw error;
    }
  };
};