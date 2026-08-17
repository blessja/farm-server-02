import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import InfoPill from "../components/InfoPill";
import FeedbackBanner from "../components/FeedbackBanner";
import ActionButton from "../components/ActionButton";
import { useAsyncData } from "../hooks/useAsyncData";

export default function DashboardScreen({ sharedState, offlineQueue }) {
  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
  });
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), []);

  const activeWorkers = Array.isArray(checkinsState.data)
    ? checkinsState.data.length
    : 0;
  const blockCount = Array.isArray(blocksState.data) ? blocksState.data.length : 0;

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
    </ScreenScroll>
  );
}
