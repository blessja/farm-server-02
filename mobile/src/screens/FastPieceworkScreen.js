import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";
import WorkerSuggestionInput from "../components/WorkerSuggestionInput";

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
  const totalsState = useAsyncData(() => api.getFastTotals(), [], {
    cacheKey: "fast-totals",
    staleTime: 5 * 60 * 1000,
  });

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
        subtitle="Single-scan jobs: leaf picking, sucker removal, shoot thinning, other."
      >
        <WorkerSuggestionInput
          label="Worker ID"
          workerID={form.workerID}
          workerName={form.workerName}
          onSelect={({ workerID, workerName }) =>
            setForm((current) => ({
              ...current,
              workerID,
              workerName: workerName || current.workerName,
            }))
          }
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
        <LabeledInput
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
        subtitle="Worker piecework summary for wage calculations."
      >
        {totalsState.loading && !totalsState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          totals.slice(0, 8).map((worker) => (
            <View key={worker.workerID} className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
              <Text className="text-gray-900 text-[15px] font-extrabold">{worker.workerName}</Text>
              <Text className="mt-1 text-gray-400 text-[13px]">
                ID {worker.workerID} • Vines {worker.totalVines || worker.piecework_stock_count || 0}
              </Text>
            </View>
          ))
        )}
        {!totals.length && !totalsState.loading ? (
          <Text className="text-gray-400 text-sm">No fast piecework totals returned yet.</Text>
        ) : null}
        <FeedbackBanner type="error" message={totalsState.error} />
      </SectionCard>
    </ScreenScroll>
  );
}
