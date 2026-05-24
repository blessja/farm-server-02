import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_QUEUE_KEY = "farm-mobile-offline-queue";

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
  const queue = await readQueue();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...action,
  };

  queue.push(entry);
  await writeQueue(queue);
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
  const queue = await readQueue();
  if (!queue.length) {
    return { flushed: 0, remaining: 0, results: [] };
  }

  const remaining = [];
  const results = [];

  for (const action of queue) {
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
    results,
  };
}
