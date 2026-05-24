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
        subtitle="Maps directly to the backend `clockin` and `clockout` endpoints."
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
          label="Timezone"
          value={form.timezone}
          onChangeText={(value) => setForm((current) => ({ ...current, timezone: value }))}
          placeholder="Africa/Johannesburg"
        />
        <View style={styles.actions}>
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
        subtitle="Useful for an admin overview or supervisor screen."
      >
        {clockState.loading && !clockState.data ? (
          <ActivityIndicator color="#294d39" />
        ) : (
          records.slice(0, 8).map((worker) => (
            <View key={worker._id || worker.workerID} style={styles.record}>
              <Text style={styles.recordName}>{worker.workerName}</Text>
              <Text style={styles.recordMeta}>
                ID {worker.workerID} • Sessions {worker.clockIns?.length || 0}
              </Text>
            </View>
          ))
        )}
        {!records.length && !clockState.loading ? (
          <Text style={styles.empty}>No clock records returned yet.</Text>
        ) : null}
        <FeedbackBanner type="error" message={clockState.error} />
      </SectionCard>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
  },
  record: {
    borderRadius: 16,
    backgroundColor: "#f6ecd9",
    padding: 14,
  },
  recordName: {
    color: "#203428",
    fontSize: 15,
    fontWeight: "800",
  },
  recordMeta: {
    marginTop: 4,
    color: "#6a6a61",
    fontSize: 13,
  },
  empty: {
    color: "#6a6a61",
    fontSize: 14,
  },
});
