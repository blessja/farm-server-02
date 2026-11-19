import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import SelectField from "../components/SelectField";
import LabeledInput from "../components/LabeledInput";
import { useAsyncData } from "../hooks/useAsyncData";

const NAME_COL_WIDTH = 150;
const ID_COL_WIDTH = 50;
const DAY_COL_WIDTH = 130;
const TOTAL_COL_WIDTH = 90;
const ROW_HEIGHT = 58;
const HEADER_HEIGHT = 42;

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(0, 10) || "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localDateKey(offsetDays = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(dateStr) {
  if (!dateStr) return "?";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(5, 10);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${d.getDate()}`;
}
function labelForKey(dk) {
  if (!dk || dk === "unknown") return "?";
  // dk is yyyy-mm-dd
  const d = new Date(`${dk}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dk;
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${d.getDate()}`;
}
function fmt(n) {
  const v = Number(n) || 0;
  if (v === 0) return "0";
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

export default function UitknipHoursScreen({ supervisorName }) {
  const totalsState = useAsyncData(() => api.getUitknipHoursTotals(), [], { cacheKey: `uitknip-hours-totals:${supervisorName || ""}`, staleTime: 60 * 1000 });
  const hoursState = useAsyncData(() => api.getUitknipIntervalHours(), [], { cacheKey: `uitknip-interval-hours:${supervisorName || ""}`, staleTime: 60 * 1000 });

  const [editModal, setEditModal] = useState(null);
  const [h1Input, setH1Input] = useState("");
  const [h2Input, setH2Input] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });

  const [bulkDateKey, setBulkDateKey] = useState("__all__");
  const [bulkH1, setBulkH1] = useState("");
  const [bulkH2, setBulkH2] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState({ type: "info", message: "" });

  const allRows = useMemo(() => {
    const workers = Array.isArray(totalsState.data?.workers) ? totalsState.data.workers : [];
    const rows = [];
    workers.forEach((w) => {
      (w.rows || []).forEach((r) => {
        rows.push({
          workerID: w.workerID,
          workerName: w.workerName,
          blockName: r.blockName,
          rowNumber: r.rowNumber,
          vines: Number(r.vines) || 0,
          date: r.date,
          jobType: String(r.jobType || "UITKNIP").toUpperCase(),
        });
      });
    });
    return rows;
  }, [totalsState.data]);

  const hoursMap = useMemo(() => {
    const map = {};
    (Array.isArray(hoursState.data) ? hoursState.data : []).forEach((e) => {
      const dk = e.date;
      const key = `${e.workerID}__${dk}`;
      map[key] = {
        interval1Hours: Number(e.interval1Hours) || 0,
        interval2Hours: Number(e.interval2Hours) || 0,
        workerName: e.workerName || "",
      };
    });
    return map;
  }, [hoursState.data]);

  const { workerOrder, dateOrder, vineMatrix, dateLabels } = useMemo(() => {
    const wMap = {};
    const dMap = {};
    const matrix = {};
    allRows.forEach((r) => {
      const dk = dateKey(r.date);
      const wk = String(r.workerID);
      const key = `${wk}__${dk}`;
      if (!wMap[wk]) wMap[wk] = { workerID: wk, workerName: r.workerName };
      if (!dMap[dk]) dMap[dk] = r.date;
      if (!matrix[key]) matrix[key] = 0;
      matrix[key] += r.vines;
    });
    // Always include today and at least 3 days ahead so morning hours can be entered in advance
    const alwaysDates = [localDateKey(0), localDateKey(1), localDateKey(2), localDateKey(3)];
    alwaysDates.forEach((dk) => {
      if (dk && !dMap[dk]) dMap[dk] = `${dk}T12:00:00`;
    });

    const dateOrder = Object.keys(dMap).sort((a, b) => a.localeCompare(b));
    const workerOrder = Object.values(wMap).sort((a, b) => {
      const total = (id) => dateOrder.reduce((s, dk) => s + (matrix[`${id}__${dk}`] || 0), 0);
      const diff = total(b.workerID) - total(a.workerID);
      if (diff !== 0) return diff;
      return String(a.workerName).localeCompare(String(b.workerName));
    });
    const dateLabels = {};
    dateOrder.forEach((dk) => { dateLabels[dk] = labelForKey(dk); });
    return { workerOrder, dateOrder, vineMatrix: matrix, dateLabels };
  }, [allRows]);

  useEffect(() => {
    if (!dateOrder.length) return;
    setBulkDateKey((current) => {
      if (current === "__all__") return current;
      return dateOrder.includes(current) ? current : "__all__";
    });
  }, [dateOrder]);

  function getHours(wk, dk) {
    const h = hoursMap[`${wk}__${dk}`];
    return { i1: h?.interval1Hours || 0, i2: h?.interval2Hours || 0 };
  }
  function workerTotalHours(wk) {
    return dateOrder.reduce((s, dk) => {
      const h = getHours(wk, dk);
      return s + h.i1 + h.i2;
    }, 0);
  }
  function grandTotalHours() {
    return workerOrder.reduce((s, w) => s + workerTotalHours(w.workerID), 0);
  }

  function openEdit(worker, dk) {
    const h = getHours(worker.workerID, dk);
    setEditModal({ workerID: worker.workerID, workerName: worker.workerName, dateKey: dk, dateLabel: dateLabels[dk] || dk });
    setH1Input(h.i1 ? String(h.i1) : "");
    setH2Input(h.i2 ? String(h.i2) : "");
    setFeedback({ type: "info", message: "" });
  }

  async function saveHours() {
    if (!editModal) return;
    const v1 = h1Input.trim() === "" ? 0 : Number(h1Input);
    const v2 = h2Input.trim() === "" ? 0 : Number(h2Input);
    if ([v1, v2].some((v) => Number.isNaN(v) || v < 0)) {
      setFeedback({ type: "error", message: "Enter valid non-negative hours for both intervals." });
      return;
    }
    setSaving(true);
    setFeedback({ type: "info", message: "" });
    try {
      await api.saveUitknipIntervalHours({
        workerID: editModal.workerID,
        workerName: editModal.workerName,
        date: editModal.dateKey,
        interval1Hours: Math.round(v1 * 100) / 100,
        interval2Hours: Math.round(v2 * 100) / 100,
      });
      setFeedback({ type: "success", message: "Hours saved." });
      await hoursState.refresh();
      setEditModal(null);
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Could not save hours." });
    } finally {
      setSaving(false);
    }
  }

  async function clearHours() {
    if (!editModal) return;
    setSaving(true);
    setFeedback({ type: "info", message: "" });
    try {
      await api.deleteUitknipIntervalHours({ workerID: editModal.workerID, date: editModal.dateKey });
      await hoursState.refresh();
      setEditModal(null);
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Could not clear hours." });
    } finally {
      setSaving(false);
    }
  }

  async function applyBulkHours() {
    if (!workerOrder.length || !dateOrder.length) {
      setBulkFeedback({ type: "error", message: "No workers/dates available to update." });
      return;
    }
    const v1 = bulkH1.trim() === "" ? 0 : Number(bulkH1);
    const v2 = bulkH2.trim() === "" ? 0 : Number(bulkH2);
    if ([v1, v2].some((v) => Number.isNaN(v) || v < 0)) {
      setBulkFeedback({ type: "error", message: "Enter valid non-negative hours for both intervals." });
      return;
    }
    const targetDates = bulkDateKey === "__all__" ? dateOrder : [bulkDateKey];
    if (!targetDates.length) {
      setBulkFeedback({ type: "error", message: "Select a date to apply hours." });
      return;
    }
    const i1 = Math.round(v1 * 100) / 100;
    const i2 = Math.round(v2 * 100) / 100;
    setBulkSaving(true);
    setBulkFeedback({ type: "info", message: "" });
    try {
      for (const dk of targetDates) {
        const entries = workerOrder.map((w) => ({
          workerID: w.workerID,
          workerName: w.workerName,
          interval1Hours: i1,
          interval2Hours: i2,
        }));
        await api.saveUitknipIntervalHoursBulk({ date: dk, entries });
      }
      await hoursState.refresh();
      setBulkFeedback({
        type: "success",
        message: `Applied ${fmt(i1)}h + ${fmt(i2)}h to ${workerOrder.length} worker(s) for ${targetDates.length === 1 ? (dateLabels[targetDates[0]] || targetDates[0]) : "all dates"}. You can still edit individuals.`,
      });
    } catch (e) {
      setBulkFeedback({ type: "error", message: e.message || "Could not apply hours to all workers." });
    } finally {
      setBulkSaving(false);
    }
  }

  const loading = totalsState.loading || hoursState.loading;
  const hasData = workerOrder.length > 0 && dateOrder.length > 0;

  const bulkDateOptions = [
    { label: "All dates", value: "__all__" },
    ...dateOrder.map((dk) => ({ label: `${dateLabels[dk] || dk} (${dk})`, value: dk })),
  ];

  return (
    <ScreenScroll refreshing={loading} onRefresh={() => { totalsState.refresh(); hoursState.refresh(); }}>
      <SectionCard title="Uitknip Hours" subtitle="UITKNIP & UITKNIP02 workers (vines) with interval hours: 05:00–07:00 and 17:30–19:00">
        <FeedbackBanner type="error" message={totalsState.error || hoursState.error} />
        {loading && !hasData ? <ActivityIndicator color="#16a34a" /> : null}
        {!loading && !hasData ? <Text className="text-gray-500 text-sm">No UITKNIP/UITKNIP02 records found.</Text> : null}

        {hasData ? (
          <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, backgroundColor: "#f9fafb", gap: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>Set hours for all workers</Text>
            <Text style={{ fontSize: 12, color: "#6b7280" }}>Apply the same interval hours to all workers (you can still edit individual cells after).</Text>
            <SelectField
              label="Apply to"
              value={bulkDateKey}
              placeholder="Select date"
              options={bulkDateOptions}
              onSelect={setBulkDateKey}
              emptyMessage="No dates available"
              displayValue={
                bulkDateKey === "__all__"
                  ? "All dates"
                  : `${dateLabels[bulkDateKey] || bulkDateKey}${bulkDateKey ? ` (${bulkDateKey})` : ""}`
              }
            />
            <LabeledInput
              label="05:00 – 07:00 (hours)"
              value={bulkH1}
              onChangeText={setBulkH1}
              placeholder="e.g. 2"
              keyboardType="decimal-pad"
            />
            <LabeledInput
              label="17:30 – 19:00 (hours)"
              value={bulkH2}
              onChangeText={setBulkH2}
              placeholder="e.g. 1.5"
              keyboardType="decimal-pad"
            />
            <ActionButton
              label={bulkSaving ? "Applying..." : "Apply to all workers"}
              onPress={applyBulkHours}
              disabled={bulkSaving || !workerOrder.length}
            />
            <FeedbackBanner
              type={bulkFeedback.type === "error" ? "error" : bulkFeedback.type === "success" ? "success" : "info"}
              message={bulkFeedback.message}
            />
          </View>
        ) : null}

        {hasData ? (
          <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row" }}>
              <View style={{ borderRightWidth: 2, borderRightColor: "#9ca3af", backgroundColor: "#fff" }}>
                <View style={{ flexDirection: "row" }}>
                  <View style={{ width: ID_COL_WIDTH, height: HEADER_HEIGHT, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#374151" }}>ID</Text>
                  </View>
                  <View style={{ width: NAME_COL_WIDTH, height: HEADER_HEIGHT, justifyContent: "center", paddingLeft: 10, backgroundColor: "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#374151" }}>Worker</Text>
                  </View>
                </View>
                {workerOrder.map((w, idx) => (
                  <View key={w.workerID} style={{ flexDirection: "row", height: ROW_HEIGHT, backgroundColor: idx % 2 === 0 ? "#fff" : "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                    <View style={{ width: ID_COL_WIDTH, justifyContent: "center", alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: "#6b7280", fontWeight: "600" }}>{w.workerID}</Text>
                    </View>
                    <View style={{ width: NAME_COL_WIDTH, justifyContent: "center", paddingLeft: 10, paddingRight: 6 }}>
                      <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "700", color: "#111827" }}>{w.workerName}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ flexDirection: "row", height: ROW_HEIGHT, backgroundColor: "#f0fdf4", borderTopWidth: 2, borderTopColor: "#16a34a" }}>
                  <View style={{ width: ID_COL_WIDTH }} />
                  <View style={{ width: NAME_COL_WIDTH, justifyContent: "center", paddingLeft: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#16a34a" }}>TOTAL</Text>
                  </View>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={{ flexDirection: "row", height: HEADER_HEIGHT, backgroundColor: "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
                    {dateOrder.map((dk) => (
                      <View key={dk} style={{ width: DAY_COL_WIDTH, justifyContent: "center", alignItems: "center", borderRightWidth: 1, borderRightColor: "#f3f4f6" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#374151" }}>{dateLabels[dk]}</Text>
                        <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>vines · 05-07 · 17:30-19</Text>
                      </View>
                    ))}
                    <View style={{ width: TOTAL_COL_WIDTH, justifyContent: "center", alignItems: "center", backgroundColor: "#f0fdf4" }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#16a34a" }}>TOTAL HRS</Text>
                    </View>
                  </View>

                  {workerOrder.map((w, idx) => (
                    <View key={w.workerID} style={{ flexDirection: "row", height: ROW_HEIGHT, backgroundColor: idx % 2 === 0 ? "#fff" : "#f9fafb", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                      {dateOrder.map((dk) => {
                        const vines = vineMatrix[`${w.workerID}__${dk}`] || 0;
                        const h = getHours(w.workerID, dk);
                        const total = h.i1 + h.i2;
                        return (
                          <TouchableOpacity key={dk} activeOpacity={0.7} onPress={() => openEdit(w, dk)} style={{ width: DAY_COL_WIDTH, height: ROW_HEIGHT, justifyContent: "center", alignItems: "center", borderRightWidth: 1, borderRightColor: "#f3f4f6", paddingVertical: 4 }}>
                            <Text style={{ fontSize: 12, fontWeight: vines ? "700" : "400", color: vines ? "#111827" : "#d1d5db" }}>{vines ? `${vines}v` : "—"}</Text>
                            <Text style={{ fontSize: 10, color: (h.i1 || h.i2) ? "#0f766e" : "#9ca3af", marginTop: 2 }}>
                              {fmt(h.i1)}h + {fmt(h.i2)}h = {fmt(total)}h
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <View style={{ width: TOTAL_COL_WIDTH, justifyContent: "center", alignItems: "center", backgroundColor: "#f0fdf4" }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: "#16a34a" }}>{fmt(workerTotalHours(w.workerID))}h</Text>
                      </View>
                    </View>
                  ))}

                  <View style={{ flexDirection: "row", height: ROW_HEIGHT, backgroundColor: "#f0fdf4", borderTopWidth: 2, borderTopColor: "#16a34a" }}>
                    {dateOrder.map((dk) => {
                      const dayVines = workerOrder.reduce((s, w) => s + (vineMatrix[`${w.workerID}__${dk}`] || 0), 0);
                      const dayHours = workerOrder.reduce((s, w) => { const h = getHours(w.workerID, dk); return s + h.i1 + h.i2; }, 0);
                      return (
                        <View key={dk} style={{ width: DAY_COL_WIDTH, justifyContent: "center", alignItems: "center", borderRightWidth: 1, borderRightColor: "#dcfce7" }}>
                          <Text style={{ fontSize: 12, fontWeight: "800", color: "#16a34a" }}>{dayVines}v</Text>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#15803d", marginTop: 2 }}>{fmt(dayHours)}h</Text>
                        </View>
                      );
                    })}
                    <View style={{ width: TOTAL_COL_WIDTH, justifyContent: "center", alignItems: "center", backgroundColor: "#dcfce7" }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: "#15803d" }}>{fmt(grandTotalHours())}h</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SectionCard>

      <Modal visible={!!editModal} transparent animationType="fade" onRequestClose={() => setEditModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 24, backgroundColor: "#fff", padding: 24, gap: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>Uitknip Interval Hours</Text>
            <Text style={{ fontSize: 14, color: "#4b5563" }}>
              {editModal?.workerName} ({editModal?.workerID}) · {editModal?.dateLabel}
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={{ color: "#4b5563", fontSize: 12, fontWeight: "700" }}>05:00 – 07:00 (hours)</Text>
              <TextInput value={h1Input} onChangeText={setH1Input} keyboardType="decimal-pad" placeholder="e.g. 2" placeholderTextColor="#9ca3af" style={{ borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827" }} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: "#4b5563", fontSize: 12, fontWeight: "700" }}>17:30 – 19:00 (hours)</Text>
              <TextInput value={h2Input} onChangeText={setH2Input} keyboardType="decimal-pad" placeholder="e.g. 1.5" placeholderTextColor="#9ca3af" style={{ borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827" }} />
            </View>
            <Text style={{ color: "#374151", fontSize: 13, fontWeight: "700" }}>
              Total: {fmt((h1Input.trim()===""?0:Number(h1Input)||0) + (h2Input.trim()===""?0:Number(h2Input)||0))}h
            </Text>
            <FeedbackBanner type={feedback.type === "error" ? "error" : "success"} message={feedback.message} />
            <ActionButton label={saving ? "Saving..." : "Save Hours"} onPress={saveHours} disabled={saving} />
            <TouchableOpacity onPress={clearHours} disabled={saving} style={{ borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" }}>
              <Text style={{ color: "#6b7280", fontSize: 15, fontWeight: "800" }}>Clear Hours</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditModal(null)} style={{ borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: "#f3f4f6" }}>
              <Text style={{ color: "#374151", fontSize: 15, fontWeight: "800" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenScroll>
  );
}
