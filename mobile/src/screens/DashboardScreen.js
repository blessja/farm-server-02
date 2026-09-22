import React, { useState } from "react";
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
import { useLanguage } from "../i18n";
import { addServerWorker } from "../workers/workerRegistry";

export default function DashboardScreen({ sharedState, offlineQueue }) {
  const { t } = useLanguage();
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
        message: t("dash.workerIdAndNameRequired"),
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
        title={t("dash.guide")}
        subtitle={t("dash.guideSub")}
      >
        <Text className="text-gray-600 text-sm leading-6">
          {t("dash.guideText")}
        </Text>
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
