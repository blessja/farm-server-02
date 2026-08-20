import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import SelectField from "../components/SelectField";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";

function formatTime(isoString) {
  if (!isoString) return "--:--";
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function elapsedSince(isoString) {
  if (!isoString) return "";
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 0) return "";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function CheckedInScreen({ offlineQueue }) {
  const checkinsState = useAsyncData(() => api.getCurrentCheckins(), [], {
    cacheKey: "checkins",
    staleTime: 5 * 60 * 1000,
  });
  const records = Array.isArray(checkinsState.data) ? checkinsState.data : [];

  const blocksState = useAsyncData(() => api.getBlocks(), [], {
    cacheKey: "blocks",
    staleTime: 30 * 60 * 1000,
  });
  const allBlocks = Array.isArray(blocksState.data)
    ? blocksState.data.filter(Boolean).map(String)
    : [];
  const blockOptions = allBlocks.map((b) => ({ label: b, value: b }));

  const [moveOpen, setMoveOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [moveWorker, setMoveWorker] = useState(null);
  const [moveTargetBlock, setMoveTargetBlock] = useState("");
  const [moveTargetRow, setMoveTargetRow] = useState("");
  const [moveFeedback, setMoveFeedback] = useState({ type: "info", message: "" });
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [pendingMoveOverride, setPendingMoveOverride] = useState(null);

  const [occupantsModalVisible, setOccupantsModalVisible] = useState(false);
  const [occupantsAction, setOccupantsAction] = useState(null);
  const [occupantsFeedback, setOccupantsFeedback] = useState({ type: "info", message: "" });
  const [occupantsSubmitting, setOccupantsSubmitting] = useState(false);

  const [checkoutWorker, setCheckoutWorker] = useState(null);
  const [checkoutStock, setCheckoutStock] = useState("");
  const [checkoutFeedback, setCheckoutFeedback] = useState({ type: "info", message: "" });
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

  const moveRowsState = useAsyncData(
    () => (moveTargetBlock ? api.getBlockRows(moveTargetBlock) : Promise.resolve([])),
    [moveTargetBlock],
    {
      cacheKey: moveTargetBlock ? `rows-${moveTargetBlock}` : undefined,
      staleTime: 15 * 60 * 1000,
    }
  );
  const moveRows = Array.isArray(moveRowsState.data)
    ? moveRowsState.data.filter(Boolean).map(String)
    : [];

  const moveRowOptions = moveRows
    .filter((r) => !(moveTargetBlock === moveWorker?.blockName && r === moveWorker?.rowNumber))
    .map((r) => ({ label: r, value: r }));

  const moveRowOccupants = useMemo(() => {
    if (!moveWorker || !moveTargetBlock || !moveTargetRow) return [];
    return records.filter(
      (r) =>
        r.workerID !== moveWorker.workerID &&
        r.blockName === moveTargetBlock &&
        r.rowNumber === moveTargetRow
    );
  }, [records, moveWorker, moveTargetBlock, moveTargetRow]);

  const isSameJobOccupied = useMemo(() => {
    if (!moveWorker || moveRowOccupants.length === 0) return false;
    return moveRowOccupants.some(
      (o) => (o.job_type || "").toUpperCase() === (moveWorker.job_type || "").toUpperCase()
    );
  }, [moveRowOccupants, moveWorker]);

  function openMoveModal() {
    setMoveWorker(null);
    setMoveTargetBlock("");
    setMoveTargetRow("");
    setMoveFeedback({ type: "info", message: "" });
    setPendingMoveOverride(null);
    setOccupantsModalVisible(false);
    setOccupantsAction(null);
    setMoveOpen(true);
  }

  function openCheckoutModal() {
    setCheckoutWorker(null);
    setCheckoutStock("");
    setCheckoutFeedback({ type: "info", message: "" });
    setCheckoutOpen(true);
  }

  function handleRowSelect(rowValue) {
    setMoveTargetRow(rowValue);
    setMoveFeedback({ type: "info", message: "" });
    setPendingMoveOverride(null);

    if (!moveWorker || !moveTargetBlock || !rowValue) return;

    const occupants = records.filter(
      (r) =>
        r.workerID !== moveWorker.workerID &&
        r.blockName === moveTargetBlock &&
        r.rowNumber === rowValue
    );

    if (occupants.length > 0) {
      const hasSameJob = occupants.some(
        (o) => (o.job_type || "").toUpperCase() === (moveWorker.job_type || "").toUpperCase()
      );
      if (hasSameJob) {
        setOccupantsAction(null);
        setOccupantsFeedback({ type: "info", message: "" });
        setOccupantsModalVisible(true);
      }
    }
  }

  async function handleAllowMultiple() {
    if (!moveWorker) return;
    setOccupantsSubmitting(true);
    setOccupantsFeedback({ type: "info", message: "" });

    try {
      const payload = {
        workerID: moveWorker.workerID,
        workerName: moveWorker.workerName,
        blockName: moveTargetBlock,
        fromRowNumber: moveWorker.rowNumber,
        toRowNumber: moveTargetRow,
        jobType: moveWorker.job_type || "",
        allowMultipleWorkers: true,
      };

      const result = await api.moveRegularWorker(payload);
      setOccupantsFeedback({ type: "success", message: result.message });
      setOccupantsModalVisible(false);
      setMoveWorker(null);
      setMoveTargetBlock("");
      setMoveTargetRow("");
      setPendingMoveOverride(null);
      offlineQueue?.refreshQueueCount?.();
      checkinsState.refresh();
      setTimeout(() => setMoveOpen(false), 800);
    } catch (error) {
      setOccupantsFeedback({ type: "error", message: error.message });
    } finally {
      setOccupantsSubmitting(false);
    }
  }

  async function handleSwapFromOccupants() {
    if (!moveWorker || moveRowOccupants.length === 0) return;
    const swapWith = moveRowOccupants.find(
      (o) => (o.job_type || "").toUpperCase() === (moveWorker.job_type || "").toUpperCase()
    ) || moveRowOccupants[0];

    setOccupantsSubmitting(true);
    setOccupantsFeedback({ type: "info", message: "" });

    try {
      const result = await api.swapRegularWorkers({
        firstWorkerID: moveWorker.workerID,
        secondWorkerID: swapWith.workerID,
        blockName: moveTargetBlock,
        firstJobType: moveWorker.job_type || "",
        secondJobType: swapWith.job_type || "",
      });

      setOccupantsFeedback({ type: "success", message: result.message });
      setOccupantsModalVisible(false);
      setMoveWorker(null);
      setMoveTargetBlock("");
      setMoveTargetRow("");
      setPendingMoveOverride(null);
      offlineQueue?.refreshQueueCount?.();
      checkinsState.refresh();
      setTimeout(() => setMoveOpen(false), 800);
    } catch (error) {
      setOccupantsFeedback({ type: "error", message: error.message });
    } finally {
      setOccupantsSubmitting(false);
    }
  }

  function handleRejectOccupants() {
    setOccupantsModalVisible(false);
    setMoveTargetRow("");
    setOccupantsAction(null);
    setOccupantsFeedback({ type: "info", message: "" });
  }

  async function handleCheckout() {
    if (!checkoutWorker) return;
    setCheckoutSubmitting(true);
    setCheckoutFeedback({ type: "info", message: "" });

    try {
      const payload = {
        workerID: checkoutWorker.workerID,
        workerName: checkoutWorker.workerName,
        blockName: checkoutWorker.blockName,
        rowNumber: checkoutWorker.rowNumber,
        jobType: checkoutWorker.job_type || "",
        stockCount: checkoutStock === "" ? undefined : Number(checkoutStock),
      };

      const result = await api.regularCheckout(payload);
      setCheckoutFeedback({ type: "success", message: result.message });
      setCheckoutWorker(null);
      setCheckoutStock("");
      offlineQueue?.refreshQueueCount?.();
      checkinsState.refresh();
      setTimeout(() => setCheckoutOpen(false), 800);
    } catch (error) {
      setCheckoutFeedback({ type: "error", message: error.message });
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  const groupedByBlock = records.reduce((acc, item) => {
    const block = item.blockName || "Unknown";
    if (!acc[block]) acc[block] = [];
    acc[block].push(item);
    return acc;
  }, {});

  const blockNames = Object.keys(groupedByBlock).sort();

  return (
    <ScreenScroll
      refreshing={checkinsState.loading}
      onRefresh={checkinsState.refresh}
    >
      <SectionCard
        title="Actions"
        subtitle="Move a worker to another row or check out a worker."
      >
        <View className="flex-row gap-2.5">
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              flex: 1,
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: "#16a34a",
            }}
            onPress={openMoveModal}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>Move Worker</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              flex: 1,
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: "#f3f4f6",
              borderWidth: 1,
              borderColor: "#e5e7eb",
            }}
            onPress={openCheckoutModal}
          >
            <Text style={{ color: "#374151", fontSize: 14, fontWeight: "800" }}>Checkout</Text>
          </TouchableOpacity>
        </View>
      </SectionCard>

      <SectionCard
        title="Currently working"
        subtitle={`${records.length} worker${records.length !== 1 ? "s" : ""} checked in across all blocks.`}
      >
        {checkinsState.loading && !records.length ? (
          <ActivityIndicator color="#16a34a" />
        ) : null}

        {!records.length && !checkinsState.loading ? (
          <Text className="text-gray-400 text-sm">
            No workers are currently checked in.
          </Text>
        ) : null}

        {blockNames.map((blockName) => (
          <View key={blockName} className="mb-3">
            <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">
              {blockName}
            </Text>
            <View className="gap-2">
              {groupedByBlock[blockName].map((item, index) => (
                <View
                  key={`${item.workerID}-${item.rowNumber}-${index}`}
                  className="rounded-xl bg-gray-50 border border-gray-100 p-3.5"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-gray-900 text-[15px] font-extrabold">
                        {item.workerName}
                      </Text>
                      <Text className="mt-0.5 text-gray-400 text-[13px]">
                        ID {item.workerID}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-farm-600 text-sm font-bold">
                        {item.job_type}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-0.5">
                        Row {item.rowNumber}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <Text className="text-gray-400 text-xs">
                      In at {formatTime(item.startTime)}
                    </Text>
                    <Text className="text-gray-500 text-xs font-bold">
                      {elapsedSince(item.startTime)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <FeedbackBanner type="error" message={checkinsState.error} />
      </SectionCard>

      {/* ─── Move Worker Modal ─── */}
      <Modal visible={moveOpen} animationType="slide">
        <ScreenScroll refreshing={false}>
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-1">
              <Text className="text-gray-900 text-lg font-extrabold">Move Worker</Text>
              <Text className="text-gray-400 text-[13px] leading-5 mt-0.5">
                Pick a worker, then choose target block and row.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={{ borderRadius: 12, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => setMoveOpen(false)}
            >
              <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>Close</Text>
            </TouchableOpacity>
          </View>

          <SectionCard title="Select worker" subtitle="Tap a worker to expand move options.">
            {records.length === 0 ? (
              <Text className="text-gray-400 text-sm">No workers available.</Text>
            ) : null}

            {records.map((w, index) => {
              const active = moveWorker?.workerID === w.workerID;
              return (
                <View key={`${w.workerID}-${w.rowNumber}-${index}`}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      borderWidth: 1,
                      backgroundColor: active ? "#16a34a" : "#f9fafb",
                      borderColor: active ? "#16a34a" : "#f3f4f6",
                    }}
                    onPress={() => {
                      if (active) {
                        setMoveWorker(null);
                        setMoveTargetBlock("");
                        setMoveTargetRow("");
                        setMoveFeedback({ type: "info", message: "" });
                        setPendingMoveOverride(null);
                      } else {
                        setMoveWorker(w);
                        setMoveTargetBlock(w.blockName);
                        setMoveTargetRow("");
                        setMoveFeedback({ type: "info", message: "" });
                        setPendingMoveOverride(null);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "800", color: active ? "#fff" : "#111827" }}>
                      {w.workerName} ({w.workerID})
                    </Text>
                    <Text style={{ marginTop: 3, fontSize: 13, color: active ? "#dcfce7" : "#9ca3af" }}>
                      {w.blockName} · Row {w.rowNumber} · {w.job_type || "No job"} · {elapsedSince(w.startTime)}
                    </Text>
                  </TouchableOpacity>

                  {active ? (
                    <View style={{ marginTop: 8, marginLeft: 4, marginRight: 4, gap: 10 }}>
                      <View className="rounded-xl bg-white border border-gray-200 p-3.5 gap-2.5">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">From block</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.blockName}</Text>
                        </View>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">Job</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.job_type || "N/A"}</Text>
                        </View>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">From row</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.rowNumber}</Text>
                        </View>
                      </View>

                      <SelectField
                        label="Target block"
                        value={moveTargetBlock}
                        placeholder="Select block"
                        options={blockOptions}
                        onSelect={(value) => {
                          setMoveTargetBlock(value);
                          setMoveTargetRow("");
                        }}
                        emptyMessage="No blocks found"
                      />

                      {moveTargetBlock ? (
                        <SelectField
                          label="Target row"
                          value={moveTargetRow}
                          placeholder="Select target row"
                          options={moveRowOptions}
                          onSelect={handleRowSelect}
                          emptyMessage={
                            moveRowsState.loading
                              ? "Loading rows..."
                              : "No rows available"
                          }
                        />
                      ) : null}

                      {moveTargetRow && !isSameJobOccupied && moveRowOccupants.length === 0 ? (
                        <View className="rounded-2xl bg-farm-50 border border-farm-200 p-3.5 gap-1.5">
                          <Text className="text-farm-800 text-xs font-extrabold uppercase">Preview</Text>
                          <Text className="text-farm-700 text-sm leading-5">
                            {w.workerName} will move from Row {w.rowNumber} to Row {moveTargetRow} in {moveTargetBlock}.
                          </Text>
                        </View>
                      ) : null}

                      {moveTargetRow && !isSameJobOccupied && moveRowOccupants.length > 0 ? (
                        <View className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 gap-1.5">
                          <Text className="text-amber-800 text-xs font-extrabold uppercase">Different job on row</Text>
                          <Text className="text-amber-700 text-sm leading-5">
                            Row {moveTargetRow} has {moveRowOccupants.map((o) => o.workerName).join(", ")} doing different jobs. Multiple jobs allowed.
                          </Text>
                        </View>
                      ) : null}

                      {moveTargetRow && moveRowOccupants.length === 0 ? (
                        <ActionButton
                          label={moveSubmitting ? "Moving..." : "Move worker"}
                          onPress={() => handleMove()}
                          disabled={moveSubmitting || !moveTargetRow}
                        />
                      ) : null}
                      {pendingMoveOverride ? (
                        <ActionButton
                          label={moveSubmitting ? "Applying..." : "Move with same-job override"}
                          tone="secondary"
                          onPress={() => handleMove(pendingMoveOverride)}
                          disabled={moveSubmitting}
                        />
                      ) : null}
                      <FeedbackBanner
                        type={moveFeedback.type === "error" ? "error" : "success"}
                        message={moveFeedback.message}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </SectionCard>
        </ScreenScroll>
      </Modal>

      {/* ─── Row Occupants Modal ─── */}
      <Modal visible={occupantsModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 24, backgroundColor: "#fff", padding: 24, gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>
              Row occupied
            </Text>

            {moveWorker ? (
              <Text style={{ fontSize: 14, color: "#4b5563", lineHeight: 20 }}>
                <Text style={{ fontWeight: "800" }}>{moveWorker.workerName}</Text> ({moveWorker.job_type || "N/A"}) wants to move to Row {moveTargetRow} in {moveTargetBlock}.
              </Text>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>
                Currently on this row
              </Text>
              {moveRowOccupants.map((o) => (
                <View
                  key={o.workerID}
                  style={{ borderRadius: 12, padding: 10, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#f3f4f6", gap: 2 }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>
                    {o.workerName} ({o.workerID})
                  </Text>
                  <Text style={{ fontSize: 12, color: "#9ca3af" }}>
                    {o.job_type || "No job"} · {elapsedSince(o.startTime)} on row
                  </Text>
                </View>
              ))}
            </View>

            <FeedbackBanner
              type={occupantsFeedback.type === "error" ? "error" : "success"}
              message={occupantsFeedback.message}
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
                onPress={handleAllowMultiple}
                disabled={occupantsSubmitting}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
                  {occupantsSubmitting ? "Working..." : "Allow — move here too"}
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
                onPress={handleSwapFromOccupants}
                disabled={occupantsSubmitting}
              >
                <Text style={{ color: "#374151", fontSize: 15, fontWeight: "800" }}>
                  {occupantsSubmitting ? "Working..." : "Swap — exchange rows"}
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
                onPress={handleRejectOccupants}
                disabled={occupantsSubmitting}
              >
                <Text style={{ color: "#6b7280", fontSize: 15, fontWeight: "800" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Checkout Modal ─── */}
      <Modal visible={checkoutOpen} animationType="slide">
        <ScreenScroll refreshing={false}>
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-1">
              <Text className="text-gray-900 text-lg font-extrabold">Checkout</Text>
              <Text className="text-gray-400 text-[13px] leading-5 mt-0.5">
                Tap a worker to expand the checkout form inline.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={{ borderRadius: 12, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => setCheckoutOpen(false)}
            >
              <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>Close</Text>
            </TouchableOpacity>
          </View>

          <SectionCard title="Select worker" subtitle="Tap a worker below to check them out.">
            {records.length === 0 ? (
              <Text className="text-gray-400 text-sm">No workers available.</Text>
            ) : null}

            {records.map((w, index) => {
              const active = checkoutWorker?.workerID === w.workerID;
              return (
                <View key={`${w.workerID}-${w.rowNumber}-${index}`}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      borderWidth: 1,
                      backgroundColor: active ? "#16a34a" : "#f9fafb",
                      borderColor: active ? "#16a34a" : "#f3f4f6",
                    }}
                    onPress={() => {
                      if (active) {
                        setCheckoutWorker(null);
                        setCheckoutStock("");
                        setCheckoutFeedback({ type: "info", message: "" });
                      } else {
                        setCheckoutWorker(w);
                        setCheckoutStock("");
                        setCheckoutFeedback({ type: "info", message: "" });
                      }
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "800", color: active ? "#fff" : "#111827" }}>
                      {w.workerName} ({w.workerID})
                    </Text>
                    <Text style={{ marginTop: 3, fontSize: 13, color: active ? "#dcfce7" : "#9ca3af" }}>
                      {w.blockName} · Row {w.rowNumber} · {w.job_type || "No job"} · {elapsedSince(w.startTime)}
                    </Text>
                  </TouchableOpacity>

                  {active ? (
                    <View style={{ marginTop: 8, marginLeft: 4, marginRight: 4, gap: 10 }}>
                      <View className="rounded-xl bg-white border border-gray-200 p-3.5 gap-2.5">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">Block</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.blockName}</Text>
                        </View>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">Row</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.rowNumber}</Text>
                        </View>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">Job</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{w.job_type || "N/A"}</Text>
                        </View>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-500 text-xs font-bold">Started</Text>
                          <Text className="text-gray-900 text-sm font-extrabold">{formatTime(w.startTime)}</Text>
                        </View>
                      </View>

                      <View className="gap-1.5">
                        <Text className="text-gray-600 text-xs font-bold">Stocks completed</Text>
                        <TextInput
                          className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-gray-900 text-[15px]"
                          value={checkoutStock}
                          onChangeText={setCheckoutStock}
                          placeholder="Leave blank to complete remaining"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                        />
                      </View>

                      <ActionButton
                        label={checkoutSubmitting ? "Submitting..." : "Submit checkout"}
                        tone="secondary"
                        onPress={handleCheckout}
                        disabled={checkoutSubmitting}
                      />
                      <FeedbackBanner
                        type={checkoutFeedback.type === "error" ? "error" : "success"}
                        message={checkoutFeedback.message}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </SectionCard>
        </ScreenScroll>
      </Modal>
    </ScreenScroll>
  );
}
