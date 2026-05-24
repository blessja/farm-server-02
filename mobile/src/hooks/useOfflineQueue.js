import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "../api/client";
import {
  clearQueuedActions,
  flushQueuedActions,
  getQueuedActions,
  getQueuedActionsCount,
  removeQueuedAction,
  retryQueuedAction,
  updateQueuedAction,
} from "../storage/offlineQueue";

export function useOfflineQueue() {
  const [queueCount, setQueueCount] = useState(0);
  const [lastSyncMessage, setLastSyncMessage] = useState("");
  const [queueItems, setQueueItems] = useState([]);

  const refreshQueueCount = useCallback(async () => {
    const count = await getQueuedActionsCount();
    setQueueCount(count);
  }, []);

  const refreshQueueItems = useCallback(async () => {
    const items = await getQueuedActions();
    setQueueItems(items);
  }, []);

  const refreshQueue = useCallback(async () => {
    await Promise.all([refreshQueueCount(), refreshQueueItems()]);
  }, [refreshQueueCount, refreshQueueItems]);

  const syncQueue = useCallback(async () => {
    const result = await flushQueuedActions((action) =>
      api.replayQueuedAction(action)
    );

    if (result.flushed > 0) {
      setLastSyncMessage(
        `Synced ${result.flushed} queued action${result.flushed === 1 ? "" : "s"}.`
      );
    } else if (result.remaining > 0) {
      setLastSyncMessage(
        `${result.remaining} action${result.remaining === 1 ? "" : "s"} still waiting for connection.`
      );
    } else {
      setLastSyncMessage("Queue is up to date.");
    }

    await refreshQueue();
    return result;
  }, [refreshQueue]);

  const retryAction = useCallback(
    async (actionId) => {
      const result = await retryQueuedAction(actionId, (action) =>
        api.replayQueuedAction(action)
      );
      setLastSyncMessage("Queued action synced successfully.");
      await refreshQueue();
      return result;
    },
    [refreshQueue]
  );

  const removeAction = useCallback(
    async (actionId) => {
      await removeQueuedAction(actionId);
      setLastSyncMessage("Queued action removed.");
      await refreshQueue();
    },
    [refreshQueue]
  );

  const clearQueue = useCallback(async () => {
    await clearQueuedActions();
    setLastSyncMessage("Offline queue cleared.");
    await refreshQueue();
  }, [refreshQueue]);

  const updateAction = useCallback(
    async (actionId, updater) => {
      await updateQueuedAction(actionId, updater);
      setLastSyncMessage("Queued action updated.");
      await refreshQueue();
    },
    [refreshQueue]
  );

  useEffect(() => {
    refreshQueue();
    syncQueue();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncQueue();
      }
    });

    return () => subscription.remove();
  }, [refreshQueue, syncQueue]);

  return {
    queueCount,
    queueItems,
    lastSyncMessage,
    refreshQueueCount,
    refreshQueueItems,
    refreshQueue,
    syncQueue,
    retryAction,
    removeAction,
    clearQueue,
    updateAction,
  };
}
