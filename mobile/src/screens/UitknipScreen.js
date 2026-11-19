import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";
import WorkerSuggestionInput from "../components/WorkerSuggestionInput";
import SelectField from "../components/SelectField";
import { sortNamesNumerically } from "../utils/sortNames";
import { useLanguage } from "../i18n";
import { getRowAdvanceSettings, setRowAdvanceSettings } from "../storage/settingsStorage";

export default function UitknipScreen({ sharedState, offlineQueue }) {
  const { t } = useLanguage();
  const [checkinForm, setCheckinForm] = useState({ workerID: "", workerName: "" });
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinFeedback, setCheckinFeedback] = useState({ type: "info", message: "" });
  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictOccupants, setConflictOccupants] = useState([]);
  const [conflictPayload, setConflictPayload] = useState(null);

  const [rowDirection, setRowDirection] = useState(1);
  const [autoNextEnabled, setAutoNextEnabled] = useState(true);
  const [nextDirection, setNextDirection] = useState("follow");

  const selectedJob = "UITKNIP";
  const [selectedBlock, setSelectedBlock] = useState(sharedState.selectedBlock || "");
  const [selectedRow, setSelectedRow] = useState(sharedState.selectedRow || "");

  useEffect(() => {
    (async () => {
      const settings = await getRowAdvanceSettings();
      if (settings) {
        setAutoNextEnabled(settings.enabled !== false);
        if (settings.direction) setNextDirection(settings.direction);
      }
    })();
  }, []);

  useEffect(() => {
    sharedState.setJobType?.("UITKNIP");
  }, []);

  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
    staleTime: 30 * 60 * 1000,
  });
  const rowsState = useAsyncData(
    () => (selectedBlock ? api.getBlockRows(selectedBlock) : Promise.resolve([])),
    [selectedBlock],
    { cacheKey: selectedBlock ? `rows-${selectedBlock}` : undefined, staleTime: 15 * 60 * 1000 }
  );
  const blockDetailsState = useAsyncData(
    () => (selectedBlock ? api.getBlockDetails(selectedBlock) : Promise.resolve(null)),
    [selectedBlock],
    { cacheKey: selectedBlock ? `block-details-${selectedBlock}` : undefined, staleTime: 2 * 60 * 1000 }
  );
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins",
    staleTime: 5 * 60 * 1000,
  });
  const totalsState = useAsyncData(() => api.getUitknipTotals(), [], {
    cacheKey: "uitknip-totals",
    staleTime: 60 * 1000,
  });

  const blocks = Array.isArray(blocksState.data)
    ? blocksState.data.filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
    : [];
  const rows = Array.isArray(rowsState.data)
    ? rowsState.data.filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
    : [];
  const checkins = Array.isArray(checkinsState.data) ? checkinsState.data : [];

  const occupantsByRow = useMemo(() => {
    const map = {};
    checkins.forEach((r) => {
      if ((r.blockName || r.block_name) !== selectedBlock) return;
      if (String(r.job_type || "").toUpperCase() !== selectedJob) return;
      const rn = String(r.rowNumber || r.row_number);
      if (!map[rn]) map[rn] = [];
      map[rn].push(r);
    });
    return map;
  }, [checkins, selectedBlock, selectedJob]);

  const occupiedRowNumbers = useMemo(() => Object.keys(occupantsByRow), [occupantsByRow]);

  const rowInfoMap = useMemo(() => {
    const map = {};
    const block = blockDetailsState.data;
    if (block && Array.isArray(block.rows)) {
      block.rows.forEach((r) => {
        map[String(r.row_number)] = {
          vines: Number(r.stock_count) || 0,
          bunches: Number(r.bunches) || 0,
          remainingVines: Number(r.remaining_stock_count ?? r.stock_count) || 0,
          remainingBunches: Number(r.remaining_bunch_count ?? r.bunches) || 0,
        };
      });
    }
    return map;
  }, [blockDetailsState.data]);

  const blockOptions = sortNamesNumerically([...new Set(blocks.map(String))]).map((b) => ({ label: b, value: b }));
  const rowOptions = sortNamesNumerically([...new Set(rows.map(String))]).map((rowNumber) => {
    const info = rowInfoMap[rowNumber];
    const suffix = info ? ` (V:${info.vines} B:${info.bunches})` : "";
    const occ = occupantsByRow[rowNumber] || [];
    const occNames = occ
      .map((o) => o.workerName || o.worker_name || o.workerID || o.worker_id)
      .filter(Boolean);
    const occLabel = occNames.length ? ` • ${occNames.join(", ")}` : "";
    return {
      label: `${rowNumber}${suffix}${occLabel}`,
      value: rowNumber,
    };
  });

  const selectedRowInfo = rowInfoMap[String(selectedRow)] || null;

  function availableRowNumbers() {
    return sortNamesNumerically([...new Set(rows.map(String))]);
  }

  function handleRowSelect(value) {
    const prevRow = selectedRow;
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
    setSelectedRow(nextRow);
  }

  function advanceToNextRow() {
    if (!autoNextEnabled) return;
    const availableRows = availableRowNumbers();
    const currentValue = String(selectedRow || "");
    if (!currentValue || availableRows.length === 0) return;
    const currentIndex = availableRows.indexOf(currentValue);
    if (currentIndex === -1) return;
    let step = rowDirection;
    if (nextDirection === "up") step = 1;
    else if (nextDirection === "down") step = -1;
    const blockedRows = new Set(occupiedRowNumbers.map(String));
    let nextRow = null;
    for (let i = 1; i < availableRows.length; i++) {
      const candidate = availableRows[currentIndex + step * i];
      if (candidate === undefined) break;
      if (blockedRows.has(candidate)) continue;
      nextRow = candidate;
      break;
    }
    if (nextRow) {
      setSelectedRow(nextRow);
      if (nextDirection === "up" || nextDirection === "down") setRowDirection(step);
    }
  }

  function handleSuccessfulCheckinSelection() {
    if (autoNextEnabled) advanceToNextRow();
  }

  function toggleAutoNext(value) {
    setAutoNextEnabled(value);
    setRowAdvanceSettings(value, nextDirection);
  }
  function handleNextDirection(direction) {
    setNextDirection(direction);
    setRowAdvanceSettings(autoNextEnabled, direction);
  }

  function getRowOccupants(blockName, rowNumber, jobType) {
    return checkins.filter((r) => {
      const rowJobType = String(r.job_type || "").toUpperCase();
      return (
        (r.blockName || r.block_name) === blockName &&
        String(r.rowNumber || r.row_number) === String(rowNumber) &&
        rowJobType === jobType
      );
    });
  }

  async function handleCheckin() {
    setCheckinSubmitting(true);
    setCheckinFeedback({ type: "info", message: "" });
    try {
      const payload = {
        workerID: checkinForm.workerID,
        workerName: checkinForm.workerName,
        jobType: selectedJob,
        blockName: selectedBlock,
        rowNumber: selectedRow,
      };
      const result = await api.regularCheckin(payload);
      setCheckinFeedback({ type: "success", message: result.message });
      setCheckinForm({ workerID: "", workerName: "" });
      handleSuccessfulCheckinSelection();
      await Promise.all([offlineQueue.refreshQueueCount(), checkinsState.refresh(), blockDetailsState.refresh(), totalsState.refresh()]);
    } catch (error) {
      if (error.payload?.canOverride) {
        const occupants = getRowOccupants(selectedBlock, selectedRow, selectedJob);
        setConflictOccupants(occupants);
        setConflictPayload({
          workerID: checkinForm.workerID,
          workerName: checkinForm.workerName,
          jobType: selectedJob,
          blockName: selectedBlock,
          rowNumber: selectedRow,
        });
        setConflictModalVisible(true);
      } else {
        setCheckinFeedback({ type: "error", message: error.message });
      }
    } finally {
      setCheckinSubmitting(false);
    }
  }

  async function handleAllowConflict() {
    if (!conflictPayload) return;
    setConflictModalVisible(false);
    setCheckinSubmitting(true);
    setCheckinFeedback({ type: "info", message: "" });
    try {
      const result = await api.regularCheckin(conflictPayload);
      setCheckinFeedback({ type: "success", message: result.message });
      setCheckinForm({ workerID: "", workerName: "" });
      handleSuccessfulCheckinSelection();
      await Promise.all([offlineQueue.refreshQueueCount(), checkinsState.refresh(), blockDetailsState.refresh(), totalsState.refresh()]);
    } catch (error) {
      setCheckinFeedback({ type: "error", message: error.message });
    } finally {
      setCheckinSubmitting(false);
      setConflictPayload(null);
      setConflictOccupants([]);
    }
  }

  const uitknipTotals = Array.isArray(totalsState.data?.workers) ? totalsState.data.workers : [];
  const uitknipSummary = totalsState.data?.summary || {};

  return (
    <ScreenScroll
      refreshing={blocksState.loading || rowsState.loading || checkinsState.loading}
      onRefresh={() => {
        blocksState.refresh();
        rowsState.refresh();
        checkinsState.refresh();
        blockDetailsState.refresh();
        totalsState.refresh();
      }}
    >
      <SectionCard title="Uitknip" subtitle="Track vines and bunches (tros). Job type is fixed to UITKNIP.">
        <Text className="text-gray-600 text-sm leading-5">
          Job: UITKNIP{"\n"}
          Block: {selectedBlock || t("common.notSelected")}{"  "}Row: {selectedRow || t("common.notSelected")}
        </Text>
        {selectedRowInfo ? (
          <View className="mt-3 rounded-xl bg-gray-50 p-3">
            <Text className="text-gray-700 text-sm font-semibold">Row totals (vines / bunches)</Text>
            <Text className="text-gray-700 text-sm mt-1">
              Vines: {selectedRowInfo.vines}  |  Bunches: {selectedRowInfo.bunches}
            </Text>
            <Text className="text-gray-600 text-sm mt-1">
              Remaining: {selectedRowInfo.remainingVines} vines / {selectedRowInfo.remainingBunches} bunches
            </Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title={t("dw.selection")} subtitle={t("dw.selectionSub")}>
        <View className="gap-1">
          <Text className="text-gray-500 text-xs font-bold">Job type</Text>
          <View className="rounded-xl border border-gray-200 bg-gray-100 px-3 py-3">
            <Text className="text-gray-800 font-semibold">UITKNIP</Text>
          </View>
        </View>
        {blocksState.loading && !blocks.length ? <ActivityIndicator color="#16a34a" /> : null}
        <SelectField
          label={t("dw.block")}
          value={selectedBlock}
          placeholder={t("dw.selectBlock")}
          options={blockOptions}
          onSelect={(value) => {
            setSelectedBlock(value);
            setSelectedRow("");
            }}
          emptyMessage={t("common.noBlocksFound")}
        />
        <SelectField
          label={t("dw.row")}
          value={selectedRow}
          placeholder={t("dw.selectRow")}
          options={rowOptions}
          onSelect={handleRowSelect}
          emptyMessage={selectedBlock ? t("dw.noRowsInBlock") : t("dw.selectBlockFirst")}
          disabledValues={occupiedRowNumbers}
          displayValue={selectedRow ? `${selectedRow}${selectedRowInfo ? ` (V:${selectedRowInfo.vines} B:${selectedRowInfo.bunches})` : ""}` : undefined}
        />
        <TouchableOpacity activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }} onPress={() => toggleAutoNext(!autoNextEnabled)}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: autoNextEnabled ? "#16a34a" : "#d1d5db", backgroundColor: autoNextEnabled ? "#16a34a" : "#fff", alignItems: "center", justifyContent: "center" }}>
            {autoNextEnabled && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>}
          </View>
          <Text className="text-gray-600 text-sm" style={{ flex: 1 }}>{t("dw.autoNextRow")}</Text>
        </TouchableOpacity>
        {autoNextEnabled ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { key: "follow", label: t("dw.dirFollow") },
              { key: "up", label: t("dw.dirUp") },
              { key: "down", label: t("dw.dirDown") },
            ].map((opt) => {
              const active = nextDirection === opt.key;
              return (
                <TouchableOpacity key={opt.key} onPress={() => handleNextDirection(opt.key)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: active ? "#16a34a" : "#d1d5db", backgroundColor: active ? "#dcfce7" : "#fff" }}>
                  <Text style={{ fontSize: 12, fontWeight: active ? "700" : "500", color: active ? "#15803d" : "#6b7280" }}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <FeedbackBanner type="error" message={blocksState.error || rowsState.error || blockDetailsState.error || checkinsState.error} />
      </SectionCard>

      <SectionCard title={t("dw.regCheckin")} subtitle={t("dw.regCheckinSub")}>
        <WorkerSuggestionInput
          label={t("clock.workerID")}
          workerID={checkinForm.workerID}
          workerName={checkinForm.workerName}
          onSelect={({ workerID, workerName }) =>
            setCheckinForm((current) => ({ ...current, workerID, workerName: workerName || current.workerName }))
          }
        />
        <View className="gap-1">
          <Text className="text-gray-500 text-xs font-bold">{t("dw.workerName")}</Text>
          <View className="rounded-xl border border-gray-200 bg-gray-100 px-3 py-3">
            <Text className="text-gray-800">{checkinForm.workerName || t("dw.autoFilled")}</Text>
          </View>
        </View>
        <ActionButton
          label={checkinSubmitting ? t("common.submitting") : t("dw.checkinRegular")}
          onPress={handleCheckin}
          disabled={checkinSubmitting || !selectedBlock || !selectedRow || !checkinForm.workerID}
        />
        <FeedbackBanner type={checkinFeedback.type === "error" ? "error" : "success"} message={checkinFeedback.message} />
      </SectionCard>

      <SectionCard
        title="Uitknip Totals"
        subtitle="Carried-over UITKNIP totals (vines and bunches). Bunches show 0 where not yet captured."
      >
        {totalsState.loading && !uitknipTotals.length ? <ActivityIndicator color="#16a34a" /> : null}
        <FeedbackBanner type="error" message={totalsState.error} />
        {!totalsState.loading && !uitknipTotals.length ? (
          <Text style={{ color: "#6b7280", fontSize: 14 }}>No UITKNIP totals yet.</Text>
        ) : null}
        {uitknipTotals.length ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <View style={{ borderRadius: 12, backgroundColor: "#f0fdf4", paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ color: "#166534", fontSize: 12, fontWeight: "700" }}>Workers</Text>
                <Text style={{ color: "#14532d", fontSize: 18, fontWeight: "800" }}>{uitknipSummary.totalWorkers || uitknipTotals.length}</Text>
              </View>
              <View style={{ borderRadius: 12, backgroundColor: "#ecfeff", paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ color: "#155e75", fontSize: 12, fontWeight: "700" }}>Total vines</Text>
                <Text style={{ color: "#164e63", fontSize: 18, fontWeight: "800" }}>{uitknipSummary.totalVines || 0}</Text>
              </View>
              <View style={{ borderRadius: 12, backgroundColor: "#fff7ed", paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ color: "#9a3412", fontSize: 12, fontWeight: "700" }}>Total bunches</Text>
                <Text style={{ color: "#7c2d12", fontSize: 18, fontWeight: "800" }}>{uitknipSummary.totalBunches || 0}</Text>
              </View>
            </View>

            <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", backgroundColor: "#f9fafb", paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
                <Text style={{ flex: 1.4, fontSize: 11, fontWeight: "800", color: "#374151" }}>Worker</Text>
                <Text style={{ width: 90, fontSize: 11, fontWeight: "800", color: "#374151", textAlign: "right" }}>Vines</Text>
                <Text style={{ width: 90, fontSize: 11, fontWeight: "800", color: "#374151", textAlign: "right" }}>Bunches</Text>
              </View>
              {uitknipTotals.map((w, idx) => (
                <View key={`${w.workerID}-${idx}`} style={{ borderBottomWidth: idx === uitknipTotals.length - 1 ? 0 : 1, borderBottomColor: "#f3f4f6" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, backgroundColor: idx % 2 === 0 ? "#fff" : "#fcfcfd" }}>
                    <View style={{ flex: 1.4 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>{w.workerName}</Text>
                      <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>ID: {w.workerID}</Text>
                    </View>
                    <Text style={{ width: 90, fontSize: 13, fontWeight: "800", color: "#111827", textAlign: "right" }}>{w.totalVines || 0}</Text>
                    <Text style={{ width: 90, fontSize: 13, fontWeight: "800", color: "#9a3412", textAlign: "right" }}>{w.totalBunches || 0}</Text>
                  </View>
                  {(w.rows || []).map((r, ri) => (
                    <View key={`${w.workerID}-${r.blockName}-${r.rowNumber}-${ri}`} style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 10, paddingLeft: 18, backgroundColor: idx % 2 === 0 ? "#fff" : "#fcfcfd", borderTopWidth: 1, borderTopColor: "#f9fafb" }}>
                      <Text style={{ flex: 1.4, fontSize: 12, color: "#4b5563" }}>
                        {r.blockName} / Row {r.rowNumber}{r.date ? ` · ${String(r.date).slice(0, 10)}` : ""}
                      </Text>
                      <Text style={{ width: 90, fontSize: 12, fontWeight: "700", color: "#374151", textAlign: "right" }}>{r.vines || 0}v</Text>
                      <Text style={{ width: 90, fontSize: 12, fontWeight: "700", color: "#9a3412", textAlign: "right" }}>{r.bunches || 0}b</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </SectionCard>

      <Modal visible={conflictModalVisible} transparent animationType="fade" onRequestClose={() => setConflictModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 24, backgroundColor: "#fff", padding: 24, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>{t("dw.rowConflict")}</Text>
            <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>{t("dw.rowConflictDesc")}</Text>
            {conflictOccupants.map((occ, idx) => (
              <View key={idx} style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 6 }}>
                <Text style={{ color: "#111827", fontSize: 13, fontWeight: "700" }}>{occ.workerName} ({occ.workerID})</Text>
                <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{occ.job_type} — {occ.remainingStocks ?? 0} vines / {occ.remainingBunches ?? 0} bunches left</Text>
              </View>
            ))}
            <ActionButton label={t("dw.allowCheckin")} onPress={handleAllowConflict} disabled={checkinSubmitting} />
            <TouchableOpacity activeOpacity={0.7} style={{ borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: "#f3f4f6" }} onPress={() => { setConflictModalVisible(false); setConflictPayload(null); setConflictOccupants([]); }}>
              <Text style={{ color: "#374151", fontSize: 15, fontWeight: "800" }}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenScroll>
  );
}
