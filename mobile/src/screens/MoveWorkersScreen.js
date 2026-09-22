import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";
import ScannerInput from "../components/ScannerInput";
import { useLanguage } from "../i18n";

const filterModes = [
  { key: "worker", langKey: "mw.worker" },
  { key: "block", langKey: "mw.block" },
  { key: "row", langKey: "mw.row" },
  { key: "job", langKey: "mw.job" },
];

const modeOptions = [
  { key: "move", langKey: "mw.move" },
  { key: "swap", langKey: "mw.swap" },
];

const defaultMove = {
  workerID: "",
  workerName: "",
  fromRowNumber: "",
  toRowNumber: "",
  blockName: "",
  jobType: "",
  allowMultipleWorkers: false,
};

function getAssignmentId(assignment, index = 0) {
  return [
    assignment.workerID || "unknown-worker",
    assignment.workerName || "unknown-name",
    assignment.blockName || "unknown-block",
    assignment.rowNumber || "unknown-row",
    assignment.job_type || "unknown-job",
    assignment.startTime || "unknown-start",
    index,
  ].join("-");
}

export default function MoveWorkersScreen({ sharedState, offlineQueue }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState("move");
  const [searchText, setSearchText] = useState("");
  const [filterMode, setFilterMode] = useState("worker");
  const [moveForm, setMoveForm] = useState(defaultMove);
  const [selectedActiveAssignment, setSelectedActiveAssignment] = useState("");
  const [selectedSwapAssignment, setSelectedSwapAssignment] = useState("");
  const [swapSelection, setSwapSelection] = useState({
    first: null,
    second: null,
  });
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [pendingMoveOverride, setPendingMoveOverride] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins",
    staleTime: 5 * 60 * 1000,
  });
  const source = Array.isArray(checkinsState.data) ? checkinsState.data : [];

  const filteredAssignments = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return source.filter((assignment) => {
      if (!search) {
        return true;
      }

      if (filterMode === "worker") {
        return `${assignment.workerName || ""} ${assignment.workerID || ""}`
          .toLowerCase()
          .includes(search);
      }

      if (filterMode === "block") {
        return `${assignment.blockName || ""}`.toLowerCase().includes(search);
      }

      if (filterMode === "row") {
        return `${assignment.rowNumber || ""}`.toLowerCase().includes(search);
      }

      return `${assignment.job_type || ""}`.toLowerCase().includes(search);
    });
  }, [source, searchText, filterMode]);

  function selectAssignment(assignment, index) {
    setSelectedActiveAssignment(getAssignmentId(assignment, index));
    setMoveForm({
      workerID: assignment.workerID,
      workerName: assignment.workerName,
      fromRowNumber: assignment.rowNumber,
      toRowNumber: "",
      blockName: assignment.blockName,
      jobType: assignment.job_type || "",
      allowMultipleWorkers: false,
    });
    setPendingMoveOverride(null);
    setFeedback({ type: "info", message: "" });
  }

  function selectSwapWorker(slot, assignment, index) {
    const assignmentId = getAssignmentId(assignment, index);
    setSelectedSwapAssignment(assignmentId);
    setSwapSelection((current) => ({
      ...current,
      [slot]: assignment,
    }));
    setFeedback({ type: "info", message: "" });
  }

  async function handleMoveWorker(overridePayload = null) {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });

    try {
      const payload = overridePayload || {
        ...moveForm,
        blockName: moveForm.blockName || sharedState.selectedBlock,
        toRowNumber: moveForm.toRowNumber || sharedState.selectedRow,
      };

      const result = await api.moveRegularWorker(payload);
      setFeedback({ type: "success", message: result.message });
      setMoveForm(defaultMove);
      setSelectedActiveAssignment("");
      setPendingMoveOverride(null);
      await offlineQueue.refreshQueueCount();
      await checkinsState.refresh();
    } catch (error) {
      if (error?.payload?.canOverride) {
        setPendingMoveOverride({
          ...moveForm,
          blockName: moveForm.blockName || sharedState.selectedBlock,
          toRowNumber: moveForm.toRowNumber || sharedState.selectedRow,
          allowMultipleWorkers: true,
        });
      } else {
        setPendingMoveOverride(null);
      }

      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwapWorkers() {
    if (!swapSelection.first || !swapSelection.second) {
      setFeedback({
        type: "error",
        message: t("mw.selectTwoToSwap"),
      });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: "info", message: "" });

    try {
      const result = await api.swapRegularWorkers({
        firstWorkerID: swapSelection.first.workerID,
        secondWorkerID: swapSelection.second.workerID,
        blockName:
          swapSelection.first.blockName || swapSelection.second.blockName,
        firstJobType: swapSelection.first.job_type || "",
        secondJobType: swapSelection.second.job_type || "",
      });

      setFeedback({ type: "success", message: result.message });
      setSwapSelection({ first: null, second: null });
      setSelectedSwapAssignment("");
      await offlineQueue.refreshQueueCount();
      await checkinsState.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  const swapPreview =
    swapSelection.first && swapSelection.second
      ? [
          t("mw.previewSwap", {
            name: swapSelection.first.workerName,
            from: swapSelection.first.rowNumber,
            to: swapSelection.second.rowNumber,
          }),
          t("mw.previewSwap", {
            name: swapSelection.second.workerName,
            from: swapSelection.second.rowNumber,
            to: swapSelection.first.rowNumber,
          }),
        ]
      : [];

  return (
    <ScreenScroll refreshing={checkinsState.loading} onRefresh={checkinsState.refresh}>
      <SectionCard
        title={t("mw.title")}
        subtitle={t("mw.subtitle")}
      >
        <View className="flex-row gap-2.5">
          {modeOptions.map((option) => {
            const active = mode === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: active ? "#2D7A55" : "#E5ECE4",
                  borderWidth: active ? 0 : 1,
                  borderColor: "#D4DFD3",
                }}
                onPress={() => setMode(option.key)}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#fff" : "#4b5563" }}>
                  {t(option.langKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View className="gap-3">
          <View className="flex-1">
            <LabeledInput
              label={t("mw.search")}
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t("mw.searchPlaceholder")}
              autoCapitalize="none"
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-gray-600 text-xs font-bold">{t("mw.filter")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {filterModes.map((mode) => {
                const active = filterMode === mode.key;
                return (
                  <TouchableOpacity
                    key={mode.key}
                    activeOpacity={0.7}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: active ? "#2D7A55" : "#E5ECE4",
                      borderWidth: active ? 0 : 1,
                      borderColor: "#D4DFD3",
                    }}
                    onPress={() => setFilterMode(mode.key)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "800", color: active ? "#fff" : "#4b5563" }}>
                      {t(mode.langKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title={t("mw.activeWorkers")}
        subtitle={
          mode === "move"
            ? t("mw.activeWorkersMoveSub")
            : t("mw.activeWorkersSwapSub")
        }
      >
        {checkinsState.loading ? <ActivityIndicator color="#16a34a" /> : null}
        {!filteredAssignments.length && !checkinsState.loading ? (
          <Text className="text-gray-400 text-sm">{t("mw.noMatching")}</Text>
        ) : null}
        <View className="gap-2.5">
          {filteredAssignments.map((assignment, index) => {
            const assignmentId = getAssignmentId(assignment, index);
            const active =
              mode === "move"
                ? selectedActiveAssignment === assignmentId
                : selectedSwapAssignment === assignmentId;

            return (
              <TouchableOpacity
                key={assignmentId}
                activeOpacity={0.7}
                style={{
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  backgroundColor: active ? "#2D7A55" : "#F4F7F3",
                  borderColor: active ? "#2D7A55" : "#E5ECE4",
                }}
                onPress={() => {
                  if (mode === "move") {
                    selectAssignment(assignment, index);
                    return;
                  }

                  if (
                    !swapSelection.first ||
                    swapSelection.first.workerID === assignment.workerID
                  ) {
                    selectSwapWorker("first", assignment, index);
                    return;
                  }

                  selectSwapWorker("second", assignment, index);
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "800", color: active ? "#fff" : "#111827" }}>
                  {assignment.workerName} ({assignment.workerID})
                </Text>
                <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: active ? "#DCEFE1" : "#819080" }}>
                  {t("mw.activePosition", {
                    block: assignment.blockName,
                    row: assignment.rowNumber,
                    job: assignment.job_type || t("mw.noJobType"),
                  })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <FeedbackBanner type="error" message={checkinsState.error} />
      </SectionCard>

      {mode === "move" ? (
        <SectionCard
          title={t("mw.moveTitle")}
          subtitle={t("mw.moveSub")}
        >
          <LabeledInput
            label={t("mw.selectedWorker")}
            value={moveForm.workerName}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, workerName: value }))
            }
            placeholder={t("mw.selectActiveAbove")}
            autoCapitalize="words"
          />
          <LabeledInput
            label={t("dw.block")}
            value={moveForm.blockName}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, blockName: value }))
            }
            placeholder={t("mw.autoFilled")}
            autoCapitalize="characters"
          />
          <LabeledInput
            label={t("mw.wrongRow")}
            value={moveForm.fromRowNumber}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, fromRowNumber: value }))
            }
            placeholder={t("mw.autoFilled")}
          />
          <LabeledInput
            label={t("dw.jobType")}
            value={moveForm.jobType}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, jobType: value }))
            }
            placeholder={t("mw.autoFilled")}
            autoCapitalize="characters"
          />
          <ScannerInput
            label={t("mw.correctRow")}
            value={moveForm.toRowNumber}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, toRowNumber: value }))
            }
            placeholder={t("mw.correctRowPlaceholder")}
          />
          {(moveForm.workerName || moveForm.toRowNumber || sharedState.selectedRow) ? (
            <View className="rounded-2xl bg-farm-50 border border-farm-200 p-3.5 gap-1.5">
              <Text className="text-farm-800 text-xs font-extrabold uppercase">{t("mw.preview")}</Text>
              <Text className="text-farm-700 text-sm leading-5">
                {t("mw.willMoveFromToBlock", {
                  name: moveForm.workerName || t("mw.selectedWorker"),
                  from: moveForm.fromRowNumber || "?",
                  to: moveForm.toRowNumber || sharedState.selectedRow || "?",
                  block: moveForm.blockName || sharedState.selectedBlock || "?",
                })}
              </Text>
            </View>
          ) : null}
          <ActionButton
            label={submitting ? t("mw.moving") : t("mw.moveButton")}
            onPress={() => handleMoveWorker()}
            disabled={submitting}
          />
          {pendingMoveOverride ? (
            <ActionButton
              label={submitting ? t("mw.applying") : t("mw.moveOverride")}
              tone="secondary"
              onPress={() => handleMoveWorker(pendingMoveOverride)}
              disabled={submitting}
            />
          ) : null}
          <FeedbackBanner
            type={feedback.type === "error" ? "error" : "success"}
            message={feedback.message}
          />
        </SectionCard>
      ) : (
        <SectionCard
          title={t("mw.swapTitle")}
          subtitle={t("mw.swapSub")}
        >
          <LabeledInput
            label={t("mw.firstWorker")}
            value={swapSelection.first?.workerName || ""}
            onChangeText={() => {}}
            placeholder={t("mw.tapFirstAbove")}
            autoCapitalize="words"
          />
          <LabeledInput
            label={t("mw.secondWorker")}
            value={swapSelection.second?.workerName || ""}
            onChangeText={() => {}}
            placeholder={t("mw.tapSecondAbove")}
            autoCapitalize="words"
          />
          {swapPreview.length ? (
            <View className="rounded-2xl bg-farm-50 border border-farm-200 p-3.5 gap-1.5">
              <Text className="text-farm-800 text-xs font-extrabold uppercase">{t("mw.preview")}</Text>
              {swapPreview.map((line) => (
                <Text key={line} className="text-farm-700 text-sm leading-5">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          <ActionButton
            label={submitting ? t("mw.swapping") : t("mw.swapButton")}
            onPress={handleSwapWorkers}
            disabled={submitting}
          />
          <FeedbackBanner
            type={feedback.type === "error" ? "error" : "success"}
            message={feedback.message}
          />
        </SectionCard>
      )}
    </ScreenScroll>
  );
}
