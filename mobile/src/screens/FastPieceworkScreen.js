import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";
import ScannerInput from "../components/ScannerInput";

const initialForm = {
  workerID: "",
  workerName: "",
  rowNumber: "",
  blockName: "",
  jobType: "LEAF PICKING",
};

export default function FastPieceworkScreen({ sharedState, offlineQueue }) {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const totalsState = useAsyncData(() => api.getFastTotals(), []);

  async function handleSubmit() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...form,
        blockName: form.blockName || sharedState.selectedBlock,
        rowNumber: form.rowNumber || sharedState.selectedRow,
      };
      const result = await api.fastCheckin(payload);
      setFeedback({ type: "success", message: result.message });
      totalsState.refresh();
      await offlineQueue.refreshQueueCount();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  const totals = Array.isArray(totalsState.data?.workers)
    ? totalsState.data.workers
    : Array.isArray(totalsState.data)
      ? totalsState.data
      : [];

  return (
    <ScreenScroll refreshing={totalsState.loading} onRefresh={totalsState.refresh}>
      <SectionCard
        title="Fast piecework"
        subtitle="Built for single-scan style jobs such as leaf picking and sucker removal."
      >
        <ScannerInput
          label="Worker ID"
          value={form.workerID}
          onChangeText={(value) => setForm((current) => ({ ...current, workerID: value }))}
          placeholder="e.g. 1024"
        />
        <LabeledInput
          label="Worker name"
          value={form.workerName}
          onChangeText={(value) => setForm((current) => ({ ...current, workerName: value }))}
          placeholder="Worker full name"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Job type"
          value={form.jobType}
          onChangeText={(value) => setForm((current) => ({ ...current, jobType: value }))}
          placeholder="LEAF PICKING"
          autoCapitalize="characters"
        />
        <LabeledInput
          label="Block override"
          value={form.blockName}
          onChangeText={(value) => setForm((current) => ({ ...current, blockName: value }))}
          placeholder="Uses selected block if blank"
        />
        <ScannerInput
          label="Row override"
          value={form.rowNumber}
          onChangeText={(value) => setForm((current) => ({ ...current, rowNumber: value }))}
          placeholder="Uses selected row if blank"
        />
        <ActionButton
          label={submitting ? "Submitting..." : "Submit fast piecework"}
          onPress={handleSubmit}
          disabled={submitting}
        />
        <FeedbackBanner type={feedback.type === "error" ? "error" : "success"} message={feedback.message} />
      </SectionCard>

      <SectionCard
        title="Fast totals"
        subtitle="Useful for the supervisor view and wage calculations."
      >
        {totalsState.loading && !totalsState.data ? (
          <ActivityIndicator color="#294d39" />
        ) : (
          totals.slice(0, 8).map((worker) => (
            <View key={worker.workerID} style={styles.totalCard}>
              <Text style={styles.workerName}>{worker.workerName}</Text>
              <Text style={styles.workerMeta}>
                ID {worker.workerID} • Vines {worker.totalVines || worker.piecework_stock_count || 0}
              </Text>
            </View>
          ))
        )}
        {!totals.length && !totalsState.loading ? (
          <Text style={styles.empty}>No fast piecework totals returned yet.</Text>
        ) : null}
        <FeedbackBanner type="error" message={totalsState.error} />
      </SectionCard>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  totalCard: {
    borderRadius: 16,
    backgroundColor: "#f6ecd9",
    padding: 14,
  },
  workerName: {
    color: "#203428",
    fontSize: 15,
    fontWeight: "800",
  },
  workerMeta: {
    marginTop: 4,
    color: "#6a6a61",
    fontSize: 13,
  },
  empty: {
    color: "#6a6a61",
    fontSize: 14,
  },
});
