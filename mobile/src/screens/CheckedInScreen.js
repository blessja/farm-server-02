import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
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
import { sortNamesNumerically } from "../utils/sortNames";

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
  const allBlocks = sortNamesNumerically(
    Array.isArray(blocksState.data)
      ? blocksState.data.filter(Boolean).map(String)
      : []
  );
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

  const [expandedWorker, setExpandedWorker] = useState(null);
  const [activeOperation, setActiveOperation] = useState(null);

  const [inlineCheckoutStock, setInlineCheckoutStock] = useState("");
  const [inlineCheckoutFeedback, setInlineCheckoutFeedback] = useState({
    type: "info",
    message: "",
  });
  const [inlineCheckoutSubmitting, setInlineCheckoutSubmitting] = useState(false);

  const [inlineMoveTargetBlock, setInlineMoveTargetBlock] = useState("");
  const [inlineMoveTargetRow, setInlineMoveTargetRow] = useState("");
  const [inlineMoveFeedback, setInlineMoveFeedback] = useState({ type: "info", message: "" });
  const [inlineMoveSubmitting, setInlineMoveSubmitting] = useState(false);
  const [inlinePendingOverride, setInlinePendingOverride] = useState(null);
  const [inlineOccupantsSubmitting, setInlineOccupantsSubmitting] = useState(false);

  const moveRowsState = useAsyncData(
    () => (moveTargetBlock ? api.getBlockRows(moveTargetBlock) : Promise.resolve([])),
    [moveTargetBlock],
    {
      cacheKey: moveTargetBlock ? `rows-${moveTargetBlock}` : undefined,
      staleTime: 15 * 60 * 1000,
    }
  );
  const moveRows = sortNamesNumerically(
    Array.isArray(moveRowsState.data)
      ? moveRowsState.data.filter(Boolean).map(String)
      : []
  );

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

  const expandedRecord =
    records.find((r) => `${r.workerID}-${r.rowNumber}` === expandedWorker) || null;

  const inlineRowsState = useAsyncData(
    () =>
      inlineMoveTargetBlock
        ? api.getBlockRows(inlineMoveTargetBlock)
        : Promise.resolve([]),
    [inlineMoveTargetBlock],
    {
      cacheKey: inlineMoveTargetBlock
        ? `inline-rows-${inlineMoveTargetBlock}`
        : undefined,
      staleTime: 15 * 60 * 1000,
    }
  );
  const inlineMoveRows = sortNamesNumerically(
    Array.isArray(inlineRowsState.data)
      ? inlineRowsState.data.filter(Boolean).map(String)
      : []
  );

  const inlineRowOptions = inlineMoveRows
    .filter(
      (r) =>
        !(inlineMoveTargetBlock === expandedRecord?.blockName && r === expandedRecord?.rowNumber)
    )
    .map((r) => ({ label: r, value: r }));

  const inlineMoveRowOccupants = useMemo(() => {
    if (!expandedRecord || !inlineMoveTargetBlock || !inlineMoveTargetRow) return [];
    return records.filter(
      (r) =>
        r.workerID !== expandedRecord.workerID &&
        r.blockName === inlineMoveTargetBlock &&
        r.rowNumber === inlineMoveTargetRow
    );
  }, [records, expandedRecord, inlineMoveTargetBlock, inlineMoveTargetRow]);

  const inlineSameJobOccupied = useMemo(() => {
    if (!expandedRecord || inlineMoveRowOccupants.length === 0) return false;
    return inlineMoveRowOccupants.some(
      (o) =>
        (o.job_type || "").toUpperCase() === (expandedRecord.job_type || "").toUpperCase()
    );
  }, [inlineMoveRowOccupants, expandedRecord]);

  function toggleExpanded(item) {
    const key = `${item.workerID}-${item.rowNumber}`;
    setExpandedWorker(expandedWorker === key ? null : key);
    setActiveOperation(null);
    setInlineCheckoutStock("");
    setInlineCheckoutFeedback({ type: "info", message: "" });
    setInlineMoveTargetBlock("");
    setInlineMoveTargetRow("");
    setInlineMoveFeedback({ type: "info", message: "" });
    setInlinePendingOverride(null);
  }

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

  async function handleMove(overridePayload = null) {
    if (!moveWorker) return;
    setMoveSubmitting(true);
    setMoveFeedback({ type: "info", message: "" });

    try {
      const payload = overridePayload || {
        workerID: moveWorker.workerID,
        workerName: moveWorker.workerName,
        blockName: moveTargetBlock,
        fromRowNumber: moveWorker.rowNumber,
        toRowNumber: moveTargetRow,
        jobType: moveWorker.job_type || "",
      };

      const result = await api.moveRegularWorker(payload);
      setMoveFeedback({ type: "success", message: result.message });
      setMoveWorker(null);
      setMoveTargetBlock("");
      setMoveTargetRow("");
      setPendingMoveOverride(null);
      offlineQueue?.refreshQueueCount?.();
      checkinsState.refresh();
      setTimeout(() => setMoveOpen(false), 800);
    } catch (error) {
      if (error?.payload?.canOverride) {
        setPendingMoveOverride({
          workerID: moveWorker.workerID,
          workerName: moveWorker.workerName,
          blockName: moveTargetBlock,
          fromRowNumber: moveWorker.rowNumber,
          toRowNumber: moveTargetRow,
          jobType: moveWorker.job_type || "",
          allowMultipleWorkers: true,
        });
      } else {
        setPendingMoveOverride(null);
      }
      setMoveFeedback({ type: "error", message: error.message });
    } finally {
      setMoveSubmitting(false);
    }
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

  const resetInlineMove = () => {
    setInlineMoveTargetBlock("");
    setInlineMoveTargetRow("");
    setInlineMoveFeedback({ type: "info", message: "" });
    setInlinePendingOverride(null);
  };

  async function handleInlineCheckout() {
    if (!expandedRecord) return;
    setInlineCheckoutSubmitting(true);
    setInlineCheckoutFeedback({ type: "info", message: "" });

    try {
      const payload = {
        workerID: expandedRecord.workerID,
        workerName: expandedRecord.workerName,
        blockName: expandedRecord.blockName,
        rowNumber: expandedRecord.rowNumber,
        jobType: expandedRecord.job_type || "",
        stockCount: inlineCheckoutStock === "" ? undefined : Number(inlineCheckoutStock),
      };

      const result = await api.regularCheckout(payload);
      setInlineCheckoutFeedback({ type: "success", message: result.message });
      setInlineCheckoutStock("");
      setTimeout(() => setExpandedWorker(null), 800);
    } catch (error) {
      setInlineCheckoutFeedback({ type: "error", message: error.message });
    } finally {
      setInlineCheckoutSubmitting(false);
    }
  }

  function handleInlineBlockSelect(value) {
    setInlineMoveTargetBlock(value);
    setInlineMoveTargetRow("");
    setInlineMoveFeedback({ type: "info", message: "" });
    setInlinePendingOverride(null);
  }

  function handleInlineRowSelect(rowValue) {
    setInlineMoveTargetRow(rowValue);
    setInlineMoveFeedback({ type: "info", message: "" });
    setInlinePendingOverride(null);
  }

  async function handleInlineMove(overridePayload = null) {
    if (!expandedRecord) return;
    setInlineMoveSubmitting(true);
    setInlineMoveFeedback({ type: "info", message: "" });

    try {
      const payload = overridePayload || {
        workerID: expandedRecord.workerID,
        workerName: expandedRecord.workerName,
        blockName: inlineMoveTargetBlock,
        fromRowNumber: expandedRecord.rowNumber,
        toRowNumber: inlineMoveTargetRow,
        jobType: expandedRecord.job_type || "",
      };

      const result = await api.moveRegularWorker(payload);
      setInlineMoveFeedback({ type: "success", message: result.message });
      resetInlineMove();
      setTimeout(() => setExpandedWorker(null), 800);
    } catch (error) {
      if (error?.payload?.canOverride) {
        setInlinePendingOverride({
          workerID: expandedRecord.workerID,
          workerName: expandedRecord.workerName,
          blockName: inlineMoveTargetBlock,
          fromRowNumber: expandedRecord.rowNumber,
          toRowNumber: inlineMoveTargetRow,
          jobType: expandedRecord.job_type || "",
          allowMultipleWorkers: true,
        });
      } else {
        setInlinePendingOverride(null);
      }
      setInlineMoveFeedback({ type: "error", message: error.message });
    } finally {
      setInlineMoveSubmitting(false);
    }
  }

  async function handleInlineAllowMultiple() {
    if (!expandedRecord) return;
    setInlineOccupantsSubmitting(true);
    setInlineMoveFeedback({ type: "info", message: "" });

    try {
      const payload = {
        workerID: expandedRecord.workerID,
        workerName: expandedRecord.workerName,
        blockName: inlineMoveTargetBlock,
        fromRowNumber: expandedRecord.rowNumber,
        toRowNumber: inlineMoveTargetRow,
        jobType: expandedRecord.job_type || "",
        allowMultipleWorkers: true,
      };

      const result = await api.moveRegularWorker(payload);
      setInlineMoveFeedback({ type: "success", message: result.message });
      resetInlineMove();
      setTimeout(() => setExpandedWorker(null), 800);
    } catch (error) {
      setInlineMoveFeedback({ type: "error", message: error.message });
    } finally {
      setInlineOccupantsSubmitting(false);
    }
  }

  async function handleInlineSwapFromOccupants() {
    if (!expandedRecord || inlineMoveRowOccupants.length === 0) return;
    const swapWith =
      inlineMoveRowOccupants.find(
        (o) =>
          (o.job_type || "").toUpperCase() === (expandedRecord.job_type || "").toUpperCase()
      ) || inlineMoveRowOccupants[0];

    setInlineOccupantsSubmitting(true);
    setInlineMoveFeedback({ type: "info", message: "" });

    try {
      const result = await api.swapRegularWorkers({
        firstWorkerID: expandedRecord.workerID,
        secondWorkerID: swapWith.workerID,
        blockName: inlineMoveTargetBlock,
        firstJobType: expandedRecord.job_type || "",
        secondJobType: swapWith.job_type || "",
      });
      setInlineMoveFeedback({ type: "success", message: result.message });
      resetInlineMove();
      setTimeout(() => setExpandedWorker(null), 800);
    } catch (error) {
      setInlineMoveFeedback({ type: "error", message: error.message });
    } finally {
      setInlineOccupantsSubmitting(false);
    }
  }

  function handleInlineRejectOccupants() {
    setInlineMoveTargetRow("");
    setInlineMoveFeedback({ type: "info", message: "" });
    setInlinePendingOverride(null);
  }

  const groupedByBlock = records.reduce((acc, item) => {
    const block = item.blockName || "Unknown";
    if (!acc[block]) acc[block] = [];
    acc[block].push(item);
    return acc;
  }, {});

  const blockNames = sortNamesNumerically(Object.keys(groupedByBlock));

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
              backgroundColor: "#2D7A55",
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
              backgroundColor: "#E5ECE4",
              borderWidth: 1,
              borderColor: "#D4DFD3",
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
              {groupedByBlock[blockName].map((item, index) => {
                const isExpanded = expandedWorker === `${item.workerID}-${item.rowNumber}`;
                return (
                  <View
                    key={`${item.workerID}-${item.rowNumber}-${index}`}
                    className="rounded-xl bg-gray-50 border border-gray-100 p-3.5"
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => toggleExpanded(item)}
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
                    </TouchableOpacity>

                    {isExpanded && (
                      <>
                        <View className="flex-row gap-2 mt-2 pt-2 border-t border-gray-100">
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={{
                              flex: 1,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: "center",
                              backgroundColor: activeOperation === "checkout" ? "#2D7A55" : "#E5ECE4",
                              borderWidth: activeOperation === "checkout" ? 0 : 1,
                              borderColor: "#D4DFD3",
                              opacity:
                                activeOperation === "checkout" && inlineCheckoutSubmitting ? 0.5 : 1,
                            }}
                            disabled={activeOperation === "checkout" && inlineCheckoutSubmitting}
                            onPress={() => {
                              if (activeOperation === "checkout") {
                                handleInlineCheckout();
                              } else {
                                setActiveOperation("checkout");
                                setInlineCheckoutStock("");
                                setInlineCheckoutFeedback({ type: "info", message: "" });
                                resetInlineMove();
                              }
                            }}
                          >
                            <Text
                              style={{
                                color: activeOperation === "checkout" ? "#fff" : "#374151",
                                fontSize: 13,
                                fontWeight: "800",
                              }}
                            >
                              {activeOperation === "checkout"
                                ? inlineCheckoutSubmitting
                                  ? "Submitting..."
                                  : "Submit"
                                : "Checkout"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={{
                              flex: 1,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: "center",
                              backgroundColor: activeOperation === "move" ? "#2D7A55" : "#E5ECE4",
                              borderWidth: activeOperation === "move" ? 0 : 1,
                              borderColor: "#D4DFD3",
                              opacity:
                                activeOperation === "move" &&
                                (inlineMoveSubmitting ||
                                  !inlineMoveTargetRow ||
                                  (inlineSameJobOccupied && !inlinePendingOverride))
                                  ? 0.5
                                  : 1,
                            }}
                            disabled={
                              activeOperation === "move" &&
                              (inlineMoveSubmitting ||
                                !inlineMoveTargetRow ||
                                (inlineSameJobOccupied && !inlinePendingOverride))
                            }
                            onPress={() => {
                              if (activeOperation === "move") {
                                if (inlineMoveTargetRow && (!inlineSameJobOccupied || inlinePendingOverride)) {
                                  handleInlineMove();
                                }
                              } else {
                                setActiveOperation("move");
                                setInlineMoveTargetBlock(item.blockName);
                                setInlineMoveTargetRow("");
                                setInlineMoveFeedback({ type: "info", message: "" });
                                setInlinePendingOverride(null);
                                setInlineCheckoutStock("");
                                setInlineCheckoutFeedback({ type: "info", message: "" });
                              }
                            }}
                          >
                            <Text
                              style={{
                                color: activeOperation === "move" ? "#fff" : "#374151",
                                fontSize: 13,
                                fontWeight: "800",
                              }}
                            >
                              {activeOperation === "move"
                                ? inlineMoveSubmitting
                                  ? "Submitting..."
                                  : "Submit"
                                : "Move"}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {activeOperation === "checkout" ? (
                          <View className="mt-2 pt-2 border-t border-gray-100 gap-2.5">
                            <View className="gap-1.5">
                              <Text className="text-gray-600 text-xs font-bold">Stocks completed</Text>
                              <TextInput
                                className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-gray-900 text-[15px]"
                                value={inlineCheckoutStock}
                                onChangeText={setInlineCheckoutStock}
                                placeholder="Leave blank to complete remaining"
                                placeholderTextColor="#9ca3af"
                                keyboardType="numeric"
                              />
                            </View>
                            <FeedbackBanner
                              type={inlineCheckoutFeedback.type === "error" ? "error" : "success"}
                              message={inlineCheckoutFeedback.message}
                            />
                          </View>
                        ) : null}

                        {activeOperation === "move" ? (
                          <View className="mt-2 pt-2 border-t border-gray-100 gap-2.5">
                            <SelectField
                              label="Target block"
                              value={inlineMoveTargetBlock}
                              placeholder="Select block"
                              options={blockOptions}
                              onSelect={handleInlineBlockSelect}
                              emptyMessage="No blocks found"
                            />

                            {inlineMoveTargetBlock ? (
                              <SelectField
                                label="Target row"
                                value={inlineMoveTargetRow}
                                placeholder="Select target row"
                                options={inlineRowOptions}
                                onSelect={handleInlineRowSelect}
                                emptyMessage={
                                  inlineRowsState.loading ? "Loading rows..." : "No rows available"
                                }
                              />
                            ) : null}

                            {inlineMoveTargetRow &&
                            !inlineSameJobOccupied &&
                            inlineMoveRowOccupants.length === 0 ? (
                              <View className="rounded-2xl bg-farm-50 border border-farm-200 p-3.5 gap-1.5">
                                <Text className="text-farm-800 text-xs font-extrabold uppercase">Preview</Text>
                                <Text className="text-farm-700 text-sm leading-5">
                                  {item.workerName} will move from Row {item.rowNumber} to Row{" "}
                                  {inlineMoveTargetRow} in {inlineMoveTargetBlock}.
                                </Text>
                              </View>
                            ) : null}

                            {inlineMoveTargetRow &&
                            !inlineSameJobOccupied &&
                            inlineMoveRowOccupants.length > 0 ? (
                              <View className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 gap-1.5">
                                <Text className="text-amber-800 text-xs font-extrabold uppercase">
                                  Different job on row
                                </Text>
                                <Text className="text-amber-700 text-sm leading-5">
                                  Row {inlineMoveTargetRow} has{" "}
                                  {inlineMoveRowOccupants.map((o) => o.workerName).join(", ")} doing
                                  different jobs. Multiple jobs allowed.
                                </Text>
                              </View>
                            ) : null}

                            {inlineMoveTargetRow && inlineSameJobOccupied ? (
                              <View className="rounded-2xl bg-white border border-gray-200 p-3.5 gap-3">
                                <View className="gap-1.5">
                                  <Text className="text-gray-900 text-sm font-extrabold">Row occupied</Text>
                                  <Text className="text-gray-600 text-[13px] leading-5">
                                    {item.workerName} ({item.job_type || "N/A"}) wants to move to Row{" "}
                                    {inlineMoveTargetRow} in {inlineMoveTargetBlock}.
                                  </Text>
                                </View>

                                <View className="gap-1.5">
                                  <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                                    Currently on this row
                                  </Text>
                                  {inlineMoveRowOccupants.map((o) => (
                                    <View
                                      key={o.workerID}
                                      className="rounded-xl bg-gray-50 border border-gray-100 p-2.5 gap-0.5"
                                    >
                                      <Text className="text-gray-900 text-[13px] font-extrabold">
                                        {o.workerName} ({o.workerID})
                                      </Text>
                                      <Text className="text-gray-400 text-xs">
                                        {o.job_type || "No job"} · {elapsedSince(o.startTime)} on row
                                      </Text>
                                    </View>
                                  ))}
                                </View>

                                <View className="gap-2">
                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      borderRadius: 12,
                                      paddingVertical: 11,
                                      alignItems: "center",
                                      backgroundColor: "#16a34a",
                                      opacity: inlineOccupantsSubmitting ? 0.5 : 1,
                                    }}
                                    disabled={inlineOccupantsSubmitting}
                                    onPress={handleInlineAllowMultiple}
                                  >
                                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>
                                      {inlineOccupantsSubmitting ? "Working..." : "Allow — move here too"}
                                    </Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      borderRadius: 12,
                                      paddingVertical: 11,
                                      alignItems: "center",
                                      backgroundColor: "#f3f4f6",
                                      borderWidth: 1,
                                      borderColor: "#e5e7eb",
                                    }}
                                    disabled={inlineOccupantsSubmitting}
                                    onPress={handleInlineSwapFromOccupants}
                                  >
                                    <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                                      {inlineOccupantsSubmitting
                                        ? "Working..."
                                        : "Swap — exchange rows"}
                                    </Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                      borderRadius: 12,
                                      paddingVertical: 11,
                                      alignItems: "center",
                                      backgroundColor: "#fff",
                                      borderWidth: 1,
                                      borderColor: "#e5e7eb",
                                    }}
                                    disabled={inlineOccupantsSubmitting}
                                    onPress={handleInlineRejectOccupants}
                                  >
                                    <Text style={{ color: "#6b7280", fontSize: 13, fontWeight: "800" }}>
                                      Cancel
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : null}

                            {inlinePendingOverride ? (
                              <TouchableOpacity
                                activeOpacity={0.7}
                                style={{
                                  borderRadius: 16,
                                  paddingHorizontal: 16,
                                  paddingVertical: 14,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: "#f3f4f6",
                                  borderWidth: 1,
                                  borderColor: "#e5e7eb",
                                  opacity: inlineMoveSubmitting ? 0.5 : 1,
                                }}
                                disabled={inlineMoveSubmitting}
                                onPress={() => handleInlineMove(inlinePendingOverride)}
                              >
                                <Text style={{ fontSize: 15, fontWeight: "800", color: "#374151" }}>
                                  {inlineMoveSubmitting
                                    ? "Applying..."
                                    : "Move with same-job override"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}

                            <FeedbackBanner
                              type={inlineMoveFeedback.type === "error" ? "error" : "success"}
                              message={inlineMoveFeedback.message}
                            />
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <FeedbackBanner type="error" message={checkinsState.error} />
      </SectionCard>

      {/* ─── Move Worker Modal ─── */}
      <Modal visible={moveOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
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
        </SafeAreaView>
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
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
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
        </SafeAreaView>
      </Modal>
    </ScreenScroll>
  );
}
