import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import InfoPill from "../components/InfoPill";
import FeedbackBanner from "../components/FeedbackBanner";
import ActionButton from "../components/ActionButton";
import LabeledInput from "../components/LabeledInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { addServerWorker } from "../workers/workerRegistry";

export default function DashboardScreen({ sharedState, offlineQueue }) {
  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
    staleTime: 30 * 60 * 1000,
  });
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins",
    staleTime: 5 * 60 * 1000,
  });

  const [adminForm, setAdminForm] = useState({ workerID: "", workerName: "" });
  const [adminFeedback, setAdminFeedback] = useState({ type: "info", message: "" });
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminModalVisible, setAdminModalVisible] = useState(false);

  function openAdminModal() {
    setAdminForm({ workerID: "", workerName: "" });
    setAdminFeedback({ type: "info", message: "" });
    setAdminModalVisible(true);
  }

  function closeAdminModal() {
    setAdminModalVisible(false);
    setAdminFeedback({ type: "info", message: "" });
  }

  const activeWorkers = Array.isArray(checkinsState.data)
    ? checkinsState.data.length
    : 0;
  const blockCount = Array.isArray(blocksState.data) ? blocksState.data.length : 0;

  async function handleAddWorker() {
    const workerID = adminForm.workerID.trim();
    const workerName = adminForm.workerName.trim();
    if (!workerID || !workerName) {
      setAdminFeedback({
        type: "error",
        message: "Both worker ID and worker name are required.",
      });
      return;
    }

    setAdminSubmitting(true);
    setAdminFeedback({ type: "info", message: "" });

    try {
      const result = await api.addWorker({ workerID, workerName });
      addServerWorker({ workerID, workerName });
      setAdminFeedback({ type: "success", message: result.message });
      setAdminForm({ workerID: "", workerName: "" });
      offlineQueue?.refreshQueueCount?.();
    } catch (error) {
      setAdminFeedback({ type: "error", message: error.message });
    } finally {
      setAdminSubmitting(false);
    }
  }

  return (
    <ScreenScroll
      refreshing={blocksState.loading || checkinsState.loading}
      onRefresh={() => {
        blocksState.refresh();
        checkinsState.refresh();
      }}
    >
      <SectionCard
        title="Today at a glance"
        subtitle="Live counts pulled from the backend."
      >
        {(blocksState.loading || checkinsState.loading) && !blocksState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          <View className="flex-row flex-wrap gap-2.5">
            <InfoPill label="Blocks" value={`${blockCount}`} />
            <InfoPill label="Checked in" value={`${activeWorkers}`} />
            <InfoPill
              label="Selected"
              value={
                sharedState.selectedBlock
                  ? `${sharedState.selectedBlock}/${sharedState.selectedRow || "-"}`
                  : "None"
              }
            />
          </View>
        )}
        <FeedbackBanner type="error" message={blocksState.error || checkinsState.error} />
      </SectionCard>

      <SectionCard
        title="Offline sync"
        subtitle="Write actions are queued locally if the phone loses connection, then replayed when the app comes back online."
      >
        <View className="flex-row flex-wrap gap-2.5">
          <InfoPill label="Queued" value={`${offlineQueue.queueCount}`} />
        </View>
        <Text className="text-gray-600 text-sm leading-5">
          {offlineQueue.lastSyncMessage || "Queue will auto-sync when the app is reopened or comes back online."}
        </Text>
        <ActionButton label="Sync queued actions now" onPress={offlineQueue.syncQueue} />
      </SectionCard>

      <SectionCard
        title="Quick guide"
        subtitle="How to use the mobile app."
      >
        <Text className="text-gray-600 text-sm leading-6">
          1. Pick a block and row in the DayWork tab.{"\n"}
          2. Use DayWork for regular check-in and checkout.{"\n"}
          3. Use Clock for daily attendance and Fast for single-scan jobs.
        </Text>
      </SectionCard>

      <SectionCard
        title="Admin"
        subtitle="Add a new worker so they appear in the worker search and scanner suggestions."
      >
        <ActionButton label="Add worker" onPress={openAdminModal} />
      </SectionCard>

      <Modal visible={adminModalVisible} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <ScreenScroll refreshing={false}>
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-1">
                <Text className="text-gray-900 text-lg font-extrabold">Add worker</Text>
                <Text className="text-gray-400 text-[13px] leading-5 mt-0.5">
                  The worker will appear in the search and scanner suggestions.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                style={{ borderRadius: 12, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 10 }}
                onPress={closeAdminModal}
              >
                <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <SectionCard title="Worker details" subtitle="Both fields are required.">
              <LabeledInput
                label="Worker ID"
                value={adminForm.workerID}
                onChangeText={(value) =>
                  setAdminForm((current) => ({ ...current, workerID: value }))
                }
                placeholder="e.g. 1024"
                keyboardType="numeric"
              />
              <LabeledInput
                label="Worker name"
                value={adminForm.workerName}
                onChangeText={(value) =>
                  setAdminForm((current) => ({ ...current, workerName: value }))
                }
                placeholder="Surname First name"
                autoCapitalize="words"
              />
              <ActionButton
                label={adminSubmitting ? "Adding..." : "Add worker"}
                onPress={handleAddWorker}
                disabled={adminSubmitting}
              />
              <FeedbackBanner
                type={adminFeedback.type === "error" ? "error" : "success"}
                message={adminFeedback.message}
              />
            </SectionCard>
          </ScreenScroll>
        </SafeAreaView>
      </Modal>
    </ScreenScroll>
  );
}
