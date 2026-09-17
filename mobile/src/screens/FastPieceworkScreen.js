import React, { useMemo, useState } from "react";
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
import { sortNamesNumerically } from "../utils/sortNames";

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
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [allowSameJob, setAllowSameJob] = useState(false);
  const [blockFilter, setBlockFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");

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
      ? `${rowNumber} — completed for ${selectedJob}`
      : rowNumber,
    value: rowNumber,
  }));

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
        title="Fast piecework"
        subtitle="Single-scan jobs: leaf picking, sucker removal, shoot thinning, other."
      >
        <Text className="text-gray-600 text-sm leading-5">
          Block: {sharedState.selectedBlock || "Not selected"}{"  "}
          Row: {sharedState.selectedRow || "Not selected"}
        </Text>
      </SectionCard>

      <SectionCard
        title="Selection"
        subtitle="Pick the block and row, then scan the worker. Rows already completed for the selected job will be disabled."
      >
        <LabeledInput
          label="Job type"
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
          label="Block"
          value={sharedState.selectedBlock}
          placeholder="Select block"
          options={blockOptions}
          onSelect={(value) => {
            sharedState.setSelectedBlock(value);
            sharedState.setSelectedRow("");
            setAllowSameJob(false);
          }}
          emptyMessage="No blocks found"
        />
        <SelectField
          label="Row"
          value={sharedState.selectedRow}
          placeholder="Select row"
          options={rowOptions}
          onSelect={(value) => {
            sharedState.setSelectedRow(value);
            setAllowSameJob(false);
          }}
          emptyMessage={
            sharedState.selectedBlock
              ? "No rows available in this block"
              : "Select a block first"
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
              Allow same fast job on a completed row
            </Text>
          </TouchableOpacity>
        )}
        <FeedbackBanner type="error" message={blocksState.error || rowsState.error || blockDetailsState.error} />
      </SectionCard>

      <SectionCard
        title="Fast check-in"
        subtitle="Uses the selected block and row from above."
      >
        <WorkerSuggestionInput
          label="Worker ID"
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
          label="Worker name"
          value={form.workerName}
          onChangeText={(value) => setForm((current) => ({ ...current, workerName: value }))}
          placeholder="Auto-filled from scan or selection"
          autoCapitalize="words"
          readOnly
        />
        <ActionButton
          label={submitting ? "Submitting..." : "Submit fast piecework"}
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
        title="Fast totals"
        subtitle="Day-by-day fast piecework summary for wage calculations. Scroll horizontally and tap a cell to record hours worked."
      >
        {fastRows.length > 0 ? (
          <TotalsSummary rows={filteredFastRows} hours={dayHours} />
        ) : null}
        {fastRows.length > 0 ? (
          <SelectField
            label="Filter block"
            value={blockFilter}
            placeholder="All blocks"
            options={fastBlockOptions}
            onSelect={(v) => setBlockFilter(v)}
            emptyMessage="No blocks found"
          />
        ) : null}
        {blockFilter ? (
          <Text
            onPress={() => setBlockFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 8 }}
          >
            Clear block filter
          </Text>
        ) : null}
        {fastRows.length > 0 ? (
          <SelectField
            label="Filter job type"
            value={jobFilter}
            placeholder="All jobs"
            options={fastJobOptions}
            onSelect={(v) => setJobFilter(v)}
            emptyMessage="No job types found"
          />
        ) : null}
        {jobFilter ? (
          <Text
            onPress={() => setJobFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 4 }}
          >
            Clear job filter
          </Text>
        ) : null}
        {!isFiltered && !fastRows.length && !totalsState.loading ? (
          <Text style={{ color: "#9ca3af", fontSize: 14 }}>
            No fast piecework totals available yet.
          </Text>
        ) : null}
        {isFiltered && !hasFastData && !totalsState.loading ? (
          <Text style={{ color: "#9ca3af", fontSize: 14 }}>
            No totals match the selected filters.
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
            emptyMessage="No fast piecework totals match the current filters."
          />
        ) : null}
        <FeedbackBanner type="error" message={totalsState.error || hoursState.error} />
      </SectionCard>
    </ScreenScroll>
  );
}