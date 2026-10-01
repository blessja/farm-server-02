// utils/supervisorScope.js
//
// A worker "belongs to" a supervisor when a record of that worker's work was
// recorded by that supervisor. Records that count:
//
//   1. Worker.supervisor                                  (last recorder)
//   2. Worker.blocks[].rows[].checkout_events[].recorded_by
//   3. Worker.blocks[].rows[].backdated_by
//   4. PieceworkWorker.supervisor                         (fast piecework)
//   5. Block.rows[].active_jobs[].recorded_by             (still checked in)
//   6. Block.rows[].checkin_recorded_by                   (legacy check-ins)
//   7. WorkerDayHours.recordedBy                          (hours entered)
//
// Matching is case-insensitive because supervisor names are typed by hand and
// historic rows were written before names were normalised.
const { authEnabled, normalizeSupervisorName } = require("./mobileAuth");

const SCOPE_ALL = "all";
const SCOPE_SUPERVISOR = "supervisor";
const SCOPE_BLOCKED = "blocked";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(supervisorName) {
  return new RegExp(`^${escapeRegExp(supervisorName)}$`, "i");
}

function sameName(left, right) {
  return (
    normalizeSupervisorName(left).toLowerCase() ===
    normalizeSupervisorName(right).toLowerCase()
  );
}

// Decide what the signed-in supervisor is allowed to see. Admins are
// unrestricted. Anything without a usable supervisor identity is blocked, which
// covers MOBILE_AUTH_ENABLED=false as well as a request that somehow skipped
// the auth middleware.
function resolveScope(req) {
  if (!authEnabled()) {
    return { scope: SCOPE_BLOCKED, supervisorName: "", reason: "auth-disabled" };
  }

  const auth = req?.mobileAuth || null;
  const supervisorName = normalizeSupervisorName(auth?.supervisorName || "");

  if (!supervisorName) {
    return { scope: SCOPE_BLOCKED, supervisorName: "", reason: "no-identity" };
  }

  if (auth?.isAdmin === true) {
    return { scope: SCOPE_ALL, supervisorName, isAdmin: true };
  }

  return { scope: SCOPE_SUPERVISOR, supervisorName, isAdmin: false };
}

// Send the standard 403 for endpoints that cannot answer without a supervisor
// identity. Returns true when the response was already sent.
function rejectBlockedScope(res, scope) {
  return res.status(403).json({
    message:
      scope.reason === "auth-disabled"
        ? "Sign in with a supervisor account to view this."
        : "A supervisor sign-in is required to view this.",
    requiresSupervisor: true,
    reason: scope.reason,
  });
}

// Worker documents (regular piecework) recorded by this supervisor.
function workerScopeFilter(supervisorName) {
  const pattern = namePattern(supervisorName);
  return {
    $or: [
      { supervisor: pattern },
      { "blocks.rows.checkout_events.recorded_by": pattern },
      { "blocks.rows.backdated_by": pattern },
    ],
  };
}

function pieceworkScopeFilter(supervisorName) {
  return { supervisor: namePattern(supervisorName) };
}

function blockScopeFilter(supervisorName) {
  const pattern = namePattern(supervisorName);
  return {
    $or: [
      { "rows.active_jobs.recorded_by": pattern },
      { "rows.checkin_recorded_by": pattern },
    ],
  };
}

function dayHoursScopeFilter(supervisorName) {
  return { recordedBy: namePattern(supervisorName) };
}

function collectWorkerIDs(target, docs, field = "workerID") {
  (docs || []).forEach((doc) => {
    const id = typeof doc?.[field] === "string" ? doc[field].trim() : "";
    if (id) target.add(id);
  });
  return target;
}

// The full crew of a supervisor: every worker ID with at least one record
// recorded by them, across all five sources. Required lazily so that requiring
// this module never pulls the models in (the model files require nothing here).
let modelCache = null;
function getModels() {
  if (!modelCache) {
    modelCache = {
      Worker: require("../models/Worker"),
      PieceworkWorker: require("../models/PieceworkWorker"),
      Block: require("../models/Block"),
      WorkerDayHours: require("../models/WorkerDayHours"),
    };
  }
  return modelCache;
}

async function visibleWorkerIDs(supervisorName) {
  const { Worker, PieceworkWorker, Block, WorkerDayHours } = getModels();
  const ids = new Set();

  const [workers, pieceworkers, blocks, dayHours] = await Promise.all([
    Worker.find(workerScopeFilter(supervisorName), { workerID: 1 }).lean(),
    PieceworkWorker.find(pieceworkScopeFilter(supervisorName), {
      workerID: 1,
    }).lean(),
    Block.find(blockScopeFilter(supervisorName), {
      "rows.active_jobs.worker_id": 1,
      "rows.active_jobs.recorded_by": 1,
      "rows.worker_id": 1,
      "rows.checkin_recorded_by": 1,
    }).lean(),
    WorkerDayHours.find(dayHoursScopeFilter(supervisorName), {
      workerID: 1,
    }).lean(),
  ]);

  collectWorkerIDs(ids, workers);
  collectWorkerIDs(ids, pieceworkers);
  collectWorkerIDs(ids, dayHours);

  // Workers still checked in. The block filter only tells us that *some* row in
  // the block was recorded by this supervisor, and a block routinely holds
  // several supervisors' workers at once, so each worker ID is admitted only
  // when its own recorded_by matches. Comparing the string here rather than
  // filtering in Mongo keeps the two paths case-insensitive in the same way.
  blocks.forEach((block) => {
    (block.rows || []).forEach((row) => {
      (row.active_jobs || []).forEach((job) => {
        if (!sameName(job?.recorded_by, supervisorName)) return;
        const id = typeof job?.worker_id === "string" ? job.worker_id.trim() : "";
        if (id) ids.add(id);
      });

      if (!sameName(row?.checkin_recorded_by, supervisorName)) return;
      const legacyId =
        typeof row?.worker_id === "string" ? row.worker_id.trim() : "";
      if (legacyId) ids.add(legacyId);
    });
  });

  return ids;
}

module.exports = {
  SCOPE_ALL,
  SCOPE_SUPERVISOR,
  SCOPE_BLOCKED,
  resolveScope,
  rejectBlockedScope,
  sameName,
  workerScopeFilter,
  pieceworkScopeFilter,
  blockScopeFilter,
  dayHoursScopeFilter,
  collectWorkerIDs,
  visibleWorkerIDs,
};
