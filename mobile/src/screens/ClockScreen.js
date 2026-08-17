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
  timezone: "Africa/Johannesburg",
};

export default function ClockScreen({ offlineQueue }) {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const clockState = useAsyncData(() => api.getClockData(), []);

  async function submit(kind) {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const result = kind === "in" ? await api.clockIn(form) : await api.clockOut(form);
      setFeedback({ type: "success", message: result.message });
      clockState.refresh();
      await offlineQueue.refreshQueueCount();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  const records = Array.isArray(clockState.data) ? clockState.data : [];

  return (
    <ScreenScroll refreshing={clockState.loading} onRefresh={clockState.refresh}>
      <SectionCard
        title="Daily clock"
        subtitle="Clock in and out for hourly attendance tracking."
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
          label="Timezone"
          value={form.timezone}
          onChangeText={(value) => setForm((current) => ({ ...current, timezone: value }))}
          placeholder="Africa/Johannesburg"
        />
        <View className="gap-2.5">
          <ActionButton
            label={submitting ? "Working..." : "Clock in"}
            onPress={() => submit("in")}
            disabled={submitting}
          />
          <ActionButton
            label={submitting ? "Working..." : "Clock out"}
            tone="secondary"
            onPress={() => submit("out")}
            disabled={submitting}
          />
        </View>
        <FeedbackBanner type={feedback.type === "error" ? "error" : "success"} message={feedback.message} />
      </SectionCard>

      <SectionCard
        title="Recent clock records"
        subtitle="Worker attendance overview."
      >
        {clockState.loading && !clockState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          records.slice(0, 8).map((worker) => (
            <View key={worker._id || worker.workerID} className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
              <Text className="text-gray-900 text-[15px] font-extrabold">{worker.workerName}</Text>
              <Text className="mt-1 text-gray-400 text-[13px]">
                ID {worker.workerID} • Sessions {worker.clockIns?.length || 0}
              </Text>
            </View>
          ))
        )}
        {!records.length && !clockState.loading ? (
          <Text className="text-gray-400 text-sm">No clock records returned yet.</Text>
        ) : null}
        <FeedbackBanner type="error" message={clockState.error} />
      </SectionCard>
    </ScreenScroll>
  );
}
