import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import InfoPill from "../components/InfoPill";
import FeedbackBanner from "../components/FeedbackBanner";
import ActionButton from "../components/ActionButton";
import { useAsyncData } from "../hooks/useAsyncData";
import { API_BASE_URL } from "../config/env";

export default function DashboardScreen({ sharedState, offlineQueue }) {
  const blocksState = useAsyncData(() => api.getBlocks(), []);
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
      {/* <SectionCard
        title="Backend connection"
        subtitle="Point the mobile app at your Express server using EXPO_PUBLIC_API_URL."
      >
        <InfoPill label="API" value={API_BASE_URL} />
      </SectionCard> */}

      <SectionCard
        title="Today at a glance"
        subtitle="Live counts pulled from the existing backend endpoints."
      >
        {(blocksState.loading || checkinsState.loading) && !blocksState.data ? (
          <ActivityIndicator color="#294d39" />
        ) : (
          <View style={styles.metrics}>
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
        subtitle="Write actions are queued locally if the phone loses connection, then replayed when the app becomes active again."
      >
        <View style={styles.metrics}>
          <InfoPill label="Queued" value={`${offlineQueue.queueCount}`} />
        </View>
        <Text style={styles.listItem}>
          {offlineQueue.lastSyncMessage || "Queue will auto-sync when the app is reopened or comes back online."}
        </Text>
        <ActionButton label="Sync queued actions now" onPress={offlineQueue.syncQueue} />
      </SectionCard>

      <SectionCard
        title="Suggested mobile flow"
        subtitle="A practical first release path for field teams."
      >
        <Text style={styles.listItem}>1. Pick a block and row in the `Blocks` tab.</Text>
        <Text style={styles.listItem}>
          2. Use `Rows` for regular check-in and checkout operations.
        </Text>
        <Text style={styles.listItem}>
          3. Use `Clock` for daily attendance and `Fast PW` for single-scan jobs.
        </Text>
      </SectionCard>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  listItem: {
    color: "#314238",
    fontSize: 14,
    lineHeight: 21,
  },
});
