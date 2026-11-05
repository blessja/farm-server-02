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
import { useLanguage } from "../i18n";
import { setCache } from "../storage/cacheStorage";

const TIMEZONE = "Africa/Johannesburg";

function formatClockTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatClockDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

const initialForm = {
  workerID: "",
  workerName: "",
  timezone: "Africa/Johannesburg",
};

export default function ClockScreen({ offlineQueue }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const clockState = useAsyncData(() => api.getClockData(), [], {
    cacheKey: "clocks",
    staleTime: 5 * 60 * 1000,
  });

  async function performClock(kind, workerID, workerName) {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    const body = {
      workerID: workerID || form.workerID,
      workerName: workerName || form.workerName,
      timezone: form.timezone || TIMEZONE,
    };
    try {
      const result = kind === "in" ? await api.clockIn(body) : await api.clockOut(body);
      setFeedback({ type: "success", message: result.message });
      if (result.session) {
        const currentRecords = Array.isArray(clockState.data) ? clockState.data : [];
        const records = [...currentRecords];
        const recordIndex = records.findIndex(
          (record) => String(record.workerID) === String(body.workerID)
        );
        const record =
          recordIndex >= 0
            ? {
                ...records[recordIndex],
                workerName: body.workerName || records[recordIndex].workerName,
                clockIns: [...(records[recordIndex].clockIns || [])],
              }
            : {
                workerID: String(body.workerID),
                workerName: body.workerName,
                clockIns: [],
              };
        const sessionIndex = record.clockIns.findIndex(
          (session) => String(session._id) === String(result.session._id)
        );

        if (sessionIndex >= 0) record.clockIns[sessionIndex] = result.session;
        else record.clockIns.push(result.session);

        if (recordIndex >= 0) records[recordIndex] = record;
        else records.push(record);
        clockState.setData(records);
        void setCache("clocks", records);
      }
      await offlineQueue.refreshQueueCount();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(kind) {
    await performClock(kind, form.workerID, form.workerName);
  }

  // Instantly clock in the moment a worker name is selected from the list.
  async function handleInstantSelect({ workerID, workerName }) {
    setForm((current) => ({
      ...current,
      workerID,
      workerName: workerName || current.workerName,
    }));
    await performClock("in", workerID, workerName || form.workerName);
  }

  const records = Array.isArray(clockState.data) ? clockState.data : [];
  const recentSessions = records
    .flatMap((worker) =>
      (Array.isArray(worker.clockIns) ? worker.clockIns : []).map((session) => ({
        ...session,
        workerID: worker.workerID,
        workerName: worker.workerName,
      }))
    )
    .sort(
      (first, second) =>
        new Date(second.clockInTime).getTime() - new Date(first.clockInTime).getTime()
    )
    .slice(0, 20);

  return (
    <ScreenScroll refreshing={clockState.loading} onRefresh={clockState.refresh}>
      <SectionCard
        title={t("clock.title")}
        subtitle={t("clock.subtitle")}
      >
        <WorkerSuggestionInput
          label={t("clock.workerID")}
          workerID={form.workerID}
          workerName={form.workerName}
          onSelect={({ workerID, workerName }) =>
            setForm((current) => ({
              ...current,
              workerID,
              workerName: workerName || current.workerName,
            }))
          }
          onInstantSelect={handleInstantSelect}
        />
        <LabeledInput
          label={t("clock.workerName")}
          value={form.workerName}
          onChangeText={(value) => setForm((current) => ({ ...current, workerName: value }))}
          placeholder={t("clock.workerFullName")}
          autoCapitalize="words"
        />
        <LabeledInput
          label={t("clock.timezone")}
          value={form.timezone}
          onChangeText={(value) => setForm((current) => ({ ...current, timezone: value }))}
          placeholder="Africa/Johannesburg"
        />
        <View className="gap-2.5">
          <ActionButton
            label={submitting ? t("common.working") : t("clock.clockIn")}
            onPress={() => submit("in")}
            disabled={submitting}
          />
          <ActionButton
            label={submitting ? t("common.working") : t("clock.clockOut")}
            tone="secondary"
            onPress={() => submit("out")}
            disabled={submitting}
          />
        </View>
        <FeedbackBanner type={feedback.type === "error" ? "error" : "success"} message={feedback.message} />
      </SectionCard>

      <SectionCard
        title={t("clock.recent")}
        subtitle={t("clock.recentSub")}
      >
        {clockState.loading && !clockState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          recentSessions.map((session) => (
            <View key={session._id || `${session.workerID}-${session.clockInTime}`} className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
              <Text className="text-gray-900 text-[15px] font-extrabold">{session.workerName}</Text>
              <Text className="mt-1 text-gray-500 text-[13px]">
                {t("clock.workerAndDate", {
                  id: session.workerID,
                  date: formatClockDate(session.clockInTime),
                })}
              </Text>
              <Text className="mt-1 text-gray-600 text-[13px]">
                {t("clock.sessionTimes", {
                  in: formatClockTime(session.clockInTime) || t("common.na"),
                  out: formatClockTime(session.clockOutTime) || t("clock.active"),
                })}
              </Text>
            </View>
          ))
        )}
        {!recentSessions.length && !clockState.loading ? (
          <Text className="text-gray-400 text-sm">{t("clock.noRecords")}</Text>
        ) : null}
        <FeedbackBanner type="error" message={clockState.error} />
      </SectionCard>
    </ScreenScroll>
  );
}
