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
import { useLanguage } from "../i18n";
import { sortNamesNumerically } from "../utils/sortNames";

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
  const { t } = useLanguage();
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
  const [rowDirection, setRowDirection] = useState(1);

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

  const rowOccupantNames = useMemo(() => {
    const map = {};
    activeCheckins.forEach((checkin) => {
      if (checkin.blockName !== sharedState.selectedBlock) return;
      const key = String(checkin.rowNumber);
      if (!map[key]) map[key] = [];
      map[key].push(checkin.workerName || checkin.workerID);
    });
    return map;
  }, [activeCheckins, sharedState.selectedBlock]);

  const allRowOptions = sortNamesNumerically([
    ...new Set(rows.map((rowNumber) => String(rowNumber))),
  ]).map((rowNumber) => {
      const names = rowOccupantNames[rowNumber];
      return {
        label: names && names.length ? `${rowNumber} — ${names.join(", ")}` : rowNumber,
        value: rowNumber,
      };
    });

  const blockOptions = sortNamesNumerically(
    [...new Set(blocks.map((blockName) => String(blockName)))]
  ).map((blockName) => ({
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

  function selectedRowNumber() {
    return Number(sharedState.selectedRow);
  }

  function availableRowNumbers() {
    return sortNamesNumerically([
      ...new Set(rows.map((rowNumber) => String(rowNumber))),
    ]);
  }

  function handleRowSelect(value) {
    const prevNum = selectedRowNumber();
    const nextNum = Number(value);
    if (Number.isFinite(prevNum) && Number.isFinite(nextNum)) {
      if (nextNum > prevNum) setRowDirection(1);
      else if (nextNum < prevNum) setRowDirection(-1);
    }
    sharedState.setSelectedRow(value);
    setAllowMultipleWorkers(false);
  }

  function advanceToNextRow() {
    const availableRows = availableRowNumbers();
    const currentNum = selectedRowNumber();
    if (!Number.isFinite(currentNum) || availableRows.length === 0) {
      sharedState.setSelectedRow("");
      return;
    }
    const nextRow = String(currentNum + rowDirection);
    if (availableRows.includes(nextRow)) {
      sharedState.setSelectedRow(nextRow);
    }
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
      advanceToNextRow();
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
        title={t("dw.title")}
        subtitle={t("dw.subtitle")}
      >
        <Text className="text-gray-600 text-sm leading-5">
          {t("dw.blockLabel", {
            block: sharedState.selectedBlock || t("common.notSelected"),
            row: sharedState.selectedRow || t("common.notSelected"),
          })}{"  "}
        </Text>
      </SectionCard>

      <SectionCard
        title={t("dw.daySelection")}
        subtitle={t("dw.daySelectionSub")}
      >
        <LabeledInput
          label={t("dw.jobType")}
          value={sharedState.jobType}
          onChangeText={(value) => sharedState.setJobType(value)}
          placeholder={t("dw.jobTypePlaceholder")}
          autoCapitalize="characters"
        />
        {blocksState.loading && !blocks.length ? (
          <ActivityIndicator color="#16a34a" />
        ) : null}
        <SelectField
          label={t("dw.block")}
          value={sharedState.selectedBlock}
          placeholder={t("dw.selectBlock")}
          options={blockOptions}
          onSelect={(value) => {
            sharedState.setSelectedBlock(value);
            sharedState.setSelectedRow("");
            setAllowMultipleWorkers(false);
          }}
          emptyMessage={t("common.noBlocksFound")}
        />
        <SelectField
          label={t("dw.row")}
          value={sharedState.selectedRow}
          placeholder={t("dw.selectRow")}
          options={allRowOptions}
          onSelect={handleRowSelect}
          emptyMessage={
            sharedState.selectedBlock
              ? t("dw.noRowsInBlock")
              : t("dw.selectBlockFirst")
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
              {t("dw.allowMultiple")}
            </Text>
          </TouchableOpacity>
        )}
        <FeedbackBanner type="error" message={blocksState.error || rowsState.error} />
      </SectionCard>

      <SectionCard
        title={t("dw.regCheckin")}
        subtitle={t("dw.regCheckinSub")}
      >
        <WorkerSuggestionInput
          label={t("dw.workerIDOrName")}
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
          label={t("dw.workerName")}
          value={checkinForm.workerName}
          onChangeText={(value) => setCheckinForm((current) => ({ ...current, workerName: value }))}
          placeholder={t("dw.autoFilled")}
          autoCapitalize="words"
          readOnly
        />
        <ActionButton
          label={submitting ? t("common.working") : t("dw.submitCheckin")}
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
        title={t("dw.regCheckout")}
        subtitle={t("dw.regCheckinSub")}
      >
        <WorkerSuggestionInput
          label={t("dw.workerIDOrName")}
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
          label={t("dw.workerName")}
          value={checkoutForm.workerName}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, workerName: value }))}
          placeholder={t("dw.autoFilled")}
          autoCapitalize="words"
          readOnly
        />
        <LabeledInput
          label={t("dw.stockCompleted")}
          value={checkoutForm.stockCount}
          onChangeText={(value) => setCheckoutForm((current) => ({ ...current, stockCount: value }))}
          placeholder={t("dw.leaveBlank")}
          keyboardType="numeric"
        />
        <ActionButton
          label={submitting ? t("common.submitting") : t("dw.submitCheckout")}
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
              {t("dw.rowOccupied")}
            </Text>

            <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>
              {t("dw.rowOccupiedDesc", {
                row: sharedState.selectedRow,
                block: sharedState.selectedBlock,
                job: sharedState.jobType || "",
              })}
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
                    {o.job_type || t("common.noJob")} · {t("common.rowCol")} {o.rowNumber}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>
              {t("dw.allowWorkerCheckin", { name: checkinForm.workerName || t("common.thisWorker") })}
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
                  {conflictSubmitting ? t("common.working") : t("dw.allowCheckinHere")}
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
                <Text style={{ color: "#6b7280", fontSize: 15, fontWeight: "800" }}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenScroll>
  );
}
