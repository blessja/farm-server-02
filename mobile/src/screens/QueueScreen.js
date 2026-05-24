import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import LabeledInput from "../components/LabeledInput";

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isConflictItem(item) {
  const message = `${item.lastError || ""} ${item.lastPayload?.message || ""}`.toLowerCase();
  return (
    item.lastStatus === 409 ||
    item.lastStatus === 404 ||
    item.lastStatus === 400 ||
    message.includes("conflict") ||
    message.includes("already") ||
    message.includes("not found") ||
    message.includes("invalid")
  );
}

function stringifyValue(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value);
}

function parseEditedValue(originalValue, textValue) {
  if (typeof originalValue === "boolean") {
    return textValue.trim().toLowerCase() === "true";
  }
  if (typeof originalValue === "number") {
    if (textValue.trim() === "") return "";
    const parsed = Number(textValue);
    return Number.isNaN(parsed) ? originalValue : parsed;
  }
  return textValue;
}

export default function QueueScreen({ offlineQueue }) {
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [resolverItem, setResolverItem] = useState(null);
  const [resolverValues, setResolverValues] = useState({});
  const [resolverBusy, setResolverBusy] = useState(false);

  const conflictCount = useMemo(
    () => offlineQueue.queueItems.filter(isConflictItem).length,
    [offlineQueue.queueItems]
  );

  function openResolver(item) {
    const nextValues = {};
    Object.entries(item.body || {}).forEach(([key, value]) => {
      nextValues[key] = stringifyValue(value);
    });
    setResolverValues(nextValues);
    setResolverItem(item);
  }

  function closeResolver() {
    setResolverItem(null);
    setResolverValues({});
    setResolverBusy(false);
  }

  async function handleRetry(actionId) {
    setBusyId(actionId);
    setFeedback({ type: "info", message: "" });
    try {
      await offlineQueue.retryAction(actionId);
      setFeedback({ type: "success", message: "Queued action synced." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setBusyId("");
    }
  }

  async function handleRemove(actionId) {
    setBusyId(actionId);
    setFeedback({ type: "info", message: "" });
    try {
      await offlineQueue.removeAction(actionId);
      setFeedback({ type: "success", message: "Queued action removed." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setBusyId("");
    }
  }

  async function handleClear() {
    setBusyId("all");
    setFeedback({ type: "info", message: "" });
    try {
      await offlineQueue.clearQueue();
      setFeedback({ type: "success", message: "Offline queue cleared." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setBusyId("");
    }
  }

  async function handleResolverSaveAndRetry() {
    if (!resolverItem) return;

    setResolverBusy(true);
    setFeedback({ type: "info", message: "" });

    try {
      const originalBody = resolverItem.body || {};
      const nextBody = {};

      Object.keys(originalBody).forEach((key) => {
        nextBody[key] = parseEditedValue(originalBody[key], resolverValues[key] || "");
      });

      await offlineQueue.updateAction(resolverItem.id, {
        body: nextBody,
        lastError: null,
        lastStatus: null,
        lastPayload: null,
      });

      await offlineQueue.retryAction(resolverItem.id);
      setFeedback({ type: "success", message: "Conflict resolved and action synced." });
      closeResolver();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
      setResolverBusy(false);
    }
  }

  async function handleAllowMultipleWorkers() {
    if (!resolverItem) return;

    setResolverBusy(true);
    try {
      await offlineQueue.updateAction(resolverItem.id, {
        body: {
          ...(resolverItem.body || {}),
          allowMultipleWorkers: true,
        },
        lastError: null,
        lastStatus: null,
        lastPayload: null,
      });

      await offlineQueue.refreshQueue();
      setResolverValues((current) => ({
        ...current,
        allowMultipleWorkers: "true",
      }));
      setFeedback({
        type: "success",
        message: "Override applied. You can retry the action now.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setResolverBusy(false);
    }
  }

  return (
    <>
      <ScreenScroll refreshing={false} onRefresh={offlineQueue.refreshQueue}>
      <SectionCard
        title="Supervisor queue"
        subtitle="Inspect locally queued actions, retry one item immediately, or resolve field conflicts before they sync."
      >
        <View style={styles.topRow}>
          <Text style={styles.count}>{offlineQueue.queueCount} queued</Text>
          <Text style={styles.conflictCount}>
            {conflictCount} need supervisor review
          </Text>
          <View style={styles.topActions}>
            <ActionButton
              label="Sync all"
              onPress={offlineQueue.syncQueue}
              disabled={busyId === "all"}
            />
            <ActionButton
              label="Clear all"
              tone="secondary"
              onPress={handleClear}
              disabled={busyId === "all" || offlineQueue.queueCount === 0}
            />
          </View>
        </View>
        <Text style={styles.syncNote}>
          {offlineQueue.lastSyncMessage || "Queued actions are waiting for retry."}
        </Text>
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>

      <SectionCard
        title="Queued items"
        subtitle="Each entry stores the endpoint, payload, attempt count, and latest retry error."
      >
        {!offlineQueue.queueItems.length ? (
          <Text style={styles.empty}>No offline actions are waiting.</Text>
        ) : null}

        {offlineQueue.queueItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <Text style={styles.itemTitle}>{item.queueLabel || item.path}</Text>
            <Text style={styles.meta}>
              {item.method || "POST"} {item.path}
            </Text>
            <Text style={styles.meta}>Queued: {formatTimestamp(item.createdAt)}</Text>
            <Text style={styles.meta}>Attempts: {item.attempts || 0}</Text>
            {item.lastStatus ? (
              <Text style={styles.meta}>Last status: {item.lastStatus}</Text>
            ) : null}
            {item.lastError ? (
              <Text style={styles.errorText}>Last error: {item.lastError}</Text>
            ) : null}
            {item.lastPayload?.message ? (
              <Text style={styles.errorText}>
                Backend message: {item.lastPayload.message}
              </Text>
            ) : null}
            <View style={styles.payloadBox}>
              <Text style={styles.payloadText}>
                {JSON.stringify(item.body || {}, null, 2)}
              </Text>
            </View>
            <View style={styles.itemActions}>
              <ActionButton
                label={busyId === item.id ? "Retrying..." : "Retry"}
                onPress={() => handleRetry(item.id)}
                disabled={busyId === item.id}
              />
              {isConflictItem(item) ? (
                <ActionButton
                  label="Resolve conflict"
                  tone="secondary"
                  onPress={() => openResolver(item)}
                  disabled={busyId === item.id}
                />
              ) : null}
              <ActionButton
                label="Remove"
                tone="secondary"
                onPress={() => handleRemove(item.id)}
                disabled={busyId === item.id}
              />
            </View>
          </View>
        ))}

        {busyId === "all" ? <ActivityIndicator color="#294d39" /> : null}
      </SectionCard>
      </ScreenScroll>

      <Modal visible={Boolean(resolverItem)} animationType="slide">
        <View style={styles.modalShell}>
          <Text style={styles.modalTitle}>Resolve queued conflict</Text>
          <Text style={styles.modalSubtitle}>
            Update the queued payload to match current server state, then retry it.
          </Text>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {resolverItem?.lastPayload?.message ? (
              <FeedbackBanner type="error" message={resolverItem.lastPayload.message} />
            ) : null}

            {Object.entries(resolverItem?.body || {}).map(([key, originalValue]) => (
              <LabeledInput
                key={key}
                label={key}
                value={resolverValues[key] || ""}
                onChangeText={(value) =>
                  setResolverValues((current) => ({ ...current, [key]: value }))
                }
                placeholder={String(originalValue ?? "")}
                autoCapitalize="none"
                keyboardType={typeof originalValue === "number" ? "numeric" : "default"}
              />
            ))}

            {resolverItem?.path === "/api/checkin" ? (
              <ActionButton
                label={resolverBusy ? "Applying..." : "Allow multiple workers"}
                tone="secondary"
                onPress={handleAllowMultipleWorkers}
                disabled={resolverBusy}
              />
            ) : null}

            <View style={styles.modalActions}>
              <ActionButton
                label={resolverBusy ? "Saving..." : "Save and retry"}
                onPress={handleResolverSaveAndRetry}
                disabled={resolverBusy}
              />
              <ActionButton
                label="Cancel"
                tone="secondary"
                onPress={closeResolver}
                disabled={resolverBusy}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topRow: {
    gap: 12,
  },
  count: {
    color: "#203428",
    fontSize: 18,
    fontWeight: "800",
  },
  conflictCount: {
    color: "#7b2518",
    fontSize: 13,
    fontWeight: "700",
  },
  topActions: {
    gap: 10,
  },
  syncNote: {
    color: "#425248",
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    color: "#6a6a61",
    fontSize: 14,
  },
  itemCard: {
    borderRadius: 18,
    backgroundColor: "#f6ecd9",
    padding: 14,
    gap: 8,
  },
  itemTitle: {
    color: "#203428",
    fontSize: 15,
    fontWeight: "800",
  },
  meta: {
    color: "#5f665c",
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: "#7b2518",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  payloadBox: {
    borderRadius: 14,
    backgroundColor: "#fffaf1",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2d4bc",
  },
  payloadText: {
    color: "#324238",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Courier",
  },
  itemActions: {
    gap: 10,
  },
  modalShell: {
    flex: 1,
    backgroundColor: "#f4efe3",
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  modalTitle: {
    color: "#1d3828",
    fontSize: 24,
    fontWeight: "800",
  },
  modalSubtitle: {
    marginTop: 8,
    color: "#4f5d54",
    fontSize: 14,
    lineHeight: 20,
  },
  modalContent: {
    paddingTop: 18,
    paddingBottom: 32,
    gap: 12,
  },
  modalActions: {
    gap: 10,
    marginTop: 6,
  },
});
