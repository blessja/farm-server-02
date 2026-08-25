import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import SelectField from "../components/SelectField";
import { useAsyncData } from "../hooks/useAsyncData";

const NAME_COL_WIDTH = 140;
const ID_COL_WIDTH = 48;
const DAY_COL_WIDTH = 72;
const TOTAL_COL_WIDTH = 64;
const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 40;

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(dateStr) {
  if (!dateStr) return "?";
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const num = d.getDate();
  return `${day} ${num}`;
}

function monthLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function StatPill({ label, value, color }) {
  return (
    <View
      style={{
        backgroundColor: color || "#f0fdf4",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: "center",
        minWidth: 80,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827" }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "#6b7280", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}

function HeaderCell({ children, width, style }) {
  return (
    <View
      style={{
        width,
        height: HEADER_HEIGHT,
        justifyContent: "center",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function DataCell({ children, width, style }) {
  return (
    <View
      style={{
        width,
        height: ROW_HEIGHT,
        justifyContent: "center",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </View>
  );
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

  const { workerOrder, dateOrder, matrix, dateLabels } = useMemo(() => {
    const wMap = {};
    const dMap = {};
    const matrix = {};

    filteredRows.forEach((r) => {
      const dk = dateKey(r.date);
      const wk = r.workerID;
      const key = `${wk}__${dk}`;

      if (!wMap[wk]) wMap[wk] = { workerID: wk, workerName: r.workerName };
      if (!dMap[dk]) dMap[dk] = r.date;

      if (!matrix[key]) matrix[key] = { vines: 0, timeSpent: 0 };
      matrix[key].vines += r.vines;
      matrix[key].timeSpent += r.timeSpent;
    });

    const workerOrder = Object.values(wMap).sort((a, b) =>
      a.workerName.localeCompare(b.workerName)
    );

    const dateOrder = Object.keys(dMap).sort((a, b) => b.localeCompare(a));

    const dateLabels = {};
    dateOrder.forEach((dk) => {
      dateLabels[dk] = dayLabel(dMap[dk]);
    });

    return { workerOrder, dateOrder, matrix, dateLabels };
  }, [filteredRows]);

  const columnTotals = useMemo(() => {
    const totals = {};
    dateOrder.forEach((dk) => {
      totals[dk] = 0;
    });
    filteredRows.forEach((r) => {
      const dk = dateKey(r.date);
      if (totals[dk] !== undefined) totals[dk] += r.vines;
    });
    return totals;
  }, [filteredRows, dateOrder]);

  const workerTotals = useMemo(() => {
    const totals = {};
    filteredRows.forEach((r) => {
      if (!totals[r.workerID]) totals[r.workerID] = 0;
      totals[r.workerID] += r.vines;
    });
    return totals;
  }, [filteredRows]);

  const grandTotal = filteredRows.reduce((s, r) => s + r.vines, 0);
  const uniqueWorkers = new Set(filteredRows.map((r) => r.workerID)).size;
  const grandTotalTime = filteredRows.reduce((s, r) => s + r.timeSpent, 0);

  const isFiltered = blockFilter || jobFilter;
  const hasData = workerOrder.length > 0 && dateOrder.length > 0;

  return (
    <ScreenScroll
      refreshing={loading}
      onRefresh={() => {
        regularState.refresh();
        fastState.refresh();
      }}
    >
      <SectionCard title="Totals" subtitle="Day-by-day piecework summary.">
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <StatPill label="Workers" value={uniqueWorkers} color="#eff6ff" />
          <StatPill label="Vines" value={grandTotal} color="#f0fdf4" />
          <StatPill label="Days" value={dateOrder.length} color="#fefce8" />
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
        <SectionCard title="Vines by worker and day" subtitle="Scroll horizontally to see all dates.">
          <View
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "#fff",
            }}
          >
            <View style={{ flexDirection: "row" }}>
              {/* ── FROZEN WORKER COLUMNS (NAME + ID) ── */}
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: "#fff",
                  borderRightWidth: 2,
                  borderRightColor: "#9ca3af",
                }}
              >
                <View style={{ width: ID_COL_WIDTH }}>
                  <View
                    style={{
                      height: HEADER_HEIGHT,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "#f9fafb",
                      borderBottomWidth: 1,
                      borderBottomColor: "#e5e7eb",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      ID
                    </Text>
                  </View>

                  {workerOrder.map((w, idx) => {
                    const rowBg = idx % 2 === 0 ? "#fff" : "#f9fafb";

                    return (
                      <View
                        key={w.workerID}
                        style={{
                          height: ROW_HEIGHT,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: rowBg,
                          borderBottomWidth: 1,
                          borderBottomColor: "#f3f4f6",
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: "#6b7280" }}>
                          {String(w.workerID)}
                        </Text>
                      </View>
                    );
                  })}

                  <View
                    style={{
                      height: ROW_HEIGHT,
                      backgroundColor: "#f0fdf4",
                      borderTopWidth: 2,
                      borderTopColor: "#16a34a",
                    }}
                  />
                </View>

                <View style={{ width: NAME_COL_WIDTH, borderLeftWidth: 1, borderLeftColor: "#e5e7eb" }}>
                  <View
                    style={{
                      height: HEADER_HEIGHT,
                      justifyContent: "center",
                      paddingLeft: 14,
                      backgroundColor: "#f9fafb",
                      borderBottomWidth: 1,
                      borderBottomColor: "#e5e7eb",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Worker
                    </Text>
                  </View>

                  {workerOrder.map((w, idx) => {
                    const rowBg = idx % 2 === 0 ? "#fff" : "#f9fafb";

                    return (
                      <View
                        key={w.workerID}
                        style={{
                          height: ROW_HEIGHT,
                          justifyContent: "center",
                          paddingLeft: 14,
                          backgroundColor: rowBg,
                          borderBottomWidth: 1,
                          borderBottomColor: "#f3f4f6",
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>
                          {w.workerName}
                        </Text>
                      </View>
                    );
                  })}

                  <View
                    style={{
                      height: ROW_HEIGHT,
                      justifyContent: "center",
                      paddingLeft: 14,
                      backgroundColor: "#f0fdf4",
                      borderTopWidth: 2,
                      borderTopColor: "#16a34a",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#16a34a", textTransform: "uppercase", letterSpacing: 0.3 }}>
                      Total
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── SCROLLABLE DATE + TOTAL COLUMNS ── */}
              <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
                <View>
                  {/* ── HEADER ROW ── */}
                  <View style={{ flexDirection: "row", height: HEADER_HEIGHT, backgroundColor: "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
                    {dateOrder.map((dk) => (
                      <HeaderCell key={dk} width={DAY_COL_WIDTH}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#374151", textAlign: "center" }}>
                          {dateLabels[dk]}
                        </Text>
                      </HeaderCell>
                    ))}

                    <HeaderCell width={TOTAL_COL_WIDTH} style={{ backgroundColor: "#f0fdf4", borderRightWidth: 0 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#16a34a", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Total
                      </Text>
                    </HeaderCell>
                  </View>

                  {/* ── DATA ROWS ── */}
                  {workerOrder.map((w, idx) => {
                    const rowBg = idx % 2 === 0 ? "#fff" : "#f9fafb";
                    const wTotal = workerTotals[w.workerID] || 0;

                    return (
                      <View
                        key={w.workerID}
                        style={{
                          flexDirection: "row",
                          height: ROW_HEIGHT,
                          backgroundColor: rowBg,
                          borderBottomWidth: 1,
                          borderBottomColor: "#f3f4f6",
                        }}
                      >
                        {dateOrder.map((dk) => {
                          const key = `${w.workerID}__${dk}`;
                          const cell = matrix[key];
                          const vines = cell ? cell.vines : 0;

                          return (
                            <DataCell key={dk} width={DAY_COL_WIDTH}>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: vines > 0 ? "700" : "400",
                                  color: vines > 0 ? "#111827" : "#d1d5db",
                                }}
                              >
                                {vines > 0 ? vines : "—"}
                              </Text>
                            </DataCell>
                          );
                        })}

                        <DataCell width={TOTAL_COL_WIDTH} style={{ backgroundColor: "#f0fdf4", borderRightWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: "#16a34a" }}>
                            {wTotal}
                          </Text>
                        </DataCell>
                      </View>
                    );
                  })}

                  {/* ── TOTAL ROW ── */}
                  <View
                    style={{
                      flexDirection: "row",
                      height: ROW_HEIGHT,
                      backgroundColor: "#f0fdf4",
                      borderTopWidth: 2,
                      borderTopColor: "#16a34a",
                    }}
                  >
                    {dateOrder.map((dk) => (
                      <DataCell key={dk} width={DAY_COL_WIDTH}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: "#16a34a" }}>
                          {columnTotals[dk] || 0}
                        </Text>
                      </DataCell>
                    ))}

                    <DataCell width={TOTAL_COL_WIDTH} style={{ backgroundColor: "#dcfce7", borderRightWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#15803d" }}>
                        {grandTotal}
                      </Text>
                    </DataCell>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </SectionCard>
      ) : null}
    </ScreenScroll>
  );
}
