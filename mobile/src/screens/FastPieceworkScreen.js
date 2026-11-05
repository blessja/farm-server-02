import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { exportTotalsExcel, exportTotalsPdf } from "../utils/totalsExport";
import { sortNamesNumerically } from "../utils/sortNames";
import { useLanguage } from "../i18n";
import { getRowAdvanceSettings, setRowAdvanceSettings } from "../storage/settingsStorage";

const initialForm = {
  workerID: "",
  workerName: "",
  jobType: "LEAF PICKING",
};

const FAST_JOB_TYPES = ["LEAF PICKING", "SUCKER REMOVAL", "SHOOT THINNING", "OTHER"];

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
  const [fastWorkersOpen, setFastWorkersOpen] = useState(false);
  const [expandedFastBlocks, setExpandedFastBlocks] = useState({});
  const [fastWorkersSubmitting, setFastWorkersSubmitting] = useState(false);
  const [fastWorkersFeedback, setFastWorkersFeedback] = useState({ type: "info", message: "" });
  const [expandedFastWorkers, setExpandedFastWorkers] = useState({});
  const [fastWorkerAction, setFastWorkerAction] = useState(null);
  const [fastCheckoutStock, setFastCheckoutStock] = useState("");
  const [fastCheckoutKeep, setFastCheckoutKeep] = useState(true);
  const [fastMoveTargetBlock, setFastMoveTargetBlock] = useState("");
  const [fastMoveTargetRow, setFastMoveTargetRow] = useState("");

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

  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins:fast-workers",
    staleTime: 30 * 1000,
  });

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

  const varietyByBlock = useMemo(() => {
    const blockStatus = Array.isArray(totalsState.data?.globalBlockStatus)
      ? totalsState.data.globalBlockStatus
      : [];
    return blockStatus.reduce((map, block) => {
      if (block?.blockName && block?.variety) {
        map[block.blockName] = String(block.variety).trim();
      }
      return map;
    }, {});
  }, [totalsState.data]);

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
          variety: String(r.variety || varietyByBlock[r.blockName] || "").trim(),
        });
      });
    });
    return rows;
  }, [totals, varietyByBlock]);

  const fastCheckins = useMemo(
    () =>
      (Array.isArray(checkinsState.data) ? checkinsState.data : []).filter((r) =>
        FAST_JOB_TYPES.includes(String(r.job_type || "").toUpperCase())
      ),
    [checkinsState.data]
  );

  const fastWorkersByBlock = useMemo(() => {
    const map = {};
    fastCheckins.forEach((row) => {
      const block = String(row.blockName || "unknown-block");
      if (!map[block]) map[block] = {};
      const workerKey = String(row.workerID);
      if (!map[block][workerKey]) {
        map[block][workerKey] = {
          workerID: row.workerID,
          workerName: row.workerName,
          rowNumber: row.rowNumber,
          jobType: String(row.job_type || "").toUpperCase(),
          vines: row.vines ?? row.rowRemainingStocks ?? row.remainingStocks ?? 0,
          timeSpent: row.timeSpent ?? row.time_spent ?? 0,
          variety: String(row.variety || "").trim(),
        };
      }
    });
    const grouped = {};
    sortNamesNumerically(Object.keys(map)).forEach((block) => {
      grouped[block] = Object.values(map[block]).sort((a, b) =>
        sortNamesNumerically([String(a.workerName || ""), String(b.workerName || "")])
      );
    });
    return grouped;
  }, [fastCheckins]);

  const selectedRowWorkerName = useMemo(() => {
    const block = String(sharedState.selectedBlock || "");
    const row = String(sharedState.selectedRow || "");
    if (!block || !row) return "";
    const match = fastRows.find(
      (r) =>
        String(r.blockName || "") === block &&
        String(r.rowNumber) === row
    );
    return match ? String(match.workerName || "") : "";
  }, [fastRows, sharedState.selectedBlock, sharedState.selectedRow]);

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

  async function handleExport(download = false) {
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
        download,
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

  async function handleExportExcel() {
    if (exporting || !hasFastData) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await exportTotalsExcel({
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

  const completedRowWorkerNames = useMemo(() => {
    const map = {};
    fastRows.forEach((r) => {
      const rowKey = String(r.rowNumber);
      if (!completedRowNumbers.includes(rowKey)) return;
      if (String(r.jobType || "").toUpperCase() !== String(selectedJob || "").toUpperCase()) return;
      if (r.blockName && String(r.blockName) !== String(sharedState.selectedBlock || "")) return;
      map[rowKey] = String(r.workerName || "");
    });
    return map;
  }, [fastRows, completedRowNumbers, selectedJob]);

  const rowOptions = sortNamesNumerically(
    [...new Set(rows.map((rowNumber) => String(rowNumber)))]
  ).map((rowNumber) => ({
    label: completedRowNumbers.includes(rowNumber)
      ? `${t("fast.rowCompleted", { row: rowNumber, job: selectedJob })}${completedRowWorkerNames[rowNumber] ? ` — ${completedRowWorkerNames[rowNumber]}` : ""}`
      : rowNumber,
    value: rowNumber,
  }));

  function availableRowNumbers() {
    return sortNamesNumerically([
      ...new Set(rows.map((rowNumber) => String(rowNumber))),
    ]);
  }

  const fastMoveRowsState = useAsyncData(
    () => (fastMoveTargetBlock ? api.getBlockRows(fastMoveTargetBlock) : []),
    [fastMoveTargetBlock],
    { cacheKey: `fast-move-rows-${fastMoveTargetBlock}`, staleTime: 30000 }
  );

  const fastMoveRowOptions = useMemo(() => {
    const block = fastMoveRowsState.data;
    const rows = block && Array.isArray(block.rows) ? block.rows : [];
    return sortNamesNumerically([...new Set(rows.map((rowNumber) => String(rowNumber)))]).map((rowNumber) => ({
      label: rowNumber,
      value: rowNumber,
    }));
  }, [fastMoveRowsState.data]);

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
      setForm((current) => ({ ...current, workerID: "", workerName: "" }));
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

  function toggleFastWorker(blockName, worker) {
    const key = `${blockName}::${worker.workerID}-${worker.rowNumber}`;
    setExpandedFastWorkers((current) => ({ ...current, [key]: !current[key] }));
    if (current[key]) {
      setFastWorkerAction(null);
      setFastWorkersFeedback({ type: "info", message: "" });
    }
  }

  async function submitFastCheckout(worker) {
    setFastWorkersSubmitting(true);
    setFastWorkersFeedback({ type: "info", message: "" });
    try {
      const result = await api.regularCheckout({
        workerID: String(worker.workerID ?? ""),
        workerName: worker.workerName || "",
        blockName: worker.blockName || sharedState.selectedBlock || "",
        rowNumber: String(worker.rowNumber ?? ""),
        jobType: worker.jobType || "",
        stockCount: fastCheckoutStock === "" ? undefined : Number(fastCheckoutStock),
        keepCheckedIn: fastCheckoutKeep,
      });
      setFastWorkersFeedback({ type: "success", message: result.message });
      await totalsState.refresh();
      await hoursState.refresh();
      setTimeout(() => {
        setFastWorkerAction(null);
        setFastWorkersOpen(false);
      }, 900);
    } catch (error) {
      setFastWorkersFeedback({ type: "error", message: error.message });
    } finally {
      setFastWorkersSubmitting(false);
    }
  }

  async function submitFastMove(worker) {
    setFastWorkersSubmitting(true);
    setFastWorkersFeedback({ type: "info", message: "" });
    try {
      const result = await api.moveRegularWorker({
        workerID: String(worker.workerID ?? ""),
        workerName: worker.workerName || "",
        blockName: fastMoveTargetBlock || worker.blockName || sharedState.selectedBlock || "",
        fromRowNumber: String(worker.rowNumber ?? ""),
        toRowNumber: String(fastMoveTargetRow || worker.rowNumber || ""),
        jobType: worker.jobType || "",
      });
      setFastWorkersFeedback({ type: "success", message: result.message });
      await totalsState.refresh();
      setTimeout(() => {
        setFastWorkerAction(null);
        setFastWorkersOpen(false);
      }, 900);
    } catch (error) {
      setFastWorkersFeedback({ type: "error", message: error.message });
    } finally {
      setFastWorkersSubmitting(false);
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
          displayValue={
            sharedState.selectedRow
              ? `${sharedState.selectedRow}${selectedRowWorkerName ? ` — ${selectedRowWorkerName}` : ""}`
              : undefined
          }
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
            byVariety
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
          onPress={() => handleExport(false)}
          disabled={exporting || !hasFastData}
          tone="secondary"
        />
        <ActionButton
          label={exporting ? t("fast.preparingPdf") : t("fast.exportDownload")}
          onPress={() => handleExport(true)}
          disabled={exporting || !hasFastData}
          tone="primary"
        />
        <ActionButton
          label={exporting ? t("fast.preparingPdf") : t("fast.exportExcel")}
          onPress={handleExportExcel}
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

      <ActionButton
        label={t("fast.viewActiveWorkers")}
        onPress={() => {
          checkinsState.refresh();
          setFastWorkersOpen(true);
        }}
        disabled={false}
        tone="secondary"
      />

      <Modal visible={fastWorkersOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: "#111827", fontSize: 18, fontWeight: "800" }}>
              {t("fast.viewActiveWorkers")}
            </Text>
            <TouchableOpacity
              onPress={() => setFastWorkersOpen(false)}
              style={{
                borderRadius: 12,
                backgroundColor: "#f3f4f6",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          >
            {Object.keys(fastWorkersByBlock)
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .map((blockName) => {
                const workers = fastWorkersByBlock[blockName] || [];
                const isBlockExpanded = Boolean(expandedFastBlocks[blockName]);
                return (
                  <View key={blockName}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() =>
                        setExpandedFastBlocks((current) => ({
                          ...current,
                          [blockName]: !current[blockName],
                        }))
                      }
                      style={{
                        borderRadius: 14,
                        backgroundColor: "#F4F7F3",
                        borderWidth: 1,
                        borderColor: "#E5ECE4",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                        {blockName}
                      </Text>
                      <Text style={{ color: "#6b7280", fontSize: 11, fontWeight: "800" }}>
                        {isBlockExpanded ? "▾" : "▸"}
                      </Text>
                    </TouchableOpacity>
                    {isBlockExpanded ? (
                      <View>
                        {workers.map((worker) => {
                          const workerKey = `${blockName}::${worker.workerID}-${worker.rowNumber}`;
                          const isWorkerExpanded = Boolean(expandedFastWorkers[workerKey]);
                          return (
                            <View
                              key={workerKey}
                              style={{
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: "#eef2ef",
                                backgroundColor: "#fff",
                                padding: 12,
                              }}
                            >
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => toggleFastWorker(blockName, worker)}
                              >
                                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: "#111827", fontSize: 15, fontWeight: "800" }}>
                                      {worker.workerName}
                                    </Text>
                                    <Text style={{ marginTop: 2, fontSize: 13, color: "#9ca3af" }}>
                                      {t("ci.id", { id: worker.workerID })}
                                    </Text>
                                  </View>
                                  <View style={{ alignItems: "flex-end" }}>
                                    <Text style={{ color: "#2D7A55", fontSize: 13, fontWeight: "800" }}>
                                      {worker.jobType || t("common.noJob")}
                                    </Text>
                                    <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>
                                      {t("ci.row", { row: worker.rowNumber })}
                                    </Text>
                                    <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>
                                      {t("ci.vinesLine", { count: Number(worker.vines || 0) || 0 })}
                                    </Text>
                                  </View>
                                </View>
                              </TouchableOpacity>
                              {isWorkerExpanded ? (
                                <View
                                  style={{
                                    marginTop: 10,
                                    paddingTop: 10,
                                    borderTopWidth: 1,
                                    borderTopColor: "#f3f4f6",
                                  }}
                                >
                                  {fastWorkerAction === "checkout" ? (
                                    <View style={{ gap: 8 }}>
                                      <Text style={{ color: "#6b7280", fontSize: 12, fontWeight: "800" }}>
                                        {t("ci.stocksCompleted")}
                                      </Text>
                                      <TextInput
                                        value={fastCheckoutStock}
                                        onChangeText={setFastCheckoutStock}
                                        placeholder={t("ci.stocksPlaceholder")}
                                        placeholderTextColor="#9ca3af"
                                        keyboardType="numeric"
                                        style={{
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: "#e5e7eb",
                                          backgroundColor: "#fff",
                                          paddingHorizontal: 14,
                                          paddingVertical: 10,
                                          color: "#111827",
                                          fontSize: 15,
                                        }}
                                      />
                                      <View style={{ flexDirection: "row", gap: 8 }}>
                                        <TouchableOpacity
                                          activeOpacity={0.7}
                                          onPress={() => setFastCheckoutKeep(true)}
                                          style={{
                                            flex: 1,
                                            borderRadius: 12,
                                            paddingVertical: 10,
                                            alignItems: "center",
                                            backgroundColor: fastCheckoutKeep ? "#2D7A55" : "#E5ECE4",
                                            borderWidth: fastCheckoutKeep ? 0 : 1,
                                            borderColor: "#D4DFD3",
                                          }}
                                        >
                                          <Text style={{ color: fastCheckoutKeep ? "#fff" : "#374151", fontSize: 13, fontWeight: "800" }}>
                                            {t("ci.keepChoice", { remaining: Number(worker.vines || 0) || 0 })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setFastCheckoutKeep(false)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: "center",
                    backgroundColor: !fastCheckoutKeep ? "#2D7A55" : "#E5ECE4",
                    borderWidth: !fastCheckoutKeep ? 0 : 1,
                    borderColor: "#D4DFD3",
                  }}
                >
                  <Text style={{ color: !fastCheckoutKeep ? "#fff" : "#374151", fontSize: 13, fontWeight: "800" }}>
                    {t("ci.checkout")}
                  </Text>
                </TouchableOpacity>
              </View>
              <ActionButton
                label={t("common.submit")}
                onPress={() => submitFastCheckout(worker)}
                disabled={fastWorkersSubmitting}
                tone="primary"
              />
            </View>
          ) : null}
          {fastWorkerAction === "move" ? (
            <View style={{ gap: 8 }}>
              <SelectField
                label={t("ci.targetBlock")}
                value={fastMoveTargetBlock}
                placeholder={t("ci.selectBlock")}
                options={blockOptions}
                onSelect={(value) => {
                  setFastMoveTargetBlock(String(value));
                  setFastMoveTargetRow("");
                }}
                emptyMessage={t("common.noBlocksFound")}
              />
              {fastMoveTargetBlock ? (
                <SelectField
                  label={t("ci.targetRow")}
                  value={fastMoveTargetRow}
                  placeholder={t("ci.selectTargetRow")}
                  options={fastMoveRowOptions}
                  onSelect={(value) => {
                    setFastMoveTargetRow(String(value));
                  }}
                  emptyMessage={fastMoveRowsState.loading ? t("ci.loadingRows") : t("ci.noRowsAvailable")}
                />
              ) : null}
              {fastMoveTargetRow ? (
                <View
                  style={{
                    borderRadius: 12,
                    backgroundColor: "#F4F7F3",
                    borderWidth: 1,
                    borderColor: "#E5ECE4",
                    padding: 12,
                  }}
                >
                  <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                    {t("common.preview")}
                  </Text>
                  <Text style={{ marginTop: 4, color: "#4b5563", fontSize: 13, lineHeight: 18 }}>
                    {t("ci.willMoveFromTo", {
                      name: worker.workerName,
                      from: worker.rowNumber,
                      to: fastMoveTargetRow,
                      block: fastMoveTargetBlock,
                    })}
                  </Text>
                </View>
              ) : null}
              <ActionButton
                label={t("ci.moveWorker")}
                onPress={() => submitFastMove(worker)}
                disabled={fastWorkersSubmitting}
              />
            </View>
          ) : null}
          {fastWorkerAction ? null : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={fastWorkersSubmitting}
                onPress={() => {
                  setFastWorkerAction("checkout");
                  setFastCheckoutStock("");
                  setFastCheckoutKeep(true);
                  setFastWorkersFeedback({ type: "info", message: "" });
                }}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "#E5ECE4", borderWidth: 1, borderColor: "#D4DFD3" }}
              >
                <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                  {t("ci.checkout")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={fastWorkersSubmitting}
                onPress={() => {
                  setFastWorkerAction("move");
                  setFastMoveTargetBlock("");
                  setFastMoveTargetRow("");
                  setFastWorkersFeedback({ type: "info", message: "" });
                }}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "#E5ECE4", borderWidth: 1, borderColor: "#D4DFD3" }}
              >
                <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                  {t("ci.moveWorker")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            <FeedbackBanner type={fastWorkersFeedback.type} message={fastWorkersFeedback.message} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScreenScroll>
  );
}