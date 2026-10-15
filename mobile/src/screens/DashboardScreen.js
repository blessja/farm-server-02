import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import InfoPill from "../components/InfoPill";
import FeedbackBanner from "../components/FeedbackBanner";
import ActionButton from "../components/ActionButton";
import LabeledInput from "../components/LabeledInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { LANGUAGES, useLanguage } from "../i18n";
import { addServerWorker, resolveWorkerInput } from "../workers/workerRegistry";
import { sortNamesNumerically } from "../utils/sortNames";

function getProgressColor(percentage) {
  if (percentage >= 100) return "#16a34a";
  if (percentage >= 50) return "#2563eb";
  if (percentage > 0) return "#d97706";
  return "#9ca3af";
}

export default function DashboardScreen({
  sharedState,
  offlineQueue,
  supervisorName = "",
  onOpenActiveWorkers,
}) {
  const { language, setLanguage, t } = useLanguage();
  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
    staleTime: 30 * 60 * 1000,
  });
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins",
    staleTime: 5 * 60 * 1000,
  });
  const progressState = useAsyncData(
    async () => {
      const [blocks, regularTotals, fastTotals] = await Promise.all([
        api.getBlockInventory(),
        api.getRegularTotals(),
        api.getFastTotals(),
      ]);
      return { blocks, regularTotals, fastTotals };
    },
    [],
    { cacheKey: `block-progress:${supervisorName}`, staleTime: 60 * 1000 }
  );

  const [adminForm, setAdminForm] = useState({ workerID: "", workerName: "" });
  const [adminFeedback, setAdminFeedback] = useState({ type: "info", message: "" });
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [blockProgressExpanded, setBlockProgressExpanded] = useState(true);

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
  const blockProgress = useMemo(() => {
    const inventory = progressState.data?.blocks;
    if (!Array.isArray(inventory)) return [];

    const workedByBlockAndJob = new Map();
    const jobTypes = new Set();
    const workerLists = [
      progressState.data?.regularTotals?.workers,
      progressState.data?.fastTotals?.workers,
    ];

    workerLists.forEach((workers) => {
      if (!Array.isArray(workers)) return;
      workers.forEach((worker) => {
        (Array.isArray(worker?.rows) ? worker.rows : []).forEach((row) => {
          const blockName = String(row?.blockName || "").trim();
          const jobType = String(row?.jobType || row?.job_type || "")
            .trim()
            .toUpperCase();
          const vines = Number(row?.vines ?? row?.stock_count) || 0;
          if (!blockName || !jobType || vines <= 0) return;

          const key = `${blockName}\u0000${jobType}`;
          workedByBlockAndJob.set(
            key,
            (workedByBlockAndJob.get(key) || 0) + vines
          );
          jobTypes.add(jobType);
        });
      });
    });

    const sortedJobTypes = [...jobTypes].sort((a, b) => a.localeCompare(b));
    const inventoryByName = new Map(
      inventory
        .filter((block) => String(block?.blockName || "").trim())
        .map((block) => [String(block.blockName).trim(), block])
    );
    return sortNamesNumerically([...inventoryByName.keys()]).map(
      (blockName) => {
        const block = inventoryByName.get(blockName);
        const totalVines = Number(block?.totalVines) || 0;
        return {
          blockName,
          variety: block?.variety || "",
          jobs: sortedJobTypes.map((jobType) => {
            const worked =
              workedByBlockAndJob.get(`${blockName}\u0000${jobType}`) || 0;
            const percentage =
              totalVines > 0
                ? Math.min(100, Math.round((worked / totalVines) * 100))
                : 0;
            return {
              jobType,
              worked,
              remaining: Math.max(0, totalVines - worked),
              percentage,
              totalVines,
            };
          }),
        };
      }
    ).filter((block) => block.jobs.length > 0);
  }, [progressState.data]);

  async function handleAddWorker() {
    let workerID = adminForm.workerID.trim();
    let workerName = adminForm.workerName.trim();

    // Resolve a typed ID or name against the known roster, the same way the
    // other screens do, so a correct name is not rejected as "missing fields".
    if (workerID && !workerName) {
      const resolved = resolveWorkerInput(workerID);
      if (resolved) workerName = resolved.name;
    } else if (!workerID && workerName) {
      const resolved = resolveWorkerInput(workerName);
      if (resolved) workerID = resolved.workerID;
    }

    if (!workerID) {
      setAdminFeedback({
        type: "error",
        message: t("dash.idRequired"),
      });
      return;
    }
    if (!workerName) {
      setAdminFeedback({
        type: "error",
        message: t("dash.nameRequired"),
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
      refreshing={
        blocksState.loading || checkinsState.loading || progressState.loading
      }
      onRefresh={() => {
        blocksState.refresh();
        checkinsState.refresh();
        progressState.refresh();
      }}
    >
      <SectionCard
        title={t("dash.title")}
        subtitle={t("dash.subtitle")}
      >
        {(blocksState.loading || checkinsState.loading) && !blocksState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          <View className="flex-row flex-wrap gap-2.5">
            <InfoPill label={t("dash.blocks")} value={`${blockCount}`} />
            <InfoPill label={t("dash.checkedIn")} value={`${activeWorkers}`} />
            <InfoPill
              label={t("dash.selected")}
              value={
                sharedState.selectedBlock
                  ? `${sharedState.selectedBlock}/${sharedState.selectedRow || "-"}`
                  : t("common.none")
              }
            />
          </View>
        )}
        <FeedbackBanner type="error" message={blocksState.error || checkinsState.error} />
      </SectionCard>

      <View className="rounded-3xl bg-white p-4 border border-gray-100 shadow-sm">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: blockProgressExpanded }}
          activeOpacity={0.75}
          onPress={() => setBlockProgressExpanded((expanded) => !expanded)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: blockProgressExpanded ? 12 : 0,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text className="text-gray-900 text-lg font-extrabold">
              {t("dash.blockProgress")}
            </Text>
            <Text className="text-gray-400 text-[13px] leading-5">
              {t("dash.blockProgressSub")}
            </Text>
          </View>
          <Text className="text-gray-500 text-lg font-bold">
            {blockProgressExpanded ? "−" : "+"}
          </Text>
        </TouchableOpacity>
        {blockProgressExpanded ? (
          progressState.loading && !progressState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : progressState.error ? (
          <FeedbackBanner type="error" message={progressState.error} />
        ) : blockProgress.length === 0 ? (
          <Text className="text-gray-500 text-sm leading-5">
            {t("dash.noBlockProgress")}
          </Text>
        ) : (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-x-3 gap-y-1">
              {[
                ["#9ca3af", t("dash.progressNotStarted")],
                ["#d97706", t("dash.progressUnderHalf")],
                ["#2563eb", t("dash.progressOverHalf")],
                ["#16a34a", t("dash.progressComplete")],
              ].map(([color, label]) => (
                <View key={label} className="flex-row items-center gap-1">
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: color,
                    }}
                  />
                  <Text className="text-gray-500 text-[11px]">{label}</Text>
                </View>
              ))}
            </View>
            <View className="flex-row flex-wrap gap-2.5">
              {blockProgress.flatMap((block) =>
                block.jobs.map((job) => {
                  const color = getProgressColor(job.percentage);
                  return (
                    <View
                      key={`${block.blockName}-${job.jobType}`}
                      style={{
                        flexGrow: 1,
                        flexBasis: 150,
                        maxWidth: 280,
                        minWidth: 135,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        borderRadius: 16,
                        backgroundColor: "#fff",
                        padding: 12,
                        gap: 9,
                        shadowColor: "#111827",
                        shadowOpacity: 0.05,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 1,
                      }}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1 gap-1">
                          <Text className="text-gray-900 text-sm font-extrabold">
                            {t("dash.blockName", { block: block.blockName })}
                          </Text>
                          <Text className="text-gray-500 text-xs" numberOfLines={1}>
                            {block.variety || job.jobType}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderRadius: 999,
                            backgroundColor: `${color}18`,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          }}
                        >
                          <Text style={{ color, fontSize: 11, fontWeight: "800" }}>
                            {job.percentage}%
                          </Text>
                        </View>
                      </View>
                      <Text
                        className="text-gray-700 text-xs font-bold"
                        numberOfLines={1}
                      >
                        {job.jobType}
                      </Text>
                      <View
                        style={{
                          height: 6,
                          backgroundColor: "#f3f4f6",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            width: `${job.percentage}%`,
                            height: "100%",
                            backgroundColor: color,
                            borderRadius: 999,
                          }}
                        />
                      </View>
                      <View className="flex-row justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-gray-400 text-[10px]">
                            {t("dash.workedLabel")}
                          </Text>
                          <Text className="text-gray-800 text-xs font-bold">
                            {job.worked.toLocaleString()}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-gray-400 text-[10px]">
                            {t("dash.leftLabel")}
                          </Text>
                          <Text className="text-gray-800 text-xs font-bold">
                            {job.remaining.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-gray-400 text-[10px]">
                        {t("dash.vinesTotal", {
                          count: job.totalVines.toLocaleString(),
                        })}
                      </Text>
                    </View>
                  );
                }))}
            </View>
          </View>
          )
        ) : null}
      </View>

      <SectionCard
        title={t("dash.offlineSync")}
        subtitle={t("dash.offlineSyncSub")}
      >
        <View className="flex-row flex-wrap gap-2.5">
          <InfoPill label={t("dash.queued")} value={`${offlineQueue.queueCount}`} />
        </View>
        <Text className="text-gray-600 text-sm leading-5">
          {offlineQueue.lastSyncMessage || t("dash.autoSync")}
        </Text>
        <ActionButton label={t("dash.syncNow")} onPress={offlineQueue.syncQueue} />
      </SectionCard>

      <SectionCard
        title="Active workers"
        subtitle="Open the current active list for checkout and previous-day work."
      >
        <ActionButton
          label="View active workers"
          onPress={onOpenActiveWorkers}
          tone="secondary"
        />
      </SectionCard>

      <SectionCard
        title={t("dash.guide")}
        subtitle={t("dash.guideSub")}
      >
        <Text className="text-gray-600 text-sm leading-6">
          {t("dash.guideText")}
        </Text>
      </SectionCard>

      <SectionCard
        title={t("dash.language")}
        subtitle={t("dash.languageSub")}
      >
        <View className="flex-row flex-wrap gap-2.5">
          {Object.values(LANGUAGES).map((lang) => {
            const active = language === lang.key;
            return (
              <TouchableOpacity
                key={lang.key}
                activeOpacity={0.7}
                onPress={() => setLanguage(lang.key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: active ? "#16a34a" : "#d1d5db",
                  backgroundColor: active ? "#dcfce7" : "#fff",
                }}
              >
                {active && (
                  <Text style={{ color: "#15803d", fontSize: 14, fontWeight: "800" }}>✓</Text>
                )}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: active ? "700" : "500",
                    color: active ? "#15803d" : "#374151",
                  }}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard
        title={t("dash.admin")}
        subtitle={t("dash.adminSub")}
      >
        <ActionButton label={t("dash.addWorker")} onPress={openAdminModal} />
      </SectionCard>

      <Modal visible={adminModalVisible} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <ScreenScroll refreshing={false}>
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-1">
                <Text className="text-gray-900 text-lg font-extrabold">{t("dash.addWorkerModal")}</Text>
                <Text className="text-gray-400 text-[13px] leading-5 mt-0.5">
                  {t("dash.addWorkerModalSub")}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                style={{ borderRadius: 12, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 10 }}
                onPress={closeAdminModal}
              >
                <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>{t("common.close")}</Text>
              </TouchableOpacity>
            </View>

            <SectionCard title={t("dash.workerDetails")} subtitle={t("dash.bothFieldsRequired")}>
              <LabeledInput
                label={t("dash.workerID")}
                value={adminForm.workerID}
                onChangeText={(value) =>
                  setAdminForm((current) => ({ ...current, workerID: value }))
                }
                placeholder={t("dash.workerIDPlaceholder")}
                keyboardType="numeric"
              />
              <LabeledInput
                label={t("dash.workerName")}
                value={adminForm.workerName}
                onChangeText={(value) =>
                  setAdminForm((current) => ({ ...current, workerName: value }))
                }
                placeholder={t("dash.workerNamePlaceholder")}
                autoCapitalize="words"
              />
              <ActionButton
                label={adminSubmitting ? t("dash.adding") : t("dash.addWorker")}
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
