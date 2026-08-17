import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
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
          subtitle="Inspect locally queued actions, retry, or resolve conflicts before they sync."
        >
          <View className="gap-3">
            <Text className="text-gray-900 text-lg font-extrabold">
              {offlineQueue.queueCount} queued
            </Text>
            <Text className="text-red-600 text-[13px] font-bold">
              {conflictCount} need supervisor review
            </Text>
            <View className="gap-2.5">
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
          <Text className="text-gray-500 text-sm leading-5">
            {offlineQueue.lastSyncMessage || "Queued actions are waiting for retry."}
          </Text>
          <FeedbackBanner
            type={feedback.type === "error" ? "error" : "success"}
            message={feedback.message}
          />
        </SectionCard>

        <SectionCard
          title="Queued items"
          subtitle="Each entry stores the endpoint, payload, attempt count, and last retry error."
        >
          {!offlineQueue.queueItems.length ? (
            <Text className="text-gray-400 text-sm">No offline actions are waiting.</Text>
          ) : null}

          {offlineQueue.queueItems.map((item) => (
            <View key={item.id} className="rounded-2xl bg-gray-50 border border-gray-100 p-3.5 gap-2">
              <Text className="text-gray-900 text-[15px] font-extrabold">
                {item.queueLabel || item.path}
              </Text>
              <Text className="text-gray-400 text-[13px] leading-5">
                {item.method || "POST"} {item.path}
              </Text>
              <Text className="text-gray-400 text-[13px] leading-5">
                Queued: {formatTimestamp(item.createdAt)}
              </Text>
              <Text className="text-gray-400 text-[13px] leading-5">
                Attempts: {item.attempts || 0}
              </Text>
              {item.lastStatus ? (
                <Text className="text-gray-400 text-[13px] leading-5">
                  Last status: {item.lastStatus}
                </Text>
              ) : null}
              {item.lastError ? (
                <Text className="text-red-600 text-[13px] leading-5 font-bold">
                  Last error: {item.lastError}
                </Text>
              ) : null}
              {item.lastPayload?.message ? (
                <Text className="text-red-600 text-[13px] leading-5 font-bold">
                  Backend message: {item.lastPayload.message}
                </Text>
              ) : null}
              <View className="rounded-xl bg-white p-3 border border-gray-100">
                <Text className="text-gray-600 text-xs leading-5 font-mono">
                  {JSON.stringify(item.body || {}, null, 2)}
                </Text>
              </View>
              <View className="gap-2.5">
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

          {busyId === "all" ? <ActivityIndicator color="#16a34a" /> : null}
        </SectionCard>
      </ScreenScroll>

      <Modal visible={Boolean(resolverItem)} animationType="slide">
        <View className="flex-1 bg-white pt-16 px-4 pb-6">
          <Text className="text-gray-900 text-2xl font-extrabold">Resolve queued conflict</Text>
          <Text className="mt-2 text-gray-400 text-sm leading-5">
            Update the queued payload to match current server state, then retry it.
          </Text>

          <ScrollView contentContainerStyle={{ paddingTop: 18, paddingBottom: 32, gap: 12 }}>
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

            <View className="gap-2.5 mt-1.5">
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
