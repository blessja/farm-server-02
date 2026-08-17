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

const filterModes = [
  { key: "worker", label: "Worker" },
  { key: "block", label: "Block" },
  { key: "row", label: "Row" },
  { key: "job", label: "Job" },
];

const modeOptions = [
  { key: "move", label: "Move" },
  { key: "swap", label: "Swap" },
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

  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), []);
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
        message: "Select two active workers to swap.",
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
          `${swapSelection.first.workerName} will move from Row ${swapSelection.first.rowNumber} to Row ${swapSelection.second.rowNumber}.`,
          `${swapSelection.second.workerName} will move from Row ${swapSelection.second.rowNumber} to Row ${swapSelection.first.rowNumber}.`,
        ]
      : [];

  return (
    <ScreenScroll refreshing={checkinsState.loading} onRefresh={checkinsState.refresh}>
      <SectionCard
        title="Move workers"
        subtitle="Search active assignments, then move or swap workers between rows."
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
                  backgroundColor: active ? "#16a34a" : "#f3f4f6",
                  borderWidth: active ? 0 : 1,
                  borderColor: "#e5e7eb",
                }}
                onPress={() => setMode(option.key)}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#fff" : "#4b5563" }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View className="gap-3">
          <View className="flex-1">
            <LabeledInput
              label="Search"
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search active assignments"
              autoCapitalize="none"
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-gray-600 text-xs font-bold">Filter</Text>
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
                      backgroundColor: active ? "#16a34a" : "#f3f4f6",
                      borderWidth: active ? 0 : 1,
                      borderColor: "#e5e7eb",
                    }}
                    onPress={() => setFilterMode(mode.key)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "800", color: active ? "#fff" : "#4b5563" }}>
                      {mode.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Active workers"
        subtitle={
          mode === "move"
            ? "Choose an active assignment. Block, row, and job type auto-fill."
            : "Pick two workers to swap their row assignments."
        }
      >
        {checkinsState.loading ? <ActivityIndicator color="#16a34a" /> : null}
        {!filteredAssignments.length && !checkinsState.loading ? (
          <Text className="text-gray-400 text-sm">No matching active workers found.</Text>
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
                  backgroundColor: active ? "#16a34a" : "#f9fafb",
                  borderColor: active ? "#16a34a" : "#f3f4f6",
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
                <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: active ? "#dcfce7" : "#9ca3af" }}>
                  Block {assignment.blockName} • Row {assignment.rowNumber} •{" "}
                  {assignment.job_type || "No job type"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <FeedbackBanner type="error" message={checkinsState.error} />
      </SectionCard>

      {mode === "move" ? (
        <SectionCard
          title="Move selected worker"
          subtitle="Different job types may share a row. Same worker cannot be on the target row twice."
        >
          <LabeledInput
            label="Selected worker"
            value={moveForm.workerName}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, workerName: value }))
            }
            placeholder="Select an active worker above"
            autoCapitalize="words"
          />
          <LabeledInput
            label="Block"
            value={moveForm.blockName}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, blockName: value }))
            }
            placeholder="Auto-filled from assignment"
            autoCapitalize="characters"
          />
          <LabeledInput
            label="Wrong row"
            value={moveForm.fromRowNumber}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, fromRowNumber: value }))
            }
            placeholder="Auto-filled from assignment"
          />
          <LabeledInput
            label="Job type"
            value={moveForm.jobType}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, jobType: value }))
            }
            placeholder="Auto-filled from assignment"
            autoCapitalize="characters"
          />
          <ScannerInput
            label="Correct row"
            value={moveForm.toRowNumber}
            onChangeText={(value) =>
              setMoveForm((current) => ({ ...current, toRowNumber: value }))
            }
            placeholder="Uses active Day row if blank"
          />
          {(moveForm.workerName || moveForm.toRowNumber || sharedState.selectedRow) ? (
            <View className="rounded-2xl bg-farm-50 border border-farm-200 p-3.5 gap-1.5">
              <Text className="text-farm-800 text-xs font-extrabold uppercase">Preview</Text>
              <Text className="text-farm-700 text-sm leading-5">
                {moveForm.workerName || "Selected worker"} will move from Row{" "}
                {moveForm.fromRowNumber || "?"} to Row{" "}
                {moveForm.toRowNumber || sharedState.selectedRow || "?"} in Block{" "}
                {moveForm.blockName || sharedState.selectedBlock || "?"}.
              </Text>
            </View>
          ) : null}
          <ActionButton
            label={submitting ? "Moving..." : "Move worker to correct row"}
            onPress={() => handleMoveWorker()}
            disabled={submitting}
          />
          {pendingMoveOverride ? (
            <ActionButton
              label={submitting ? "Applying..." : "Move with same-job override"}
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
          title="Swap selected workers"
          subtitle="Choose two workers from the same block and exchange their row assignments."
        >
          <LabeledInput
            label="First worker"
            value={swapSelection.first?.workerName || ""}
            onChangeText={() => {}}
            placeholder="Tap a worker above first"
            autoCapitalize="words"
          />
          <LabeledInput
            label="Second worker"
            value={swapSelection.second?.workerName || ""}
            onChangeText={() => {}}
            placeholder="Tap a second worker above"
            autoCapitalize="words"
          />
          {swapPreview.length ? (
            <View className="rounded-2xl bg-farm-50 border border-farm-200 p-3.5 gap-1.5">
              <Text className="text-farm-800 text-xs font-extrabold uppercase">Preview</Text>
              {swapPreview.map((line) => (
                <Text key={line} className="text-farm-700 text-sm leading-5">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          <ActionButton
            label={submitting ? "Swapping..." : "Swap workers"}
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
