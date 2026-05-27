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

const defaultCheckin = {
  workerID: "",
  workerName: "",
  rowNumber: "",
  blockName: "",
  jobType: "",
  allowMultipleWorkers: false,
};

const defaultCheckout = {
  workerID: "",
  workerName: "",
  rowNumber: "",
  blockName: "",
  stockCount: "",
  jobType: "",
};

const defaultMove = {
  workerID: "",
  workerName: "",
  fromRowNumber: "",
  toRowNumber: "",
  blockName: "",
  jobType: "",
  allowMultipleWorkers: false,
};

export default function RowWorkflowScreen({ sharedState, offlineQueue }) {
  const [checkinForm, setCheckinForm] = useState(defaultCheckin);
  const [checkoutForm, setCheckoutForm] = useState(defaultCheckout);
  const [moveForm, setMoveForm] = useState(defaultMove);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [pendingMoveOverride, setPendingMoveOverride] = useState(null);
  const [selectedActiveAssignment, setSelectedActiveAssignment] = useState("");

  const blockName = sharedState.selectedBlock;
  const rowState = useAsyncData(
    () => (blockName ? api.getBlockRows(blockName) : Promise.resolve([])),
    [blockName]
  );
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), []);

  const activeRows = Array.isArray(rowState.data) ? rowState.data : [];
  const activeAssignments = useMemo(() => {
    const source = Array.isArray(checkinsState.data) ? checkinsState.data : [];

    return source.filter((item) =>
      blockName ? item.blockName === blockName : true
    );
  }, [checkinsState.data, blockName]);

  async function handleCheckin() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...checkinForm,
        blockName: checkinForm.blockName || sharedState.selectedBlock,
        rowNumber: checkinForm.rowNumber || sharedState.selectedRow,
      };
      const result = await api.regularCheckin(payload);
      setFeedback({ type: "success", message: result.message });
      setCheckinForm(defaultCheckin);
      await offlineQueue.refreshQueueCount();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckout() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...checkoutForm,
        blockName: checkoutForm.blockName || sharedState.selectedBlock,
        rowNumber: checkoutForm.rowNumber || sharedState.selectedRow,
        stockCount:
          checkoutForm.stockCount === "" ? undefined : Number(checkoutForm.stockCount),
      };
      const result = await api.regularCheckout(payload);
      setFeedback({ type: "success", message: result.message });
      setCheckoutForm(defaultCheckout);
      await offlineQueue.refreshQueueCount();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
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
      setPendingMoveOverride(null);
      setSelectedActiveAssignment("");
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

  function selectAssignment(assignment) {
    setSelectedActiveAssignment(
      `${assignment.workerID}-${assignment.rowNumber}-${assignment.job_type || ""}`
    );
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

  return (
    <ScreenScroll refreshing={rowState.loading} onRefresh={rowState.refresh}>
      <SectionCard
        title="Active row context"
        subtitle="These values come from the selected block and any row you tap below."
      >
        <Text style={styles.context}>
          Block: {sharedState.selectedBlock || "Not selected"}
        </Text>
        <Text style={styles.context}>Row: {sharedState.selectedRow || "Not selected"}</Text>
      </SectionCard>

      <SectionCard
        title="Rows in selected block"
        subtitle="This hits `/api/block/:blockName/rows` so the app can drive row-specific work."
      >
        {!blockName ? (
          <Text style={styles.helper}>Pick a block first in the `Blocks` tab.</Text>
        ) : null}
        {rowState.loading && blockName ? <ActivityIndicator color="#294d39" /> : null}
        <View style={styles.rowWrap}>
          {activeRows.map((rowNumber) => {
            const active = String(sharedState.selectedRow) === String(rowNumber);
            return (
              <Text
                key={`${blockName}-${rowNumber}`}
                style={[styles.rowChip, active && styles.rowChipActive]}
                onPress={() => sharedState.setSelectedRow(String(rowNumber))}
              >
                {rowNumber}
              </Text>
            );
          })}
        </View>
        <FeedbackBanner type="error" message={rowState.error} />
      </SectionCard>

      <SectionCard
        title="Regular check-in"
        subtitle="Maps to `POST /api/checkin` for non-fast piecework jobs."
      >
        <ScannerInput
          label="Worker ID"
          value={checkinForm.workerID}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, workerID: value }))}
          placeholder="e.g. 1024"
        />
        <LabeledInput
          label="Worker name"
          value={checkinForm.workerName}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, workerName: value }))}
          placeholder="Worker full name"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Job type"
          value={checkinForm.jobType}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, jobType: value }))}
          placeholder="e.g. PRUNING"
          autoCapitalize="characters"
        />
        <ScannerInput
          label="Row number override"
          value={checkinForm.rowNumber}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, rowNumber: value }))}
          placeholder="Uses selected row if blank"
        />
        <ActionButton
          label={submitting ? "Submitting..." : "Submit check-in"}
          onPress={handleCheckin}
          disabled={submitting}
        />
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>

      <SectionCard
        title="Regular checkout"
        subtitle="Maps to `POST /api/checkout` and supports a partial stock count."
      >
        <ScannerInput
          label="Worker ID"
          value={checkoutForm.workerID}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, workerID: value }))}
          placeholder="e.g. 1024"
        />
        <LabeledInput
          label="Worker name"
          value={checkoutForm.workerName}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, workerName: value }))}
          placeholder="Worker full name"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Job type"
          value={checkoutForm.jobType}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, jobType: value }))}
          placeholder="Optional if backend can infer"
          autoCapitalize="characters"
        />
        <LabeledInput
          label="Stock completed"
          value={checkoutForm.stockCount}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, stockCount: value }))}
          placeholder="Leave blank to complete remaining"
          keyboardType="numeric"
        />
        <ScannerInput
          label="Row number override"
          value={checkoutForm.rowNumber}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, rowNumber: value }))}
          placeholder="Uses selected row if blank"
        />
        <ActionButton
          label={submitting ? "Submitting..." : "Submit checkout"}
          tone="secondary"
          onPress={handleCheckout}
          disabled={submitting}
        />
        <FeedbackBanner type={feedback.type === "error" ? "error" : "success"} message={feedback.message} />
      </SectionCard>

      <SectionCard
        title="Move scanned worker"
        subtitle="Use this when a worker was scanned onto the wrong row. Pick the already-active assignment below, then choose the correct row."
      >
        {checkinsState.loading ? <ActivityIndicator color="#294d39" /> : null}
        {!activeAssignments.length && !checkinsState.loading ? (
          <Text style={styles.helper}>
            No active assignments found for this block yet.
          </Text>
        ) : null}
        <View style={styles.assignmentList}>
          {activeAssignments.map((assignment) => {
            const assignmentId = `${assignment.workerID}-${assignment.rowNumber}-${assignment.job_type || ""}`;
            const active = selectedActiveAssignment === assignmentId;

            return (
              <Pressable
                key={assignmentId}
                style={[styles.assignmentCard, active && styles.assignmentCardActive]}
                onPress={() => selectAssignment(assignment)}
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
        <LabeledInput
          label="Selected worker"
          value={moveForm.workerName}
          onChangeText={(value) =>
            setMoveForm((current) => ({ ...current, workerName: value }))
          }
          placeholder="Pick an active assignment above"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Current wrong row"
          value={moveForm.fromRowNumber}
          onChangeText={(value) =>
            setMoveForm((current) => ({ ...current, fromRowNumber: value }))
          }
          placeholder="Auto-filled from active assignment"
        />
        <LabeledInput
          label="Job type"
          value={moveForm.jobType}
          onChangeText={(value) =>
            setMoveForm((current) => ({ ...current, jobType: value }))
          }
          placeholder="Auto-filled from active assignment"
          autoCapitalize="characters"
        />
        <ScannerInput
          label="Correct row"
          value={moveForm.toRowNumber}
          onChangeText={(value) =>
            setMoveForm((current) => ({ ...current, toRowNumber: value }))
          }
          placeholder="Uses selected row if blank"
        />
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
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  context: {
    color: "#304137",
    fontSize: 14,
    lineHeight: 20,
  },
  helper: {
    color: "#6a675f",
    fontSize: 14,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
  rowChip: {
    backgroundColor: "#efe4cf",
    color: "#294132",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontWeight: "800",
  },
  rowChipActive: {
    backgroundColor: "#294d39",
    color: "#fefcf7",
  },
});
