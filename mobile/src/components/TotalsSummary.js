import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../i18n";

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/**
 * Summary stat pills (Workers / Vines / Hours / Days) for a totals table.
 * rows: [{ workerID, date, vines }]  hours: { `${workerID}__${dateKey}`: { hours } }
 */
export default function TotalsSummary({ rows = [], hours = {} }) {
  const { t } = useLanguage();
  const stats = useMemo(() => {
    const workerCount = new Set(rows.map((r) => r.workerID)).size;
    const vineTotal = rows.reduce((s, r) => s + (r.vines || 0), 0);
    const dayCount = new Set(rows.map((r) => dateKey(r.date))).size;

    const rowWorkerDates = new Set(rows.map((r) => `${r.workerID}__${dateKey(r.date)}`));
    const hourTotal = Object.keys(hours).reduce((s, key) => {
      return rowWorkerDates.has(key) ? s + (hours[key].hours || 0) : s;
    }, 0);

    return { workerCount, vineTotal, hourTotal, dayCount };
  }, [rows, hours]);

  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      <StatPill label={t("summary.workers")} value={stats.workerCount} color="#eff6ff" />
      <StatPill label={t("summary.vines")} value={stats.vineTotal} color="#f0fdf4" />
      <StatPill label={t("summary.hours")} value={stats.hourTotal || 0} color="#fefce8" />
      <StatPill label={t("summary.days")} value={stats.dayCount} color="#f5f3ff" />
    </View>
  );
}