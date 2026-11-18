import React, { useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as XLSX from "xlsx";
import { api } from "../api/client";
import ActionButton from "./ActionButton";
import FeedbackBanner from "./FeedbackBanner";

function normalizeParsedRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : []).map((r) => ({
    block_name: r.block_name ?? r.blockName ?? r.block ?? r.Block ?? r.BLOCK ?? "",
    row_number: r.row_number ?? r.rowNumber ?? r.row ?? r.Row ?? r.ROW ?? r.row_no ?? "",
    bunches: r.bunches ?? r.Bunches ?? r.BUNCHES ?? r.tros ?? r.Tros ?? "",
  }));
}

export default function BunchImportPanel() {
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [applying, setApplying] = useState(false);
  const fileInputRef = useRef(null);

  const diffRows = useMemo(
    () => (preview?.rows || []).filter((r) => r.status === "different"),
    [preview]
  );

  async function runPreview(rows) {
    setParsing(true);
    setFeedback({ type: "info", message: "" });
    try {
      const normalized = normalizeParsedRows(rows);
      if (!normalized.length) {
        setFeedback({ type: "error", message: "No rows found in file/data." });
        return;
      }
      const result = await api.previewUitknipBunchImport({ rows: normalized });
      setPreview({ ...result, inputRows: normalized });
      const initial = {};
      (result.rows || []).forEach((r) => {
        if (r.status === "different") {
          initial[`${r.blockName}::${r.rowNumber}`] = "skip";
        }
      });
      setDecisions(initial);
      setFeedback({ type: "success", message: `Preview ready: ${normalized.length} row(s). Review differences before applying.` });
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Preview failed." });
    } finally {
      setParsing(false);
    }
  }

  async function parseFromText(text) {
    const t = String(text || "").trim();
    if (!t) {
      setFeedback({ type: "error", message: "Paste JSON or CSV content first." });
      return;
    }
    try {
      if (t.startsWith("[") || t.startsWith("{")) {
        const parsed = JSON.parse(t);
        const rows = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.data || []);
        await runPreview(rows);
        return;
      }
      // CSV text
      const wb = XLSX.read(t, { type: "string" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      await runPreview(rows);
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Could not parse pasted content." });
    }
  }

  async function handleWebFile(file) {
    if (!file) return;
    setParsing(true);
    setFeedback({ type: "info", message: "" });
    try {
      const name = String(file.name || "").toLowerCase();
      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.data || []);
        await runPreview(rows);
        return;
      }
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      await runPreview(rows);
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Could not read file." });
      setParsing(false);
    }
  }

  async function applyImport(overwriteAllDifferent = false, skipAllDifferent = false) {
    if (!preview?.inputRows?.length) return;
    setApplying(true);
    setFeedback({ type: "info", message: "" });
    try {
      const result = await api.applyUitknipBunchImport({
        rows: preview.inputRows,
        decisions,
        overwriteAll: overwriteAllDifferent,
        skipAll: skipAllDifferent,
      });
      setFeedback({ type: "success", message: result.message || "Import applied." });
      setPreview(null);
      setDecisions({});
      setPasteText("");
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Apply failed." });
    } finally {
      setApplying(false);
    }
  }

  function setDecision(row, value) {
    const key = `${row.blockName}::${row.rowNumber}`;
    setDecisions((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: "#111827", fontSize: 16, fontWeight: "800" }}>Import Bunches (Uitknip)</Text>
      <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: 18 }}>
        Upload CSV/Excel/JSON or paste JSON/CSV with columns: block_name, row_number, bunches. Preview shows differences before applying.
      </Text>

      {Platform.OS === "web" ? (
        <View style={{ gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            onChange={(e) => handleWebFile(e.target.files && e.target.files[0])}
          />
        </View>
      ) : (
        <Text style={{ color: "#6b7280", fontSize: 12 }}>
          On mobile, paste JSON/CSV below (file picker not available in this build). On web you can upload CSV/Excel/JSON files.
        </Text>
      )}

      <Text style={{ color: "#374151", fontSize: 13, fontWeight: "700" }}>Paste JSON or CSV</Text>
      <TextInput
        value={pasteText}
        onChangeText={setPasteText}
        placeholder='[{"block_name":"Block 4","row_number":"1","bunches":1200}] or CSV text'
        placeholderTextColor="#9ca3af"
        multiline
        style={{ minHeight: 120, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, textAlignVertical: "top", color: "#111827" }}
      />
      <ActionButton label={parsing ? "Parsing..." : "Preview Import"} onPress={() => parseFromText(pasteText)} disabled={parsing || !pasteText.trim()} tone="secondary" />

      <FeedbackBanner type={feedback.type === "error" ? "error" : feedback.type === "success" ? "success" : "info"} message={feedback.message} />

      {preview ? (
        <View style={{ gap: 10 }}>
          <View style={{ backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12 }}>
            <Text style={{ color: "#111827", fontWeight: "800", marginBottom: 4 }}>Preview Summary</Text>
            <Text style={{ color: "#374151", fontSize: 13 }}>
              Total: {preview.summary?.total || 0} · Differences: {preview.summary?.differences || 0} · Missing blocks: {preview.summary?.missingBlocks || 0} · Missing rows: {preview.summary?.missingRows || 0} · Invalid: {preview.summary?.invalid || 0}
            </Text>
          </View>

          {diffRows.length ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: "#111827", fontWeight: "800" }}>Differences (choose per row)</Text>
              {diffRows.map((r) => {
                const key = `${r.blockName}::${r.rowNumber}`;
                const decision = decisions[key] || "skip";
                return (
                  <View key={key} style={{ borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", borderRadius: 12, padding: 10, gap: 6 }}>
                    <Text style={{ color: "#92400e", fontWeight: "700" }}>{r.blockName} · Row {r.rowNumber}</Text>
                    <Text style={{ color: "#78350f", fontSize: 13 }}>Existing: {r.existingBunches} bunches → Imported: {r.importedBunches} bunches</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity onPress={() => setDecision(r, "overwrite")} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: decision === "overwrite" ? "#16a34a" : "#e5e7eb" }}>
                        <Text style={{ color: decision === "overwrite" ? "#fff" : "#374151", fontWeight: "700" }}>Overwrite</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDecision(r, "skip")} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: decision === "skip" ? "#374151" : "#e5e7eb" }}>
                        <Text style={{ color: decision === "skip" ? "#fff" : "#374151", fontWeight: "700" }}>Skip</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: "#166534", fontSize: 13 }}>No differences found for existing rows. New/same rows can be applied.</Text>
          )}

          <View style={{ gap: 8 }}>
            <ActionButton label={applying ? "Applying..." : "Apply Import (use selections)"} onPress={() => applyImport(false, false)} disabled={applying} />
            {diffRows.length ? (
              <>
                <ActionButton label="Apply: Overwrite All Differences" onPress={() => applyImport(true, false)} disabled={applying} tone="secondary" />
                <ActionButton label="Apply: Skip All Differences" onPress={() => applyImport(false, true)} disabled={applying} tone="secondary" />
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
