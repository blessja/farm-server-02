import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import ScannerInput from "../components/ScannerInput";
import SelectField from "../components/SelectField";
import { useAsyncData } from "../hooks/useAsyncData";

const defaultCheckin = {
  workerID: "",
  workerName: "",
  jobType: "",
};

const defaultCheckout = {
  workerID: "",
  workerName: "",
  stockCount: "",
  jobType: "",
};

export default function DayWorkScreen({ sharedState, offlineQueue }) {
  const [checkinForm, setCheckinForm] = useState(defaultCheckin);
  const [checkoutForm, setCheckoutForm] = useState(defaultCheckout);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const blocksState = useAsyncData(() => api.getBlocks(), []);
  const rowsState = useAsyncData(
    () =>
      sharedState.selectedBlock
        ? api.getBlockRows(sharedState.selectedBlock)
        : Promise.resolve([]),
    [sharedState.selectedBlock]
  );
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), []);

  const blocks = Array.isArray(blocksState.data)
    ? blocksState.data.filter((item) => item !== null && typeof item !== "undefined" && String(item).trim() !== "")
    : [];
  const rows = Array.isArray(rowsState.data)
    ? rowsState.data.filter((item) => item !== null && typeof item !== "undefined" && String(item).trim() !== "")
    : [];
  const activeCheckins = Array.isArray(checkinsState.data) ? checkinsState.data : [];

  const occupiedRows = useMemo(() => {
    return new Set(
      activeCheckins
        .filter((item) => item.blockName === sharedState.selectedBlock)
        .map((item) => String(item.rowNumber))
    );
  }, [activeCheckins, sharedState.selectedBlock]);

  const availableRowOptions = [...new Set(rows.map((rowNumber) => String(rowNumber)))]
    .filter((rowNumber) => !occupiedRows.has(rowNumber))
    .map((rowNumber) => ({
      label: rowNumber,
      value: rowNumber,
    }));

  const blockOptions = [...new Set(blocks.map((blockName) => String(blockName)))]
    .map((blockName) => ({
      label: blockName,
      value: blockName,
    }));

  async function handleCheckin() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...checkinForm,
        blockName: sharedState.selectedBlock,
        rowNumber: sharedState.selectedRow,
      };
      const result = await api.regularCheckin(payload);
      setFeedback({ type: "success", message: result.message });
      setCheckinForm(defaultCheckin);
      await Promise.all([offlineQueue.refreshQueueCount(), checkinsState.refresh()]);
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

  function applyScannedWorker(setter) {
    return ({ textValue, workerData }) => {
      setter((current) => ({
        ...current,
        workerID: textValue || "",
        workerName: workerData?.workerName || current.workerName,
      }));
    };
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
        subtitle="Choose today’s block and row, then use the same screen for check-in and checkout."
      >
        <Text style={styles.contextLine}>
          Active block: {sharedState.selectedBlock || "Not selected"}
        </Text>
        <Text style={styles.contextLine}>
          Active row: {sharedState.selectedRow || "Not selected"}
        </Text>
      </SectionCard>

      <SectionCard
        title="Day selection"
        subtitle="Rows that already have active workers assigned in this block are hidden from the row dropdown."
      >
        {blocksState.loading && !blocks.length ? (
          <ActivityIndicator color="#294d39" />
        ) : null}
        <SelectField
          label="Block"
          value={sharedState.selectedBlock}
          placeholder="Select block"
          options={blockOptions}
          onSelect={(value) => {
            sharedState.setSelectedBlock(value);
            sharedState.setSelectedRow("");
          }}
          emptyMessage="No blocks found"
        />
        <SelectField
          label="Row"
          value={sharedState.selectedRow}
          placeholder="Select available row"
          options={availableRowOptions}
          onSelect={(value) => sharedState.setSelectedRow(value)}
          emptyMessage={
            sharedState.selectedBlock
              ? "No free rows available in this block"
              : "Select a block first"
          }
        />
        <FeedbackBanner type="error" message={blocksState.error || rowsState.error} />
      </SectionCard>

      <SectionCard
        title="Regular check-in"
        subtitle="Uses the selected block and row from the DayWork dropdowns."
      >
        <ScannerInput
          label="Worker ID"
          value={checkinForm.workerID}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, workerID: value }))}
          onScan={applyScannedWorker(setCheckinForm)}
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
        <ActionButton
          label={submitting ? "Submitting..." : "Submit check-in"}
          onPress={handleCheckin}
          disabled={
            submitting || !sharedState.selectedBlock || !sharedState.selectedRow
          }
        />
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>

      <SectionCard
        title="Regular checkout"
        subtitle="Uses the selected block and row from the DayWork dropdowns."
      >
        <ScannerInput
          label="Worker ID"
          value={checkoutForm.workerID}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, workerID: value }))}
          onScan={applyScannedWorker(setCheckoutForm)}
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
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  contextLine: {
    color: "#304137",
    fontSize: 14,
    lineHeight: 20,
  },
});
