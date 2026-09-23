import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import SelectField from "../components/SelectField";
import ActionButton from "../components/ActionButton";
import TotalsGrid from "../components/TotalsGrid";
import TotalsSummary from "../components/TotalsSummary";
import { exportTotalsPdf } from "../utils/totalsExport";
import { sortNamesNumerically } from "../utils/sortNames";
import { useAsyncData } from "../hooks/useAsyncData";
import { useLanguage } from "../i18n";

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TotalsScreen() {
  const { t } = useLanguage();
  const regularState = useAsyncData(() => api.getRegularTotals(), [], {
    cacheKey: "regular-totals",
    staleTime: 5 * 60 * 1000,
  });

  const fastState = useAsyncData(() => api.getFastTotals(), [], {
    cacheKey: "fast-totals",
    staleTime: 5 * 60 * 1000,
  });

  const hoursState = useAsyncData(() => api.getDayHours(), [], {
    cacheKey: "day-hours",
    staleTime: 2 * 60 * 1000,
  });

  const loading = regularState.loading && fastState.loading;

  const [blockFilter, setBlockFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [rowFilter, setRowFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);

  const allRows = useMemo(() => {
    const rows = [];

    const regularWorkers = Array.isArray(regularState.data?.workers)
      ? regularState.data.workers
      : Array.isArray(regularState.data)
        ? regularState.data
        : [];

    regularWorkers.forEach((w) => {
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
          source: "regular",
        });
      });
    });

    const fastWorkers = Array.isArray(fastState.data?.workers)
      ? fastState.data.workers
      : Array.isArray(fastState.data)
        ? fastState.data
        : [];

    fastWorkers.forEach((w) => {
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
          source: "fast",
        });
      });
    });

    return rows;
  }, [regularState.data, fastState.data]);

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

  const blockOptions = useMemo(() => {
    const names = [...new Set(allRows.map((r) => r.blockName).filter(Boolean))].sort();
    return names.map((n) => ({ label: n, value: n }));
  }, [allRows]);

  const jobOptions = useMemo(() => {
    const types = [...new Set(allRows.map((r) => r.jobType).filter(Boolean))].sort();
    return types.map((t) => ({ label: t, value: t }));
  }, [allRows]);

  const rowOptions = useMemo(() => {
    const scopeRows = blockFilter
      ? allRows.filter((r) => r.blockName === blockFilter)
      : allRows;
    const numbers = sortNamesNumerically([
      ...new Set(scopeRows.map((r) => String(r.rowNumber)).filter(Boolean)),
    ]);
    return numbers.map((n) => ({ label: n, value: n }));
  }, [allRows, blockFilter]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (blockFilter && r.blockName !== blockFilter) return false;
      if (jobFilter && r.jobType !== jobFilter) return false;
      if (rowFilter && String(r.rowNumber) !== String(rowFilter)) return false;
      return true;
    });
  }, [allRows, blockFilter, jobFilter, rowFilter]);

  const isFiltered = blockFilter || jobFilter || rowFilter;
  const hasData = filteredRows.length > 0;

  async function handleExport() {
    if (exporting || !hasData) return;
    setExporting(true);
    setExportMessage(null);
    try {
      await exportTotalsPdf({
        rows: filteredRows,
        hours: dayHours,
        blockFilter,
        jobFilter,
        rowFilter,
      });
      setExportMessage({ text: t("totals.pdfCreated"), ok: true });
    } catch (error) {
      setExportMessage({
        text: error?.message || t("totals.pdfError"),
        ok: false,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScreenScroll
      refreshing={loading}
      onRefresh={() => {
        regularState.refresh();
        fastState.refresh();
        hoursState.refresh();
      }}
    >
      <SectionCard title={t("totals.title")} subtitle={t("totals.subtitle")}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <TotalsSummary rows={filteredRows} hours={dayHours} />
        </View>
      </SectionCard>

      <SectionCard title={t("totals.filters")}>
        <SelectField
          label={t("dw.block")}
          value={blockFilter}
          placeholder={t("totals.allBlocks")}
          options={blockOptions}
          onSelect={(v) => setBlockFilter(v)}
          emptyMessage={t("common.noBlocksFound")}
        />
        {blockFilter ? (
          <Text
            onPress={() => setBlockFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 8 }}
          >
            {t("totals.clearBlockFilter")}
          </Text>
        ) : null}
        <SelectField
          label={t("dw.jobType")}
          value={jobFilter}
          placeholder={t("totals.allJobs")}
          options={jobOptions}
          onSelect={(v) => setJobFilter(v)}
          emptyMessage={t("totals.noJobTypesFound")}
        />
        {jobFilter ? (
          <Text
            onPress={() => setJobFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 4 }}
          >
            {t("totals.clearJobFilter")}
          </Text>
        ) : null}
        <SelectField
          label={t("dw.row")}
          value={rowFilter}
          placeholder={t("totals.allRows")}
          options={rowOptions}
          onSelect={(v) => setRowFilter(v)}
          emptyMessage={t("totals.noRowsFound")}
        />
        {rowFilter ? (
          <Text
            onPress={() => setRowFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 4 }}
          >
            {t("totals.clearRowFilter")}
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard
        title={t("totals.export")}
        subtitle={t("totals.exportSub")}
      >
        <ActionButton
          label={exporting ? t("totals.preparingPdf") : t("totals.exportPdf")}
          onPress={handleExport}
          disabled={exporting || !hasData}
          tone="secondary"
        />
        {!hasData ? (
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            {t("totals.addTotalsFirst")}
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

      {!hasData && !loading ? (
        <SectionCard title={t("totals.noData")}>
          <Text style={{ color: "#9ca3af", fontSize: 14 }}>
            {isFiltered ? t("totals.noDataFiltered") : t("grid.noTotalsAvailable")}
          </Text>
        </SectionCard>
      ) : null}

      {hasData ? (
        <SectionCard title={t("totals.gridTitle")} subtitle={t("totals.gridSub")}>
          <TotalsGrid
            rows={filteredRows}
            hours={dayHours}
            editable
            onHoursChanged={() => hoursState.refresh()}
          />
        </SectionCard>
      ) : null}
    </ScreenScroll>
  );
}