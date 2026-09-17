import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import SelectField from "../components/SelectField";
import TotalsGrid from "../components/TotalsGrid";
import TotalsSummary from "../components/TotalsSummary";
import { useAsyncData } from "../hooks/useAsyncData";

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TotalsScreen() {
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

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (blockFilter && r.blockName !== blockFilter) return false;
      if (jobFilter && r.jobType !== jobFilter) return false;
      return true;
    });
  }, [allRows, blockFilter, jobFilter]);

  const isFiltered = blockFilter || jobFilter;
  const hasData = filteredRows.length > 0;

  return (
    <ScreenScroll
      refreshing={loading}
      onRefresh={() => {
        regularState.refresh();
        fastState.refresh();
        hoursState.refresh();
      }}
    >
      <SectionCard title="Totals" subtitle="Day-by-day piecework summary. Tap any cell to add or edit hours worked for that day.">
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <TotalsSummary rows={filteredRows} hours={dayHours} />
        </View>
      </SectionCard>

      <SectionCard title="Filters">
        <SelectField
          label="Block"
          value={blockFilter}
          placeholder="All blocks"
          options={blockOptions}
          onSelect={(v) => setBlockFilter(v)}
          emptyMessage="No blocks found"
        />
        {blockFilter ? (
          <Text
            onPress={() => setBlockFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 8 }}
          >
            Clear block filter
          </Text>
        ) : null}
        <SelectField
          label="Job type"
          value={jobFilter}
          placeholder="All jobs"
          options={jobOptions}
          onSelect={(v) => setJobFilter(v)}
          emptyMessage="No job types found"
        />
        {jobFilter ? (
          <Text
            onPress={() => setJobFilter("")}
            style={{ color: "#16a34a", fontSize: 13, fontWeight: "700", marginTop: -4, marginBottom: 4 }}
          >
            Clear job filter
          </Text>
        ) : null}
      </SectionCard>

      {!hasData && !loading ? (
        <SectionCard title="No data">
          <Text style={{ color: "#9ca3af", fontSize: 14 }}>
            {isFiltered ? "No totals match the selected filters." : "No piecework totals available yet."}
          </Text>
        </SectionCard>
      ) : null}

      {hasData ? (
        <SectionCard title="Vines and hours by worker and day" subtitle="Scroll horizontally to see all dates. Tap a cell to record hours worked.">
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