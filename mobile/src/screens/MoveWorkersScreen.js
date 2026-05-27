import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
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
        subtitle="Search active assignments, filter them by worker, block, row, or job type, then move or swap workers using the selected mode."
      >
        <View style={styles.modeRow}>
          {modeOptions.map((option) => {
            const active = mode === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => setMode(option.key)}
              >
                <Text
                  style={[styles.modeChipText, active && styles.modeChipTextActive]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <LabeledInput
              label="Search"
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search active assignments"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.filterWrap}>
            <Text style={styles.filterLabel}>Filter</Text>
            <View style={styles.filterRow}>
              {filterModes.map((mode) => {
                const active = filterMode === mode.key;
                return (
                  <Pressable
                    key={mode.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilterMode(mode.key)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </Pressable>
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
            ? "Choose an active assignment first. The current block, wrong row, and job type will fill in automatically."
            : "Pick two active workers to swap their assignments."
        }
      >
        {checkinsState.loading ? <ActivityIndicator color="#294d39" /> : null}
        {!filteredAssignments.length && !checkinsState.loading ? (
          <Text style={styles.helper}>No matching active workers found.</Text>
        ) : null}
        <View style={styles.assignmentList}>
          {filteredAssignments.map((assignment, index) => {
            const assignmentId = getAssignmentId(assignment, index);
            const active =
              mode === "move"
                ? selectedActiveAssignment === assignmentId
                : selectedSwapAssignment === assignmentId;

            return (
              <Pressable
                key={assignmentId}
                style={[styles.assignmentCard, active && styles.assignmentCardActive]}
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
                <Text
                  style={[
                    styles.assignmentTitle,
                    active && styles.assignmentTitleActive,
                  ]}
                >
                  {assignment.workerName} ({assignment.workerID})
                </Text>
                <Text
                  style={[
                    styles.assignmentMeta,
                    active && styles.assignmentMetaActive,
                  ]}
                >
                  Block {assignment.blockName} • Row {assignment.rowNumber} •{" "}
                  {assignment.job_type || "No job type"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <FeedbackBanner type="error" message={checkinsState.error} />
      </SectionCard>

      {mode === "move" ? (
        <SectionCard
          title="Move selected worker"
          subtitle="Different job types may share a row. The same worker cannot be assigned twice on the target row."
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
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Preview</Text>
              <Text style={styles.previewText}>
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
          subtitle="Choose two workers from the same active pool and exchange their current row assignments."
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
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Preview</Text>
              {swapPreview.map((line) => (
                <Text key={line} style={styles.previewText}>
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

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeChip: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#efe4cf",
    paddingVertical: 12,
    alignItems: "center",
  },
  modeChipActive: {
    backgroundColor: "#294d39",
  },
  modeChipText: {
    color: "#294132",
    fontSize: 14,
    fontWeight: "800",
  },
  modeChipTextActive: {
    color: "#fefcf7",
  },
  searchRow: {
    gap: 12,
  },
  searchField: {
    flex: 1,
  },
  filterWrap: {
    gap: 6,
  },
  filterLabel: {
    color: "#415247",
    fontSize: 13,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: "#efe4cf",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "#294d39",
  },
  filterChipText: {
    color: "#294132",
    fontSize: 12,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#fefcf7",
  },
  helper: {
    color: "#6a675f",
    fontSize: 14,
  },
  assignmentList: {
    gap: 10,
  },
  assignmentCard: {
    borderRadius: 18,
    backgroundColor: "#f6ecd9",
    padding: 14,
    borderWidth: 1,
    borderColor: "#e0d1b7",
  },
  assignmentCardActive: {
    backgroundColor: "#294d39",
    borderColor: "#294d39",
  },
  assignmentTitle: {
    color: "#203428",
    fontSize: 15,
    fontWeight: "800",
  },
  assignmentTitleActive: {
    color: "#fefcf7",
  },
  assignmentMeta: {
    marginTop: 4,
    color: "#6a6a61",
    fontSize: 13,
    lineHeight: 18,
  },
  assignmentMetaActive: {
    color: "#dce8dd",
  },
  previewBox: {
    borderRadius: 18,
    backgroundColor: "#eef5ec",
    borderWidth: 1,
    borderColor: "#c8ddc7",
    padding: 14,
    gap: 6,
  },
  previewTitle: {
    color: "#23442d",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  previewText: {
    color: "#34523d",
    fontSize: 14,
    lineHeight: 20,
  },
});
