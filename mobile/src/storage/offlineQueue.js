import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_QUEUE_KEY = "farm-mobile-offline-queue";

// Actions older than this are stale replays (the old "silent check-in"
// double-counting came from exactly this kind of lingering action), so they are
// dropped instead of replayed against a row that has likely moved on.
const QUEUE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

function isStaleAction(action, now) {
  const createdAt = action.createdAt ? Date.parse(action.createdAt) : now;
  return !Number.isNaN(createdAt) && now - createdAt > QUEUE_MAX_AGE_MS;
}

// Canonical, key-sorted serialization of a body (ignoring ephemeral fields) so
// two identical pending writes for the same worker/row are recognised as one.
function stableBody(body) {
  if (!body || typeof body !== "object") {
    return JSON.stringify(body == null ? {} : body);
  }
  const sorted = {};
  for (const key of Object.keys(body).sort()) {
    if (key === "requestId") continue;
    const value = body[key];
    sorted[key] = value && typeof value === "object" ? stableBody(value) : value;
  }
  return JSON.stringify(sorted);
}

function isDuplicateAction(a, b) {
  return (
    a.method === b.method &&
    a.path === b.path &&
    stableBody(a.body) === stableBody(b.body)
  );
}

async function readQueue() {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueuedActions() {
  return readQueue();
}

export async function getQueuedActionsCount() {
  const queue = await readQueue();
  return queue.length;
}

export async function enqueueAction(action) {
  const now = Date.now();
  const queue = await readQueue();
  const nextQueue = queue.filter(
    (item) => item.id !== action.id && !isStaleAction(item, now)
  );
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date(now).toISOString(),
    attempts: 0,
    ...action,
  };

  // Latest intent wins: if the same write is already pending, replace it rather
  // than piling up identical replays for the same worker/row/job.
  const withoutDuplicate = nextQueue.filter(
    (item) => !isDuplicateAction(item, entry)
  );
  withoutDuplicate.push(entry);
  await writeQueue(withoutDuplicate);
  return entry;
}

export async function removeQueuedAction(actionId) {
  const queue = await readQueue();
  const nextQueue = queue.filter((action) => action.id !== actionId);
  await writeQueue(nextQueue);
  return nextQueue;
}

export async function clearQueuedActions() {
  await writeQueue([]);
  return [];
}

export async function retryQueuedAction(actionId, executor) {
  const queue = await readQueue();
  const action = queue.find((item) => item.id === actionId);

  if (!action) {
    throw new Error("Queued action not found.");
  }

  try {
    await executor(action);
    const nextQueue = queue.filter((item) => item.id !== actionId);
    await writeQueue(nextQueue);
    return { status: "flushed", actionId, remaining: nextQueue.length };
  } catch (error) {
    const nextQueue = queue.map((item) =>
      item.id === actionId
        ? {
            ...item,
            attempts: (item.attempts || 0) + 1,
            lastStatus: error.status || null,
            lastError: error.message || "Retry failed",
            lastPayload:
              typeof error.payload === "undefined" ? null : error.payload,
          }
        : item
    );
    await writeQueue(nextQueue);
    throw error;
  }
}

export async function updateQueuedAction(actionId, updater) {
  const queue = await readQueue();
  let updatedAction = null;

  const nextQueue = queue.map((item) => {
    if (item.id !== actionId) {
      return item;
    }

    updatedAction = {
      ...item,
      ...updater,
    };

    return updatedAction;
  });

  await writeQueue(nextQueue);
  return updatedAction;
}

export async function flushQueuedActions(executor) {
  const now = Date.now();
  const queue = await readQueue();
  if (!queue.length) {
    return { flushed: 0, remaining: 0, pruned: 0, results: [] };
  }

  const remaining = [];
  const results = [];
  let pruned = 0;

  for (const action of queue) {
    if (isStaleAction(action, now)) {
      pruned += 1;
      results.push({ id: action.id, status: "pruned" });
      continue;
    }

    try {
      await executor(action);
      results.push({ id: action.id, status: "flushed" });
    } catch (error) {
      remaining.push({
        ...action,
        attempts: (action.attempts || 0) + 1,
        lastStatus: error.status || null,
        lastError: error.message || "Retry failed",
        lastPayload:
          typeof error.payload === "undefined" ? null : error.payload,
      });
      results.push({ id: action.id, status: "kept", error: error.message });
    }
  }

  await writeQueue(remaining);
  return {
    flushed: results.filter((item) => item.status === "flushed").length,
    remaining: remaining.length,
    pruned,
    results,
  };
}
