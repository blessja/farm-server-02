import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";
import WorkerSuggestionInput from "../components/WorkerSuggestionInput";
import SelectField from "../components/SelectField";
import TotalsGrid from "../components/TotalsGrid";
import TotalsSummary from "../components/TotalsSummary";
import { exportTotalsPdf } from "../utils/totalsExport";
import { sortNamesNumerically } from "../utils/sortNames";
import { useLanguage } from "../i18n";
import { getRowAdvanceSettings, setRowAdvanceSettings } from "../storage/settingsStorage";

const initialForm = {
  workerID: "",
  workerName: "",
  jobType: "LEAF PICKING",
};

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function FastPieceworkScreen({ sharedState, offlineQueue }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [allowSameJob, setAllowSameJob] = useState(false);
  const [rowDirection, setRowDirection] = useState(1);
  const [autoNextEnabled, setAutoNextEnabled] = useState(true);
  const [nextDirection, setNextDirection] = useState("follow");
  const [blockFilter, setBlockFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);

  useEffect(() => {
    (async () => {
      const settings = await getRowAdvanceSettings();
      if (settings) {
        setAutoNextEnabled(settings.enabled !== false);
        if (settings.direction) setNextDirection(settings.direction);
      }
    })();
  }, []);

  const totalsState = useAsyncData(() => api.getFastTotals(), [], {
    cacheKey: "fast-totals",
    staleTime: 5 * 60 * 1000,
  });

  const hoursState = useAsyncData(() => api.getDayHours(), [], {
    cacheKey: "day-hours",
    staleTime: 2 * 60 * 1000,
  });

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
      cacheKey: sharedState.selectedBlock
        ? `rows-${sharedState.selectedBlock}`
        : undefined,
      staleTime: 15 * 60 * 1000,
    }
  );

  const blockDetailsState = useAsyncData(
    () =>
      sharedState.selectedBlock
        ? api.getBlockDetails(sharedState.selectedBlock)
        : Promise.resolve(null),
    [sharedState.selectedBlock],
    {
      cacheKey: sharedState.selectedBlock
        ? `block-details-${sharedState.selectedBlock}`
        : undefined,
      staleTime: 2 * 60 * 1000,
    }
  );

  const blocks = Array.isArray(blocksState.data)
    ? blocksState.data.filter((item) => item !== null && typeof item !== "undefined" && String(item).trim() !== "")
    : [];
  const rows = Array.isArray(rowsState.data)
    ? rowsState.data.filter((item) => item !== null && typeof item !== "undefined" && String(item).trim() !== "")
    : [];
  const totals = Array.isArray(totalsState.data?.workers)
    ? totalsState.data.workers
    : Array.isArray(totalsState.data)
      ? totalsState.data
      : [];

  const fastRows = useMemo(() => {
    const rows = [];
    totals.forEach((w) => {
      (w.rows || []).forEach((r) => {
        rows.push({
          workerID: w.workerID,
          workerName: w.workerName,
          blockName: r.blockName,
          rowNumber: r.rowNumber,
          vines: r.vines || r.stock_count || 0,
          date: r.date,
          jobType: (r.jobType || r.job_type || "").trim().toUpperCase(),
          timeSpent: r.timeSpent || r.time_spent || 0,
        });
      });
    });
    return rows;
  }, [totals]);

  const dayHours = useMemo(() => {
    const list = Array.isArray(hoursState.data) ? hoursState.data : [];
    const map = {};
    list.forEach((entry) => {
      const dk = dateKey(entry.date);
      const wk = entry.workerID;
      const hours = Number(entry.hours) || 0;
      if (hours > 0) {
        map[`${wk}__${dk}`] = { hours, workerName: entry.workerName || "" };
      }
    });
    return map;
  }, [hoursState.data]);

  const fastBlockOptions = useMemo(() => {
    const names = [...new Set(fastRows.map((r) => r.blockName).filter(Boolean))].sort();
    return names.map((n) => ({ label: n, value: n }));
  }, [fastRows]);

  const fastJobOptions = useMemo(() => {
    const types = [...new Set(fastRows.map((r) => r.jobType).filter(Boolean))].sort();
    return types.map((t) => ({ label: t, value: t }));
  }, [fastRows]);

  const filteredFastRows = useMemo(() => {
    return fastRows.filter((r) => {
      if (blockFilter && r.blockName !== blockFilter) return false;
      if (jobFilter && r.jobType !== jobFilter) return false;
      return true;
    });
  }, [fastRows, blockFilter, jobFilter]);

  const isFiltered = Boolean(blockFilter || jobFilter);
  const hasFastData = filteredFastRows.length > 0;

  async function handleExport() {
    if (exporting || !hasFastData) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await exportTotalsPdf({
        rows: filteredFastRows,
        hours: dayHours,
        blockFilter,
        jobFilter,
        title: "Fast Totals",
      });
      if (result.delivery === "cancelled") return;
      const messageKey = {
        shared: "pdf.shared",
        downloaded: "pdf.downloaded",
        preview: "pdf.previewOpened",
      }[result.delivery];
      setExportMessage({
        text: messageKey ? t(messageKey) : t("fast.pdfCreated"),
        ok: true,
      });
    } catch (error) {
      setExportMessage({
        text: error?.message || t("fast.pdfError"),
        ok: false,
      });
    } finally {
      setExporting(false);
    }
  }

  const blockOptions = sortNamesNumerically(
    [...new Set(blocks.map((blockName) => String(blockName)))]
  ).map((blockName) => ({ label: blockName, value: blockName }));

  const selectedJob = (form.jobType || "").trim().toUpperCase();

  const completedRowNumbers = useMemo(() => {
    const block = blockDetailsState.data;
    if (!block || !Array.isArray(block.rows) || !selectedJob) return [];
    return block.rows
      .filter((row) =>
        (Array.isArray(row.active_jobs) ? row.active_jobs : []).some(
          (job) => (job.job_type || "").toUpperCase() === selectedJob
        )
      )
      .map((row) => String(row.row_number));
  }, [blockDetailsState.data, selectedJob]);

  const disabledRowValues = allowSameJob ? [] : completedRowNumbers;

  const rowOptions = sortNamesNumerically(
    [...new Set(rows.map((rowNumber) => String(rowNumber)))]
  ).map((rowNumber) => ({
    label: completedRowNumbers.includes(rowNumber)
      ? t("fast.rowCompleted", { row: rowNumber, job: selectedJob })
      : rowNumber,
    value: rowNumber,
  }));

  function availableRowNumbers() {
    return sortNamesNumerically([
      ...new Set(rows.map((rowNumber) => String(rowNumber))),
    ]);
  }

  function handleRowSelect(value) {
    const prevRow = sharedState.selectedRow;
    const nextRow = String(value);
    if (prevRow) {
      const availableRows = availableRowNumbers();
      const prevIndex = availableRows.indexOf(String(prevRow));
      const nextIndex = availableRows.indexOf(nextRow);
      if (prevIndex !== -1 && nextIndex !== -1) {
        if (nextIndex > prevIndex) setRowDirection(1);
        else if (nextIndex < prevIndex) setRowDirection(-1);
      }
    }
    sharedState.setSelectedRow(nextRow);
    setAllowSameJob(false);
  }

  function advanceToNextRow() {
    if (!autoNextEnabled) return;
    const availableRows = availableRowNumbers();
    const currentValue = String(sharedState.selectedRow || "");
    if (!currentValue || availableRows.length === 0) return;

    const currentIndex = availableRows.indexOf(currentValue);
    if (currentIndex === -1) return;

    let step = rowDirection;
    if (nextDirection === "up") step = 1;
    else if (nextDirection === "down") step = -1;

    const blockedRows = new Set(disabledRowValues.map(String));
    let nextRow = null;
    for (let i = 1; i < availableRows.length; i++) {
      const candidate = availableRows[currentIndex + step * i];
      if (candidate === undefined) break;
      if (blockedRows.has(candidate)) continue;
      nextRow = candidate;
      break;
    }

    if (nextRow) {
      sharedState.setSelectedRow(nextRow);
      if (nextDirection === "up" || nextDirection === "down") {
        setRowDirection(step);
      }
    }
  }

  function handleSuccessfulCheckinSelection() {
    const selectedRow = sharedState.selectedRow;
    if (!selectedRow) return;

    if (autoNextEnabled) {
      advanceToNextRow();
      return;
    }

    sharedState.setSelectedRow(String(selectedRow));
  }

  function toggleAutoNext(value) {
    setAutoNextEnabled(value);
    setRowAdvanceSettings(value, nextDirection);
  }

  function handleNextDirection(direction) {
    setNextDirection(direction);
    setRowAdvanceSettings(autoNextEnabled, direction);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });
    try {
      const payload = {
        ...form,
        blockName: sharedState.selectedBlock,
        rowNumber: sharedState.selectedRow,
      };
      const result = await api.fastCheckin(payload);
      setFeedback({ type: "success", message: result.message });
      handleSuccessfulCheckinSelection();
      totalsState.refresh();
      blockDetailsState.refresh();
      await offlineQueue.refreshQueueCount();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenScroll
      refreshing={totalsState.loading || blocksState.loading || rowsState.loading}
      onRefresh={() => {
        totalsState.refresh();
        blocksState.refresh();
        rowsState.refresh();
        blockDetailsState.refresh();
        hoursState.refresh();
      }}
    >
      <SectionCard
        title={t("fast.title")}
        subtitle={t("fast.subtitle")}
      >
        <Text className="text-gray-600 text-sm leading-5">
          {t("dw.blockLabel", {
            block: sharedState.selectedBlock || t("common.notSelected"),
            row: sharedState.selectedRow || t("common.notSelected"),
          })}{"  "}
        </Text>
      </SectionCard>

      <SectionCard
        title={t("fast.selection")}
        subtitle={t("fast.selectionSub")}
      >
        <LabeledInput
          label={t("dw.jobType")}
          value={form.jobType}
          onChangeText={(value) => {
            setForm((current) => ({ ...current, jobType: value }));
            setAllowSameJob(false);
          }}
          placeholder="LEAF PICKING"
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
            setAllowSameJob(false);
          }}
          emptyMessage={t("common.noBlocksFound")}
        />
        <SelectField
          label={t("dw.row")}
          value={sharedState.selectedRow}
          placeholder={t("dw.selectRow")}
          options={rowOptions}
          onSelect={handleRowSelect}
          emptyMessage={
            sharedState.selectedBlock
              ? t("dw.noRowsInBlock")
              : t("dw.selectBlockFirst")
          }
          disabledValues={disabledRowValues}
        />
        {completedRowNumbers.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 8,
            }}
            onPress={() => setAllowSameJob((prev) => !prev)}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: allowSameJob ? "#16a34a" : "#d1d5db",
                backgroundColor: allowSameJob ? "#16a34a" : "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {allowSameJob && (
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>
              )}
            </View>
            <Text className="text-gray-600 text-sm" style={{ flex: 1 }}>
              {t("fast.allowSameJob")}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 8,
          }}
          onPress={() => toggleAutoNext(!autoNextEnabled)}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: autoNextEnabled ? "#16a34a" : "#d1d5db",
              backgroundColor: autoNextEnabled ? "#16a34a" : "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {autoNextEnabled && (
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>
            )}
          </View>
          <Text className="text-gray-600 text-sm" style={{ flex: 1 }}>
            {t("dw.autoNextRow")}
          </Text>
        </TouchableOpacity>
        {autoNextEnabled ? (
          <View>
            <Text className="text-gray-500 text-xs" style={{ marginBottom: 6 }}>
              {t("dw.autoNextRowSub")}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { key: "follow", label: t("dw.dirFollow") },
                { key: "up", label: t("dw.dirUp") },
                { key: "down", label: t("dw.dirDown") },
              ].map((opt) => {
                const active = nextDirection === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.7}
                    onPress={() => handleNextDirection(opt.key)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: active ? "#16a34a" : "#d1d5db",
                      backgroundColor: active ? "#dcfce7" : "#fff",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? "700" : "500",
                        color: active ? "#15803d" : "#6b7280",
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
        <FeedbackBanner type="error" message={blocksState.error || rowsState.error || blockDetailsState.error} />
      </SectionCard>

      <SectionCard
        title={t("fast.checkin")}
        subtitle={t("dw.regCheckinSub")}
      >
        <WorkerSuggestionInput
          label={t("clock.workerID")}
          workerID={form.workerID}
          workerName={form.workerName}
          onSelect={({ workerID, workerName }) =>
            setForm((current) => ({
              ...current,
              workerID,
              workerName: workerName || current.workerName,
            }))
          }
        />
        <LabeledInput
          label={t("dw.workerName")}
          value={form.workerName}
          onChangeText={(value) => setForm((current) => ({ ...current, workerName: value }))}
          placeholder={t("dw.autoFilled")}
          autoCapitalize="words"
          readOnly
        />
        <ActionButton
          label={submitting ? t("common.submitting") : t("fast.submitFast")}
          onPress={handleSubmit}
          disabled={
            submitting ||
            !sharedState.selectedBlock ||
            !sharedState.selectedRow ||
            !form.workerID
          }
        />
        <FeedbackBanner type={feedback.type === "error" ? "error" : "success"} message={feedback.message} />
      </SectionCard>

      <SectionCard
        title={t("fast.totals")}
        subtitle={t("fast.totalsSub")}
      >
        {fastRows.length > 0 ? (
          <TotalsSummary rows={filteredFastRows} hours={dayHours} />
        ) : null}
        {fastRows.length > 0 ? (
          <SelectField
            label={t("fast.filterBlock")}
            value={blockFilter}
            placeholder={t("fast.allBlocks")}
            options={fastBlockOptions}
            onSelect={(v) => setBlockFilter(v)}
            emptyMessage={t("common.noBlocksFound")}
          />
        ) : null}
        {blockFilter ? (
          <Text
            onPress={() => setBlockFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 8 }}
          >
            {t("fast.clearBlockFilter")}
          </Text>
        ) : null}
        {fastRows.length > 0 ? (
          <SelectField
            label={t("fast.filterJobType")}
            value={jobFilter}
            placeholder={t("fast.allJobs")}
            options={fastJobOptions}
            onSelect={(v) => setJobFilter(v)}
            emptyMessage={t("fast.noJobTypesFound")}
          />
        ) : null}
        {jobFilter ? (
          <Text
            onPress={() => setJobFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 4 }}
          >
            {t("fast.clearJobFilter")}
          </Text>
        ) : null}
        {!isFiltered && !fastRows.length && !totalsState.loading ? (
          <Text style={{ color: "#9ca3af", fontSize: 14 }}>
            {t("fast.noTotalsYet")}
          </Text>
        ) : null}
        {isFiltered && !hasFastData && !totalsState.loading ? (
          <Text style={{ color: "#9ca3af", fontSize: 14 }}>
            {t("fast.noTotalsMatchFilters")}
          </Text>
        ) : null}
        {totalsState.loading && !totalsState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : hasFastData ? (
          <TotalsGrid
            rows={filteredFastRows}
            hours={dayHours}
            editable
            onHoursChanged={() => hoursState.refresh()}
            emptyMessage={t("fast.noTotalsMatchCurrent")}
          />
        ) : null}
        <FeedbackBanner type="error" message={totalsState.error || hoursState.error} />
      </SectionCard>

      <SectionCard
        title={t("fast.export")}
        subtitle={t("fast.exportSub")}
      >
        <ActionButton
          label={exporting ? t("fast.preparingPdf") : t("fast.exportPdf")}
          onPress={handleExport}
          disabled={exporting || !hasFastData}
          tone="secondary"
        />
        {!hasFastData ? (
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            {t("fast.addTotalsFirst")}
          </Text>
        ) : null}
        {exportMessage ? (
          <Text
            style={{
              color: exportMessage.ok ? "#16a34a" : "#dc2626",
              fontSize: 13,
              fontWeight: "700",
            }}
          >
            {exportMessage.text}
          </Text>
        ) : null}
      </SectionCard>
    </ScreenScroll>
  );
}