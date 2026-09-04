import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import WorkerSuggestionInput from "../components/WorkerSuggestionInput";
import SelectField from "../components/SelectField";
import LabeledInput from "../components/LabeledInput";
import { useAsyncData } from "../hooks/useAsyncData";

const defaultCheckin = {
  workerID: "",
  workerName: "",
};

const defaultCheckout = {
  workerID: "",
  workerName: "",
  stockCount: "",
};

export default function DayWorkScreen({ sharedState, offlineQueue }) {
  const [checkinForm, setCheckinForm] = useState(defaultCheckin);
  const [checkoutForm, setCheckoutForm] = useState(defaultCheckout);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictOccupants, setConflictOccupants] = useState([]);
  const [conflictPayload, setConflictPayload] = useState(null);
  const [conflictFeedback, setConflictFeedback] = useState({ type: "info", message: "" });
  const [conflictSubmitting, setConflictSubmitting] = useState(false);

  const [allowMultipleWorkers, setAllowMultipleWorkers] = useState(false);

  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
    staleTime: 30 * 60 * 1000,
  });
  const rowsState = useAsyncData(
    () =>
      sharedState.selectedBlock
        ? api.getBlockRows(sharedState.selectedBlock)
        : Promise.resolve([]),
    [sharedState.selectedBlock],
    {
      cacheKey: sharedState.selectedBlock ? `rows-${sharedState.selectedBlock}` : undefined,
      staleTime: 15 * 60 * 1000,
    }
  );
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins",
    staleTime: 5 * 60 * 1000,
  });

  const blocks = Array.isArray(blocksState.data)
    ? blocksState.data.filter((item) => item !== null && typeof item !== "undefined" && String(item).trim() !== "")
    : [];
  const rows = Array.isArray(rowsState.data)
    ? rowsState.data.filter((item) => item !== null && typeof item !== "undefined" && String(item).trim() !== "")
    : [];
  const activeCheckins = Array.isArray(checkinsState.data) ? checkinsState.data : [];

  const occupiedRowNumbers = useMemo(() => {
    if (!sharedState.selectedBlock) return [];
    return [
      ...new Set(
        activeCheckins
          .filter((c) => c.blockName === sharedState.selectedBlock)
          .map((c) => String(c.rowNumber))
      ),
    ];
  }, [activeCheckins, sharedState.selectedBlock]);

  const disabledRowValues = allowMultipleWorkers ? [] : occupiedRowNumbers;

  const allRowOptions = [...new Set(rows.map((rowNumber) => String(rowNumber)))].map((rowNumber) => ({
    label: rowNumber,
    value: rowNumber,
  }));

  const blockOptions = [...new Set(blocks.map((blockName) => String(blockName)))].map((blockName) => ({
    label: blockName,
    value: blockName,
  }));

  function getRowOccupants(blockName, rowNumber, jobType) {
    return activeCheckins.filter(
      (item) =>
        item.blockName === blockName &&
        item.rowNumber === rowNumber &&
        (!jobType || (item.job_type || "").toUpperCase() === jobType.toUpperCase())
    );
  }

  async function handleCheckin() {
    const normalizedJobType = (sharedState.jobType || "").trim().toUpperCase();
    const payload = {
      workerID: checkinForm.workerID,
      workerName: checkinForm.workerName,
      jobType: normalizedJobType,
      blockName: sharedState.selectedBlock,
      rowNumber: sharedState.selectedRow,
      ...(allowMultipleWorkers ? { allowMultipleWorkers: true } : {}),
    };

    setSubmitting(true);
    setFeedback({ type: "info", message: "" });

    try {
      const result = await api.regularCheckin(payload);
      setFeedback({ type: "success", message: result.message });
      setCheckinForm(defaultCheckin);
      sharedState.setSelectedRow("");
      setAllowMultipleWorkers(false);
      offlineQueue.refreshQueueCount();
      checkinsState.refresh();
    } catch (error) {
      if (error?.payload?.canOverride) {
        const occupants = getRowOccupants(
          sharedState.selectedBlock,
          sharedState.selectedRow,
          sharedState.jobType
        );
        setConflictPayload(payload);
        setConflictOccupants(occupants);
        setConflictFeedback({ type: "info", message: "" });
        setConflictModalVisible(true);
      } else {
        setFeedback({ type: "error", message: error.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAllowConflict() {
    if (!conflictPayload) return;
    setConflictSubmitting(true);
    setConflictFeedback({ type: "info", message: "" });

    try {
      const result = await api.regularCheckin({ ...conflictPayload, allowMultipleWorkers: true });
      setConflictFeedback({ type: "success", message: result.message });
      setConflictModalVisible(false);
      setConflictPayload(null);
      setConflictOccupants([]);
      setCheckinForm(defaultCheckin);
      sharedState.setSelectedRow("");
      setAllowMultipleWorkers(false);
      setFeedback({ type: "success", message: result.message });
      offlineQueue.refreshQueueCount();
      checkinsState.refresh();
    } catch (error) {
      setConflictFeedback({ type: "error", message: error.message });
    } finally {
      setConflictSubmitting(false);
    }
  }

  function handleRejectConflict() {
    setConflictModalVisible(false);
    setConflictPayload(null);
    setConflictOccupants([]);
    setConflictFeedback({ type: "info", message: "" });
  }

  async function handleCheckout() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...checkoutForm,
        jobType: (sharedState.jobType || "").trim().toUpperCase(),
        blockName: sharedState.selectedBlock,
        rowNumber: sharedState.selectedRow,
        stockCount:
          checkoutForm.stockCount === "" ? undefined : Number(checkoutForm.stockCount),
      };
      const result = await api.regularCheckout(payload);
      setFeedback({ type: "success", message: result.message });
      setCheckoutForm(defaultCheckout);
      await Promise.all([offlineQueue.refreshQueueCount(), checkinsState.refresh()]);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenScroll
      refreshing={blocksState.loading || rowsState.loading || checkinsState.loading}
      onRefresh={() => {
        blocksState.refresh();
        rowsState.refresh();
        checkinsState.refresh();
      }}
    >
      <SectionCard
        title="DayWork"
        subtitle="Choose today's block and row, then check-in and checkout."
      >
        <Text className="text-gray-600 text-sm leading-5">
          Block: {sharedState.selectedBlock || "Not selected"}{"  "}
          Row: {sharedState.selectedRow || "Not selected"}
        </Text>
      </SectionCard>

      <SectionCard
        title="Day selection"
        subtitle="Select block and row. Rows with same-job workers will prompt for confirmation."
      >
        {blocksState.loading && !blocks.length ? (
          <ActivityIndicator color="#16a34a" />
        ) : null}
        <SelectField
          label="Block"
          value={sharedState.selectedBlock}
          placeholder="Select block"
          options={blockOptions}
          onSelect={(value) => {
            sharedState.setSelectedBlock(value);
            sharedState.setSelectedRow("");
            setAllowMultipleWorkers(false);
          }}
          emptyMessage="No blocks found"
        />
        <SelectField
          label="Row"
          value={sharedState.selectedRow}
          placeholder="Select row"
          options={allRowOptions}
          onSelect={(value) => sharedState.setSelectedRow(value)}
          emptyMessage={
            sharedState.selectedBlock
              ? "No rows available in this block"
              : "Select a block first"
          }
          disabledValues={disabledRowValues}
        />
        {occupiedRowNumbers.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 8,
            }}
            onPress={() => setAllowMultipleWorkers((prev) => !prev)}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: allowMultipleWorkers ? "#16a34a" : "#d1d5db",
                backgroundColor: allowMultipleWorkers ? "#16a34a" : "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {allowMultipleWorkers && (
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>
              )}
            </View>
            <Text className="text-gray-600 text-sm" style={{ flex: 1 }}>
              Allow multiple workers on same row
            </Text>
          </TouchableOpacity>
        )}
        <FeedbackBanner type="error" message={blocksState.error || rowsState.error} />
      </SectionCard>

      <SectionCard
        title="Regular check-in"
        subtitle="Uses the selected block and row from above."
      >
        <WorkerSuggestionInput
          label="Worker ID / Worker Name"
          workerID={checkinForm.workerID}
          workerName={checkinForm.workerName}
          onSelect={({ workerID, workerName }) =>
            setCheckinForm((current) => ({
              ...current,
              workerID,
              workerName: workerName || current.workerName,
            }))
          }
        />
        <LabeledInput
          label="Worker name"
          value={checkinForm.workerName}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, workerName: value }))}
          placeholder="Auto-filled from scan or selection"
          autoCapitalize="words"
          readOnly
        />
        <LabeledInput
          label="Job type"
          value={sharedState.jobType}
          onChangeText={(value) => sharedState.setJobType(value)}
          placeholder="e.g. PRUNING"
          autoCapitalize="characters"
        />
        <ActionButton
          label={submitting ? "Working..." : "Submit check-in"}
          onPress={handleCheckin}
          disabled={
            submitting || !sharedState.selectedBlock || !sharedState.selectedRow || !checkinForm.workerID
          }
        />
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>

      <SectionCard
        title="Regular checkout"
        subtitle="Uses the selected block and row from above."
      >
        <WorkerSuggestionInput
          label="Worker ID / Worker Name"
          workerID={checkoutForm.workerID}
          workerName={checkoutForm.workerName}
          onSelect={({ workerID, workerName }) =>
            setCheckoutForm((current) => ({
              ...current,
              workerID,
              workerName: workerName || current.workerName,
            }))
          }
        />
        <LabeledInput
          label="Worker name"
          value={checkoutForm.workerName}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, workerName: value }))}
          placeholder="Auto-filled from scan or selection"
          autoCapitalize="words"
          readOnly
        />
        <LabeledInput
          label="Job type"
          value={sharedState.jobType}
          onChangeText={(value) => sharedState.setJobType(value)}
          placeholder="e.g. PRUNING"
          autoCapitalize="characters"
        />
        <LabeledInput
          label="Stock completed"
          value={checkoutForm.stockCount}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, stockCount: value }))}
          placeholder="Leave blank to complete remaining"
          keyboardType="numeric"
        />
        <ActionButton
          label={submitting ? "Submitting..." : "Submit checkout"}
          tone="secondary"
          onPress={handleCheckout}
          disabled={
            submitting || !sharedState.selectedBlock || !sharedState.selectedRow
          }
        />
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>

      {/* ─── Same-Job Conflict Modal ─── */}
      <Modal visible={conflictModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 24, backgroundColor: "#fff", padding: 24, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>
              Row already occupied
            </Text>

            <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>
              Row {sharedState.selectedRow} in {sharedState.selectedBlock} already has workers doing{" "}
              <Text style={{ fontWeight: "800" }}>{sharedState.jobType}</Text>:
            </Text>

            <View style={{ gap: 6 }}>
              {conflictOccupants.map((o) => (
                <View
                  key={o.workerID}
                  style={{ borderRadius: 12, padding: 10, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#f3f4f6", gap: 2 }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>
                    {o.workerName} ({o.workerID})
                  </Text>
                  <Text style={{ fontSize: 12, color: "#9ca3af" }}>
                    {o.job_type || "No job"} · Row {o.rowNumber}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>
              Allow <Text style={{ fontWeight: "800" }}>{checkinForm.workerName || "this worker"}</Text> to check in on the same row for the same job?
            </Text>

            <FeedbackBanner
              type={conflictFeedback.type === "error" ? "error" : "success"}
              message={conflictFeedback.message}
            />

            <View style={{ gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={{
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "#16a34a",
                }}
                onPress={handleAllowConflict}
                disabled={conflictSubmitting}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
                  {conflictSubmitting ? "Working..." : "Allow — check in here"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                style={{
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "#fff",
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                }}
                onPress={handleRejectConflict}
                disabled={conflictSubmitting}
              >
                <Text style={{ color: "#6b7280", fontSize: 15, fontWeight: "800" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenScroll>
  );
}
