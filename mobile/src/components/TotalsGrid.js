import React, { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";
import ActionButton from "./ActionButton";
import FeedbackBanner from "./FeedbackBanner";

const NAME_COL_WIDTH = 140;
const ID_COL_WIDTH = 48;
const DAY_COL_WIDTH = 76;
const TOTAL_COL_WIDTH = 64;
const ROW_HEIGHT = 46;
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

function formatHours(value) {
  if (!value || value <= 0) return "";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
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

/**
 * A worker x day piecework matrix (same look as the Day Totals table).
 * Rows: [{ workerID, workerName, blockName, rowNumber, vines, date, jobType, timeSpent }]
 * hours: { `${workerID}__${dateKey}`: { hours } } - shows hours under each cell when provided.
 */
export default function TotalsGrid({
  rows = [],
  hours = {},
  editable = true,
  onHoursChanged,
  emptyMessage = "No piecework totals available yet.",
}) {
  const [hoursModal, setHoursModal] = useState(null);
  const [hoursInput, setHoursInput] = useState("");
  const [hoursFeedback, setHoursFeedback] = useState({ type: "info", message: "" });
  const [hoursSaving, setHoursSaving] = useState(false);

  const { workerOrder, dateOrder, matrix, dateLabels } = useMemo(() => {
    const wMap = {};
    const dMap = {};
    const matrix = {};

    rows.forEach((r) => {
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
  }, [rows]);

  const columnTotals = useMemo(() => {
    const totals = {};
    dateOrder.forEach((dk) => {
      totals[dk] = 0;
    });
    rows.forEach((r) => {
      const dk = dateKey(r.date);
      if (totals[dk] !== undefined) totals[dk] += r.vines;
    });
    return totals;
  }, [rows, dateOrder]);

  const columnHours = useMemo(() => {
    const totals = {};
    dateOrder.forEach((dk) => {
      totals[dk] = 0;
    });
    Object.keys(hours).forEach((key) => {
      const dk = key.split("__")[1];
      if (totals[dk] !== undefined) totals[dk] += hours[key].hours;
    });
    return totals;
  }, [hours, dateOrder]);

  const workerTotals = useMemo(() => {
    const totals = {};
    rows.forEach((r) => {
      if (!totals[r.workerID]) totals[r.workerID] = 0;
      totals[r.workerID] += r.vines;
    });
    return totals;
  }, [rows]);

  const workerHoursTotals = useMemo(() => {
    const totals = {};
    Object.keys(hours).forEach((key) => {
      const workerID = key.split("__")[0];
      if (!totals[workerID]) totals[workerID] = 0;
      totals[workerID] += hours[key].hours;
    });
    return totals;
  }, [hours]);

  const grandTotal = rows.reduce((s, r) => s + r.vines, 0);
  const grandTotalHours = Object.keys(hours).reduce(
    (s, key) => s + hours[key].hours,
    0
  );

  const hasData = workerOrder.length > 0 && dateOrder.length > 0;

  function handleCellPress(worker, dk) {
    if (!editable) return;
    const existing = hours[`${worker.workerID}__${dk}`];
    setHoursModal({
      workerID: worker.workerID,
      workerName: worker.workerName,
      dateKey: dk,
      dateLabel: dateLabels[dk] || dk,
    });
    setHoursInput(existing ? String(existing.hours) : "");
    setHoursFeedback({ type: "info", message: "" });
  }

  async function handleSaveHours() {
    if (!hoursModal) return;
    const trimmed = hoursInput.trim();
    const value = Number(trimmed);
    if (trimmed === "" || Number.isNaN(value) || value < 0) {
      setHoursFeedback({
        type: "error",
        message: "Enter a valid number of hours (0 or more).",
      });
      return;
    }

    setHoursSaving(true);
    setHoursFeedback({ type: "info", message: "" });

    try {
      const result = await api.saveDayHours({
        workerID: hoursModal.workerID,
        workerName: hoursModal.workerName,
        date: hoursModal.dateKey,
        hours: Math.round(value * 100) / 100,
      });
      setHoursFeedback({ type: "success", message: result.message });
      onHoursChanged?.();
      setHoursModal(null);
    } catch (error) {
      setHoursFeedback({ type: "error", message: error.message });
    } finally {
      setHoursSaving(false);
    }
  }

  async function handleClearHours() {
    if (!hoursModal) return;
    setHoursSaving(true);
    setHoursFeedback({ type: "info", message: "" });

    try {
      const result = await api.deleteDayHours({
        workerID: hoursModal.workerID,
        date: hoursModal.dateKey,
      });
      setHoursFeedback({ type: "success", message: result.message });
      onHoursChanged?.();
      setHoursModal(null);
    } catch (error) {
      setHoursFeedback({ type: "error", message: error.message });
    } finally {
      setHoursSaving(false);
    }
  }

  if (!hasData) {
    return (
      <View style={{ borderRadius: 12, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#f3f4f6", padding: 16 }}>
        <Text style={{ color: "#9ca3af", fontSize: 14 }}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <>
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
                const wHours = workerHoursTotals[w.workerID] || 0;
                const rate = wHours > 0 ? Math.round((wTotal / wHours) * 10) / 10 : 0;

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
                      const cellHours = (hours[key]?.hours) || 0;
                      const hoursText = formatHours(cellHours);

                      return (
                        <TouchableOpacity
                          key={dk}
                          activeOpacity={editable ? 0.6 : 1}
                          disabled={!editable}
                          onPress={() => handleCellPress(w, dk)}
                          style={{
                            width: DAY_COL_WIDTH,
                            height: ROW_HEIGHT,
                            justifyContent: "center",
                            alignItems: "center",
                            borderRightWidth: 1,
                            borderRightColor: "#f3f4f6",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: vines > 0 ? "700" : "400",
                              color: vines > 0 ? "#111827" : "#d1d5db",
                            }}
                          >
                            {vines > 0 ? vines : "—"}
                          </Text>
                          {editable ? (
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: cellHours > 0 ? "700" : "400",
                                color: cellHours > 0 ? "#16a34a" : "#e5e7eb",
                                marginTop: 1,
                              }}
                            >
                              {hoursText || "+ hrs"}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}

                    <DataCell width={TOTAL_COL_WIDTH} style={{ backgroundColor: "#f0fdf4", borderRightWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: "#16a34a" }}>
                        {wTotal}
                      </Text>
                      {rate > 0 ? (
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#15803d", marginTop: 1 }}>
                          {rate}/hr
                        </Text>
                      ) : null}
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
                    {columnHours[dk] > 0 ? (
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#15803d", marginTop: 1 }}>
                        {formatHours(columnHours[dk])}
                      </Text>
                    ) : null}
                  </DataCell>
                ))}

                <DataCell width={TOTAL_COL_WIDTH} style={{ backgroundColor: "#dcfce7", borderRightWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#15803d" }}>
                    {grandTotal}
                  </Text>
                  {grandTotalHours > 0 ? (
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#15803d", marginTop: 1 }}>
                      {formatHours(grandTotalHours)}
                    </Text>
                  ) : null}
                </DataCell>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ─── Hours Editor Modal ─── */}
      <Modal
        visible={!!hoursModal}
        transparent
        animationType="fade"
        onRequestClose={() => setHoursModal(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 24, backgroundColor: "#fff", padding: 24, gap: 16 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>
                Edit hours worked
              </Text>
              <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>
                <Text style={{ fontWeight: "800" }}>{hoursModal?.workerName}</Text> (ID{" "}
                {hoursModal?.workerID}) on {hoursModal?.dateLabel}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: "#4b5563", fontSize: 12, fontWeight: "700" }}>
                Hours worked
              </Text>
              <TextInput
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  backgroundColor: "#fff",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                }}
                value={hoursInput}
                onChangeText={setHoursInput}
                placeholder="e.g. 7.5"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <FeedbackBanner
              type={hoursFeedback.type === "error" ? "error" : "success"}
              message={hoursFeedback.message}
            />

            <View style={{ gap: 10 }}>
              <ActionButton
                label={hoursSaving ? "Saving..." : "Save hours"}
                onPress={handleSaveHours}
                disabled={hoursSaving}
              />
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
                disabled={hoursSaving}
                onPress={handleClearHours}
              >
                <Text style={{ color: "#6b7280", fontSize: 15, fontWeight: "800" }}>
                  Clear hours
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                style={{
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "#f3f4f6",
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                }}
                onPress={() => setHoursModal(null)}
              >
                <Text style={{ color: "#374151", fontSize: 15, fontWeight: "800" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}