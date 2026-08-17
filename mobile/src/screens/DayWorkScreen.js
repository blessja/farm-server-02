import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
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

  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
  });
  const rowsState = useAsyncData(
    () =>
      sharedState.selectedBlock
        ? api.getBlockRows(sharedState.selectedBlock)
        : Promise.resolve([]),
    [sharedState.selectedBlock],
    { cacheKey: sharedState.selectedBlock ? `rows-${sharedState.selectedBlock}` : undefined }
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
    const jt = sharedState.jobType?.trim().toUpperCase();
    return new Set(
      activeCheckins
        .filter((item) => {
          if (item.blockName !== sharedState.selectedBlock) return false;
          if (jt && item.job_type) {
            return item.job_type.toUpperCase() === jt;
          }
          return true;
        })
        .map((item) => String(item.rowNumber))
    );
  }, [activeCheckins, sharedState.selectedBlock, sharedState.jobType]);

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
    const payload = {
      workerID: checkinForm.workerID,
      workerName: checkinForm.workerName,
      jobType: sharedState.jobType,
      blockName: sharedState.selectedBlock,
      rowNumber: sharedState.selectedRow,
    };

    setCheckinForm(defaultCheckin);
    sharedState.setSelectedRow("");
    setFeedback({ type: "success", message: "Check-in sent" });

    api.regularCheckin(payload).then(() => {
      offlineQueue.refreshQueueCount();
      checkinsState.refresh();
    }).catch(() => {});
  }

  async function handleCheckout() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...checkoutForm,
        jobType: sharedState.jobType,
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
        subtitle="Rows with active workers on the same job type are hidden."
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
        subtitle="Uses the selected block and row from above."
      >
        <WorkerSuggestionInput
          label="Worker ID"
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
          placeholder="Worker full name"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Job type"
          value={sharedState.jobType}
          onChangeText={(value) => sharedState.setJobType(value)}
          placeholder="e.g. PRUNING"
          autoCapitalize="characters"
        />
        <ActionButton
          label="Submit check-in"
          onPress={handleCheckin}
          disabled={
            !sharedState.selectedBlock || !sharedState.selectedRow || !checkinForm.workerID
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
          label="Worker ID"
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
          placeholder="Worker full name"
          autoCapitalize="words"
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
    </ScreenScroll>
  );
}
