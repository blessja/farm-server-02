import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "../api/client";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import SelectField from "../components/SelectField";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import { useAsyncData } from "../hooks/useAsyncData";
import { useLanguage } from "../i18n";
import REGISTER_TEAMS from "../../../registar";

const TIMEZONE = "Africa/Johannesburg";
const DAY_COLUMNS = [
  { label: "Wed", offset: 0 },
  { label: "Thu", offset: 1 },
  { label: "Fri", offset: 2 },
  { label: "Sat", offset: 3 },
  { label: "Mon", offset: 5 },
  { label: "Tue", offset: 6 },
];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_REGISTER_TABLE_WIDTH = 1040;

function sastDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function registerWeek(weekOffset = 0) {
  const today = sastDate(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceWednesday = (todayDate.getUTCDay() + 4) % 7;
  const wednesday = new Date(
    Date.UTC(year, month - 1, day - daysSinceWednesday)
  );
  wednesday.setUTCDate(wednesday.getUTCDate() + weekOffset * 7);

  return DAY_COLUMNS.map(({ label, offset }) => {
    const date = new Date(wednesday);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateKey = date.toISOString().slice(0, 10);
    const displayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
    }).format(date);
    return { label, date: dateKey, displayDate };
  });
}

function sastTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function sastTimestamp(date, time) {
  return new Date(`${date}T${time}:00+02:00`).toISOString();
}

function punchTimeForDate(date, fallbackTime, todayDate) {
  const punchTime = date < todayDate ? fallbackTime : sastTime(new Date());
  return sastTimestamp(date, punchTime);
}

function minutesBetween(start, end) {
  if (!TIME_PATTERN.test(start || "") || !TIME_PATTERN.test(end || "")) {
    return 0;
  }
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(
    0,
    endHour * 60 + endMinute - (startHour * 60 + startMinute)
  );
}

function formatHours(minutes) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function formatRegisterDate(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function TimeEditor({ value, onCommit, accessibilityLabel, textColor = "#111827" }) {
  const [draft, setDraft] = useState(value || "");

  React.useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit(nextValue) {
    if (TIME_PATTERN.test(nextValue) && nextValue !== value) {
      onCommit(nextValue);
    }
  }

  if (Platform.OS === "web") {
    return (
      <input
        className="attendance-register-time-input"
        aria-label={accessibilityLabel}
        type="time"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        style={{
          minWidth: 0,
          flex: 1,
          width: 0,
          boxSizing: "border-box",
          border: 0,
          background: "transparent",
          color: textColor,
          fontSize: 10,
        }}
      />
    );
  }

  return (
    <TextInput
      className="attendance-register-time-input"
      accessibilityLabel={accessibilityLabel}
      value={draft}
      onChangeText={setDraft}
      onBlur={() => commit(draft)}
      placeholder="HH:MM"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      style={{
        minWidth: 0,
        flex: 1,
        width: 0,
        padding: 0,
        color: textColor,
        fontSize: 12,
      }}
    />
  );
}

function SettingTimeInput({ value, onChange, accessibilityLabel }) {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => setDraft(value), [value]);

  const inputStyle = {
    width: 78,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#fff",
    color: "#111827",
    fontSize: 13,
  };

  if (Platform.OS === "web") {
    return (
      <input
        aria-label={accessibilityLabel}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    );
  }

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      value={draft}
      onChangeText={setDraft}
      onBlur={() => {
        if (TIME_PATTERN.test(draft)) onChange(draft);
        else setDraft(value);
      }}
      maxLength={5}
      placeholder="08:00"
      keyboardType="numbers-and-punctuation"
      style={inputStyle}
    />
  );
}

function TimeSlot({ label, value, flagged, onCommit, onPunch, disabled, t }) {
  const isClockIn = label === "In";
  const slotBackground = flagged
    ? isClockIn
      ? "#f6d978"
      : "#f03b4d"
    : isClockIn
      ? "#168447"
      : "#f1f5f9";
  const slotText = flagged || !isClockIn ? "#0f172a" : "#ffffff";

  if (!value) {
    return (
      <TouchableOpacity
        className="attendance-register-empty-time"
        accessibilityRole="button"
        activeOpacity={0.75}
        disabled={disabled}
        onPress={onPunch}
        style={{
          minHeight: 27,
          borderRadius: 5,
          backgroundColor: disabled && isClockIn ? "#9fbaa9" : slotBackground,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 7,
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <Text
          style={{
            color: slotText,
            fontSize: 10,
            fontWeight: "600",
          }}
        >
          {label === "In" ? t("attendance.clockIn") : t("attendance.clockOut")}
        </Text>
        <Text style={{ color: "#879087", fontSize: 13, fontWeight: "700" }}>—</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      className={`attendance-register-time-slot${flagged ? (label === "In" ? " attendance-register-time-late" : " attendance-register-time-early") : ""}`}
      style={{
        minHeight: 27,
        borderRadius: 5,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        backgroundColor: slotBackground,
      }}
    >
      <Text
        className="attendance-register-time-label"
        style={{
          width: 17,
          color: slotText,
          fontSize: 9,
          fontWeight: "700",
          textTransform: "uppercase",
        }}
      >
        {label === "In" ? t("attendance.clockIn") : t("attendance.clockOut")}
      </Text>
      <TimeEditor
        value={value}
        onCommit={onCommit}
        textColor={slotText}
        accessibilityLabel={label === "In" ? t("attendance.editClockIn") : t("attendance.editClockOut")}
      />
    </View>
  );
}

export default function AttendanceRegisterScreen({ offlineQueue }) {
  const { t } = useLanguage();
  const { width: viewportWidth } = useWindowDimensions();
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [busyKey, setBusyKey] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [selectedTeam, setSelectedTeam] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => registerWeek(weekOffset), [weekOffset]);
  const todayDate = sastDate(new Date());
  const registerTableWidth = Math.max(
    MIN_REGISTER_TABLE_WIDTH,
    Math.min(viewportWidth, 1440) - 88
  );
  const nameColumnWidth = 220;
  const summaryColumnWidth = 150;
  const dayColumnWidth =
    (registerTableWidth -
      nameColumnWidth -
      summaryColumnWidth) /
    DAY_COLUMNS.length;
  const legacyWeekDateRange = `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${weekDays[0].date}T12:00:00Z`))}–${new Intl.DateTimeFormat(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  ).format(new Date(`${weekDays[weekDays.length - 1].date}T12:00:00Z`))}`;

  const weekDateRange = `${formatRegisterDate(weekDays[0].date)} - ${formatRegisterDate(
    weekDays[weekDays.length - 1].date
  )}`;

  const clockState = useAsyncData(() => api.getClockData(), [], {
    cacheKey: "clocks",
    staleTime: 60 * 1000,
  });

  const teamOptions = useMemo(
    () =>
      Object.keys(REGISTER_TEAMS).map((team) => ({
        label: team,
        value: team,
      })),
    []
  );
  const workers = selectedTeam ? REGISTER_TEAMS[selectedTeam] || [] : [];
  const clocksByWorker = useMemo(() => {
    const byID = new Map();
    (Array.isArray(clockState.data) ? clockState.data : []).forEach((worker) => {
      byID.set(String(worker.workerID), worker);
    });
    return byID;
  }, [clockState.data]);

  // The server returns the saved session with every punch. Apply it locally
  // first so the button changes immediately instead of waiting for a full
  // download of every worker's clock history.
  function applySession(worker, session) {
    if (!session) return;
    clockState.setData((current) => {
      const records = Array.isArray(current) ? [...current] : [];
      const recordIndex = records.findIndex(
        (record) => String(record.workerID) === String(worker.workerID)
      );
      const record =
        recordIndex >= 0
          ? { ...records[recordIndex], clockIns: [...(records[recordIndex].clockIns || [])] }
          : { workerID: String(worker.workerID), workerName: worker.name, clockIns: [] };
      const sessionIndex = record.clockIns.findIndex(
        (item) => String(item._id) === String(session._id)
      );

      if (sessionIndex >= 0) record.clockIns[sessionIndex] = session;
      else record.clockIns.push(session);

      if (recordIndex >= 0) records[recordIndex] = record;
      else records.push(record);
      return records;
    });
  }

  function sessionsForDay(workerID, date) {
    const clockRecord = clocksByWorker.get(String(workerID));
    return (Array.isArray(clockRecord?.clockIns) ? clockRecord.clockIns : [])
      .filter((session) => session.clockInTime && sastDate(session.clockInTime) === date)
      .slice()
      .sort((a, b) => new Date(a.clockInTime) - new Date(b.clockInTime));
  }

  function workerSummary(workerID) {
    let present = 0;
    let late = 0;
    let early = 0;
    let minutes = 0;

    weekDays.forEach((day) => {
      const sessions = sessionsForDay(workerID, day.date);
      if (!sessions.length) return;
      present += 1;
      if (sessions.some((session) => sastTime(session.clockInTime) > startTime)) {
        late += 1;
      }
      if (sessions.some((session) => session.clockOutTime && sastTime(session.clockOutTime) < endTime)) {
        early += 1;
      }
      sessions.forEach((session) => {
        if (session.clockOutTime) {
          minutes += minutesBetween(
            sastTime(session.clockInTime),
            sastTime(session.clockOutTime)
          );
        }
      });
    });

    return { present, late, early, minutes };
  }

  async function refreshRegister() {
    await clockState.refresh();
  }

  async function handlePunchIn(worker, day) {
    const key = `${worker.workerID}-${day.date}-in`;
    setBusyKey(key);
    setFeedback({ type: "info", message: "" });
    try {
      const result = await api.clockIn({
        workerID: String(worker.workerID),
        workerName: worker.name,
        timezone: TIMEZONE,
        clockInAt: punchTimeForDate(day.date, startTime, todayDate),
      });
      setFeedback({
        type: "success",
        message:
          day.date < todayDate
            ? `${result.message} ${t("attendance.backdatedIn", { time: startTime })}`
            : result.message,
      });
      applySession(worker, result.session);
      void offlineQueue.refreshQueueCount();
      // Reconcile silently in the background; do not hold up the next punch.
      void clockState.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setBusyKey("");
    }
  }

  async function handleWorkerNamePress(worker) {
    const todaySessions = sessionsForDay(String(worker.workerID), todayDate);
    const hasTodayIn = todaySessions.some((session) => session.clockInTime);
    if (hasTodayIn) return;
    await handlePunchIn(worker, { date: todayDate });
  }

  async function handlePunchOut(worker, day, session) {
    const key = `${worker.workerID}-${session._id}-out`;
    setBusyKey(key);
    setFeedback({ type: "info", message: "" });
    try {
      const result = await api.clockOut({
        workerID: String(worker.workerID),
        workerName: worker.name,
        timezone: TIMEZONE,
        sessionID: session._id,
        clockOutAt: punchTimeForDate(day.date, endTime, todayDate),
      });
      setFeedback({
        type: "success",
        message:
          day.date < todayDate
            ? `${result.message} ${t("attendance.backdatedOut", { time: endTime })}`
            : result.message,
      });
      applySession(worker, result.session);
      void offlineQueue.refreshQueueCount();
      void clockState.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setBusyKey("");
    }
  }

  async function handleEditTime(worker, session, field, value) {
    if (!session._id || !TIME_PATTERN.test(value)) return;
    setBusyKey(`${worker.workerID}-${session._id}-${field}`);
    setFeedback({ type: "info", message: "" });
    try {
      await api.updateClockSession(worker.workerID, session._id, {
        field,
        time: sastTimestamp(sastDate(session.clockInTime), value),
      });
      setFeedback({ type: "success", message: t("attendance.updated") });
      applySession(worker, result.session);
      void clockState.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setBusyKey("");
    }
  }

  async function handleExport() {
    const printWindow =
      Platform.OS === "web" ? window.open("", "_blank") : null;
    if (Platform.OS === "web" && !printWindow) {
      setFeedback({
        type: "error",
        message: t("attendance.popupBlocked"),
      });
      return;
    }

    const printDays = weekDays.map((day) => ({
      ...day,
      label: t(`attendance.day.${day.label}`),
    }));
    const workerRows = workers
      .map((worker, index) => {
        const summary = workerSummary(worker.workerID);
        const dayCells = weekDays
          .map((day) => {
            const sessions = sessionsForDay(worker.workerID, day.date);
            const entries = sessions.length
              ? sessions
                  .map((session) => {
                    const clockIn = sastTime(session.clockInTime);
                    const clockOut = sastTime(session.clockOutTime);
                    const late = clockIn > startTime;
                    const early = !!clockOut && clockOut < endTime;
                    return `<div class="print-entry">
                      <div class="print-time${late ? " late" : ""}"><span>In</span><strong>${escapeHtml(clockIn || "—")}</strong></div>
                      <div class="print-time${early ? " early" : ""}"><span>Out</span><strong>${escapeHtml(clockOut || "—")}</strong></div>
                    </div>`;
                  })
                  .join("")
              : `<div class="print-entry">
                  <div class="print-time empty"><span>In</span><strong>—</strong></div>
                  <div class="print-time empty"><span>Out</span><strong>—</strong></div>
                </div>`;
            return `<td>${entries}</td>`;
          })
          .join("");
        return `<tr>
          <th scope="row" class="worker-name">${escapeHtml(worker.workerID)} ${escapeHtml(worker.name)}</th>
          ${dayCells}
          <td class="summary">
            <strong>Present: ${summary.present}/${weekDays.length}</strong>
            <span>Late: ${summary.late} · Early: ${summary.early}</span>
            <span>Hours: ${formatHours(summary.minutes)}</span>
          </td>
        </tr>`;
      })
      .join("");
    const dateRange = `${printDays[0].displayDate}–${printDays[printDays.length - 1].displayDate}`;

    try {
      const html = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(t("attendance.title"))} - ${escapeHtml(selectedTeam)}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            html, body { margin: 0; padding: 0; color: #202722; font: 9px Arial, Helvetica, sans-serif; }
            body { background: #fffdfa; }
            .register { width: 100%; padding: 0; }
            header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 10px; }
            .eyebrow { margin: 0 0 4px; color: #244d3b; font-size: 8px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
            h1 { margin: 0; font: 500 25px Georgia, "Times New Roman", serif; }
            .week { margin: 4px 0 0; color: #697169; font: 11px Georgia, "Times New Roman", serif; }
            .team { margin: 5px 0 0; color: #244d3b; font-size: 9px; font-weight: 700; }
            .schedule { display: flex; align-items: center; gap: 18px; border-top: 1px solid #d2d1c9; padding: 8px 0; margin-bottom: 6px; }
            .schedule-item { color: #697169; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; }
            .schedule-item strong { display: block; margin-top: 4px; color: #202722; font-size: 11px; letter-spacing: 0; }
            .legend { display: flex; gap: 12px; margin-left: auto; color: #697169; font-size: 8px; letter-spacing: 0; text-transform: none; }
            .legend span { display: inline-flex; align-items: center; gap: 4px; }
            .legend i { width: 7px; height: 7px; border-radius: 50%; }
            table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8px; }
            col.name { width: 19%; } col.day { width: 11.5%; } col.summary-col { width: 12%; }
            thead { display: table-header-group; }
            thead th { padding: 6px 5px; background: #244d3b; color: #fff; font-size: 7px; letter-spacing: .8px; text-align: left; text-transform: uppercase; }
            th, td { border: 1px solid #d2d1c9; padding: 4px; vertical-align: top; }
            tbody tr { break-inside: avoid; page-break-inside: avoid; }
            tbody tr:nth-child(even) { background: #f3f2ed; }
            .worker-name { font: 600 9px Georgia, "Times New Roman", serif; text-align: left; }
            .print-entry + .print-entry { margin-top: 3px; }
            .print-time { display: flex; align-items: center; justify-content: space-between; gap: 3px; min-height: 14px; border-radius: 3px; background: #ebe8e0; padding: 2px 4px; }
            .print-time span { color: #697169; font-size: 6px; font-weight: 700; text-transform: uppercase; }
            .print-time strong { font-size: 7px; font-weight: 600; }
            .print-time.late { background: #f6d978; color: #4d3a00; }
            .print-time.early { background: #f0a09a; color: #5b1713; }
            .print-time.empty { color: #697169; }
            .summary { line-height: 1.45; white-space: nowrap; }
            .summary strong, .summary span { display: block; }
            .summary span { color: #697169; }
            @media screen { body { max-width: 277mm; margin: 16px auto; padding: 14mm; box-shadow: 0 2px 14px rgba(32,39,34,.15); } }
          </style>
        </head>
        <body>
          <main class="register">
            <header>
              <div>
                <p class="eyebrow">${escapeHtml(t("attendance.eyebrow"))}</p>
                <h1>${escapeHtml(t("attendance.title"))}</h1>
                <p class="week">${escapeHtml(t("attendance.weekOf", { range: dateRange }))}</p>
                <p class="team">${escapeHtml(t("attendance.team"))}: ${escapeHtml(selectedTeam)}</p>
              </div>
            </header>
            <div class="schedule">
              <div class="schedule-item">${escapeHtml(t("attendance.startTime"))}<strong>${escapeHtml(startTime)}</strong></div>
              <div class="schedule-item">${escapeHtml(t("attendance.endTime"))}<strong>${escapeHtml(endTime)}</strong></div>
              <div class="legend">
                <span><i style="background:#f6d978"></i>${escapeHtml(t("attendance.late"))}</span>
                <span><i style="background:#f0a09a"></i>${escapeHtml(t("attendance.leftEarly"))}</span>
              </div>
            </div>
            <table>
              <colgroup>
                <col class="name" />
                ${printDays.map(() => '<col class="day" />').join("")}
                <col class="summary-col" />
              </colgroup>
              <thead><tr>
                <th>${escapeHtml(t("attendance.name"))}</th>
                ${printDays.map((day) => `<th>${escapeHtml(day.label)}<br />${escapeHtml(day.displayDate)}</th>`).join("")}
                <th>${escapeHtml(t("attendance.summary"))}</th>
              </tr></thead>
              <tbody>${workerRows}</tbody>
            </table>
          </main>
        </body>
      </html>`;

      if (Platform.OS === "web") {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.onafterprint = () => printWindow.close();
        printWindow.setTimeout(() => printWindow.print(), 300);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: t("attendance.exportPdf"),
        });
      }
      setFeedback({ type: "success", message: t("attendance.pdfReady") });
    } catch (error) {
      if (printWindow) printWindow.close();
      setFeedback({
        type: "error",
        message: error?.message || t("attendance.pdfError"),
      });
    }
  }

  return (
    <ScreenScroll
      nativeID="attendance-register-screen-scroll"
      refreshing={clockState.loading}
      onRefresh={refreshRegister}
    >
      {Platform.OS === "web" ? (
        <style>{`#attendance-register-screen-scroll { background: #f4f1ea; }
          #attendance-register-register {
            background: #fffdfa; border: 1px solid #d2d1c9; border-radius: 12px;
            box-shadow: 0 8px 32px rgba(32, 39, 34, .08); padding: 28px;
            box-sizing: border-box;
          }
          #attendance-register-main-card, #attendance-register-week-card {
            background: transparent !important; border: 0 !important; box-shadow: none !important;
            border-radius: 0 !important; padding: 0 !important;
          }
          #attendance-register-main-card > div:first-child > div:nth-child(2) {
            align-items: flex-start;
          }
          #attendance-register-week-card > div:first-child { display: none; }
          #attendance-register-table-scroll { border: 1px solid #d2d1c9; border-radius: 6px; }
          #attendance-register-table > :first-child {
            background: #244d3b !important; color: #fff !important;
          }
          #attendance-register-table > :first-child > * { color: #fff !important; }
          #attendance-register-table > :first-child .attendance-register-day-column * {
            color: #fff !important;
          }
          #attendance-register-table > :first-child > .attendance-register-name-column {
            background: #244d3b !important;
          }
          .attendance-register-name-column {
            position: sticky; left: 0; z-index: 2;
            background-color: inherit; box-shadow: 5px 0 8px rgba(32, 39, 34, .06);
            flex-shrink: 0;
          }
          #attendance-register-table > :first-child > .attendance-register-name-column {
            z-index: 3;
          }
          .attendance-register-day-column, .attendance-register-summary-column { flex-shrink: 0; }
          @media (max-width: 640px) {
            #attendance-register-register { padding: 16px; }
            #attendance-register-main-card > div:first-child > div:nth-child(2) {
              flex-direction: column; align-items: stretch;
            }
            #attendance-register-export { align-self: flex-start; }
          }
          @page { size: A4 landscape; margin: 8mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            html, body, #root { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; }
            #root, #root > div, #root > div > div, #root > div > div > div {
              display: block !important; height: auto !important; min-height: 0 !important;
              max-height: none !important; overflow: visible !important;
            }
            body * { visibility: hidden !important; }
            #attendance-register-print-root, #attendance-register-print-root * { visibility: visible !important; }
            #attendance-register-print-root {
              position: static !important; inset: auto !important; z-index: auto !important;
              display: block !important; box-sizing: border-box !important; width: 100% !important;
              height: auto !important; min-height: 0 !important; max-height: none !important;
              max-width: none !important; padding: 0 !important; overflow: visible !important;
              background: #fff !important;
            }
            #attendance-register-screen-scroll, #attendance-register-screen-scroll > div {
              display: block !important; position: static !important; height: auto !important;
              min-height: 0 !important; max-height: none !important; overflow: visible !important;
            }
            #attendance-register-screen-scroll > div { padding: 0 !important; }
            #attendance-register-export, #attendance-register-team-selector,
            #attendance-register-print-root [role="button"] { display: none !important; }
            #attendance-register-team-print { display: block !important; }
            #attendance-register-table-scroll, #attendance-register-table-scroll > div {
              display: block !important; width: 100% !important; max-width: 100% !important;
              overflow: visible !important;
            }
            #attendance-register-table { width: 100% !important; min-width: 0 !important; }
            .attendance-register-worker-row {
              break-inside: avoid !important; page-break-inside: avoid !important;
            }
            .attendance-register-name-column {
              position: static !important; z-index: auto !important;
              box-shadow: none !important;
              flex: 0 0 14% !important; width: 14% !important;
              box-sizing: border-box !important; padding: 4px !important; font-size: 9px !important;
            }
            .attendance-register-day-column {
              flex: 0 0 11.3% !important; width: 11.3% !important; min-width: 0 !important;
              box-sizing: border-box !important; padding: 3px !important; gap: 2px !important;
            }
            .attendance-register-summary-column {
              flex: 0 0 11% !important; width: 11% !important; min-width: 0 !important;
              box-sizing: border-box !important; padding: 4px !important; font-size: 8px !important;
            }
            .attendance-register-time-slot {
              min-height: 18px !important; padding-left: 2px !important;
              padding-right: 2px !important; gap: 1px !important;
            }
            .attendance-register-time-label { width: 14px !important; font-size: 8px !important; }
            .attendance-register-time-input {
              width: 0 !important; min-width: 0 !important; font-size: 8px !important;
              padding: 0 !important;
            }
          }
          #attendance-register-screen-scroll { background: #f4f1ea; }
          #attendance-register-register {
            width: 100%; max-width: 1440px; margin: 0 auto; padding: 28px;
            box-sizing: border-box; gap: 22px; background: #fffdfa;
            border: 1px solid #d2d1c9; border-radius: 12px;
            box-shadow: 0 8px 32px rgba(32, 39, 34, .08);
          }
          #attendance-register-main-card, #attendance-register-week-card {
            width: 100%; padding: 0 !important; background: transparent !important;
            border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
          }
          #attendance-register-main-card > div:first-child { margin-bottom: 16px; }
          #attendance-register-main-card > div:first-child > div:nth-child(2) { align-items: flex-start; }
          #attendance-register-week-card > div:first-child { display: none; }
          #attendance-register-toolbar {
            display: flex; flex-direction: row; flex-wrap: wrap;
            align-items: flex-end; justify-content: space-between;
            gap: 14px; border-top: 1px solid #d2d1c9; padding-top: 14px;
          }
          #attendance-register-team-selector { width: 250px; flex: 1 1 220px; }
          #attendance-register-team-selector > div { gap: 6px; }
          #attendance-register-team-selector [role="button"] {
            min-height: 40px; border-color: #d2d1c9; border-radius: 6px; padding: 8px 12px;
          }
          /* Let every column move together while horizontally scrolling.
             Fixed name columns caused long names to cover the clock cells. */
          .attendance-register-name-column { position: static !important; overflow: hidden !important; box-shadow: none !important; }
          #attendance-register-schedule { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; }
          #attendance-register-legend { display: flex; align-items: center; gap: 14px; }
          .attendance-register-legend-item { display: flex; align-items: center; gap: 6px; color: #697169; font-size: 11px; }
          .attendance-register-legend-dot { width: 10px; height: 10px; border-radius: 50%; }
          #attendance-register-table-scroll {
            width: 100%; max-width: 100%; overflow-x: auto !important; overflow-y: hidden !important;
            border: 1px solid #d2d1c9; border-radius: 6px;
            -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain;
            scrollbar-width: thin; touch-action: pan-x pan-y;
          }
          #attendance-register-table { flex-shrink: 0; max-width: none; }
          #attendance-register-table > :first-child {
            min-height: 36px; background: #244d3b !important; color: #fff !important;
            text-transform: uppercase; letter-spacing: .8px;
          }
          #attendance-register-table > :first-child > * { color: #fff !important; }
          #attendance-register-table > :first-child .attendance-register-day-column * { color: #fff !important; }
          #attendance-register-table > :first-child > .attendance-register-name-column { background: #244d3b !important; }
          .attendance-register-worker-row { min-height: 58px; border-top: 1px solid #d2d1c9; }
          .attendance-register-worker-row:nth-child(even) { background: #f3f2ed !important; }
          .attendance-register-name-column,
          .attendance-register-day-column, .attendance-register-summary-column { flex-shrink: 0; }
          .attendance-register-name-column {
            position: sticky; left: 0; z-index: 2;
            background-color: inherit; box-shadow: 5px 0 8px rgba(32, 39, 34, .08);
            box-sizing: border-box; border-right: 1px solid #d2d1c9;
          }
          .attendance-register-day-column, .attendance-register-summary-column { box-sizing: border-box; }
          #attendance-register-table > :first-child > .attendance-register-name-column { z-index: 3; }
          .attendance-register-day-column { border-left: 1px solid #e1e2dc; }
          .attendance-register-summary-column { border-left: 1px solid #d2d1c9; }
          .attendance-register-empty-time { border: 0; font: inherit; }
          .attendance-register-time-input { outline: none; }
          @media (max-width: 640px) {
            #attendance-register-register { padding: 16px; gap: 16px; }
            #attendance-register-toolbar { align-items: stretch; flex-direction: column; }
            #attendance-register-team-selector { width: 100%; flex: auto; }
            #attendance-register-schedule { justify-content: space-between; }
            #attendance-register-main-card > div:first-child > div:nth-child(2) {
              flex-direction: column; align-items: flex-start;
            }
            #attendance-register-export { align-self: flex-start; }
            .attendance-register-worker-row { min-height: 56px; }
          }`}</style>
      ) : null}
      <View
        nativeID="attendance-register-register"
        style={{
          width: "100%",
          maxWidth: 1440,
          alignSelf: "center",
          gap: 20,
          padding: 28,
          backgroundColor: "#fffdfa",
          borderColor: "#d2d1c9",
          borderWidth: 1,
          borderRadius: 12,
        }}
      >
      <View nativeID="attendance-register-print-root" style={{ gap: 14 }}>
      <SectionCard
        title={t("attendance.title")}
        subtitle={t("attendance.weekOf", { range: weekDateRange })}
        eyebrow={t("attendance.eyebrow")}
        nativeID="attendance-register-main-card"
        flat
        headerRight={
          <View nativeID="attendance-register-export">
            <ActionButton
              label={t("attendance.exportPdf")}
              onPress={handleExport}
              disabled={!selectedTeam || !workers.length}
            />
          </View>
        }
      >
        <View
          nativeID="attendance-register-toolbar"
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}
        >
        <View nativeID="attendance-register-team-selector">
          <SelectField
            label={t("attendance.team")}
            value={selectedTeam}
            placeholder={t("attendance.selectTeam")}
            options={teamOptions}
            onSelect={setSelectedTeam}
          />
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <TouchableOpacity
            onPress={() => setWeekOffset((offset) => offset - 1)}
            style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" }}
          >
            <Text style={{ color: "#334155", fontSize: 12, fontWeight: "700" }}>{t("attendance.previousWeek")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setWeekOffset(0)}
            style={{ borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#f0fdf4" }}
          >
            <Text style={{ color: "#166534", fontSize: 12, fontWeight: "800" }}>{weekDateRange}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={weekOffset >= 0}
            onPress={() => setWeekOffset((offset) => Math.min(0, offset + 1))}
            style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff", opacity: weekOffset >= 0 ? 0.45 : 1 }}
          >
            <Text style={{ color: "#334155", fontSize: 12, fontWeight: "700" }}>{t("attendance.nextWeek")}</Text>
          </TouchableOpacity>
        </View>
        <View
          nativeID="attendance-register-schedule"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text className="text-gray-600 text-xs font-bold">
              {t("attendance.startTime")}
            </Text>
            <SettingTimeInput
              accessibilityLabel={t("attendance.startTime")}
              value={startTime}
              onChange={setStartTime}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text className="text-gray-600 text-xs font-bold">
              {t("attendance.endTime")}
            </Text>
            <SettingTimeInput
              accessibilityLabel={t("attendance.endTime")}
              value={endTime}
              onChange={setEndTime}
            />
          </View>
          <View nativeID="attendance-register-legend">
            <View className="attendance-register-legend-item">
              <View
                className="attendance-register-legend-dot"
                style={{ backgroundColor: "#f6d978" }}
              />
              <Text>{t("attendance.late")}</Text>
            </View>
            <View className="attendance-register-legend-item">
              <View
                className="attendance-register-legend-dot"
                style={{ backgroundColor: "#f0a09a" }}
              />
              <Text>{t("attendance.leftEarly")}</Text>
            </View>
          </View>
        </View>
        </View>
        <FeedbackBanner
          type="error"
          message={clockState.error}
        />
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>

      <SectionCard
        title={t("attendance.weekTitle")}
        flat
        nativeID="attendance-register-week-card"
      >
        {selectedTeam ? (
          <Text
            nativeID="attendance-register-team-print"
            style={{ display: "none", fontSize: 14, fontWeight: "700" }}
          >
            {selectedTeam}
          </Text>
        ) : null}
        {clockState.loading && !clockState.data ? (
          <ActivityIndicator color="#16a34a" />
        ) : !selectedTeam ? (
          <Text className="text-gray-500 text-sm">
            {t("attendance.selectTeamPrompt")}
          </Text>
        ) : workers.length ? (
          <ScrollView
            horizontal
            nativeID="attendance-register-table-scroll"
            showsHorizontalScrollIndicator
          >
            <View
              nativeID="attendance-register-table"
              style={{ width: registerTableWidth }}
            >
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: "#244d3b",
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                }}
              >
                <Text
                  className="attendance-register-name-column"
                  style={{
                    width: nameColumnWidth,
                    padding: 6,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: "800",
                  }}
                >
                  {t("attendance.name")}
                </Text>
                {weekDays.map((day) => (
                  <View
                    key={day.date}
                    className="attendance-register-day-column"
                    style={{
                      width: dayColumnWidth,
                      alignItems: "center",
                      padding: 4,
                      borderLeftWidth: 1,
                      borderLeftColor: "#e2e8f0",
                    }}
                  >
                    <Text style={{ color: "#1f2937", fontSize: 10, fontWeight: "800" }}>
                      {t(`attendance.day.${day.label}`)}
                    </Text>
                    <Text style={{ color: "#64748b", fontSize: 9 }}>
                      {day.displayDate}
                    </Text>
                  </View>
                ))}
                <Text
                  className="attendance-register-summary-column"
                  style={{
                    width: summaryColumnWidth,
                    padding: 6,
                    color: "#1f2937",
                    textAlign: "center",
                    fontSize: 10,
                    fontWeight: "800",
                    borderLeftWidth: 1,
                    borderLeftColor: "#e2e8f0",
                  }}
                >
                  {t("attendance.summary")}
                </Text>
              </View>
              {workers.map((worker, index) => {
                const summary = workerSummary(worker.workerID);
                return (
                  <View
                    key={worker.workerID}
                    className="attendance-register-worker-row"
                    style={{
                      flexDirection: "row",
                      backgroundColor: index % 2 ? "#f8fafc" : "#fff",
                      borderTopWidth: 1,
                      borderTopColor: "#e2e8f0",
                    }}
                  >
                    <TouchableOpacity
                      className="attendance-register-name-column"
                      onPress={() => handleWorkerNamePress(worker)}
                      activeOpacity={0.7}
                      style={{ flex: 1, flexShrink: 1 }}
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={{
                          width: nameColumnWidth,
                          padding: 6,
                          overflow: "hidden",
                          color: "#111827",
                          fontSize: 10,
                          fontWeight: "700",
                          alignSelf: "center",
                        }}
                      >
                        {`${worker.workerID} ${worker.name}`}
                      </Text>
                    </TouchableOpacity>
                    {weekDays.map((day) => {
                      const sessions = sessionsForDay(worker.workerID, day.date);
                      const cellBusy = busyKey.startsWith(`${worker.workerID}-${day.date}`);
                      return (
                        <View
                          key={`${worker.workerID}-${day.date}`}
                          className="attendance-register-day-column"
                          style={{
                            width: dayColumnWidth,
                            padding: 3,
                            gap: 2,
                            borderLeftWidth: 1,
                            borderLeftColor: "#e2e8f0",
                          }}
                        >
                          {!sessions.length ? (
                            <View style={{ gap: 4 }}>
                              <TimeSlot
                                label="In"
                                disabled={!!busyKey || day.date > todayDate}
                                onPunch={() => handlePunchIn(worker, day)}
                                t={t}
                              />
                              <TimeSlot
                                label="Out"
                                disabled
                                t={t}
                              />
                            </View>
                          ) : (
                            sessions.map((session) => {
                              const clockIn = sastTime(session.clockInTime);
                              const clockOut = sastTime(session.clockOutTime);
                              return (
                                <View key={session._id || `${worker.workerID}-${clockIn}`} style={{ gap: 4, opacity: cellBusy ? 0.55 : 1 }}>
                                  <TimeSlot
                                    label="In"
                                    value={clockIn}
                                    flagged={clockIn > startTime}
                                    disabled={!!busyKey}
                                    onCommit={(value) =>
                                      handleEditTime(worker, session, "clockInTime", value)
                                    }
                                    t={t}
                                  />
                                  <TimeSlot
                                    label="Out"
                                    value={clockOut}
                                    flagged={!!clockOut && clockOut < endTime}
                                    disabled={!clockIn || !!clockOut || !!busyKey}
                                    onPunch={() => handlePunchOut(worker, day, session)}
                                    onCommit={(value) =>
                                      handleEditTime(worker, session, "clockOutTime", value)
                                    }
                                    t={t}
                                  />
                                </View>
                              );
                            })
                          )}
                        </View>
                      );
                    })}
                    <View
                      className="attendance-register-summary-column"
                      style={{
                        width: summaryColumnWidth,
                        justifyContent: "center",
                        padding: 8,
                        borderLeftWidth: 1,
                        borderLeftColor: "#e2e8f0",
                      }}
                    >
                      <Text style={{ color: "#111827", fontSize: 10 }}>
                        {t("attendance.present", {
                          count: summary.present,
                          total: weekDays.length,
                        })}
                      </Text>
                      <Text style={{ color: "#111827", fontSize: 10 }}>
                        {t("attendance.lateEarly", {
                          late: summary.late,
                          early: summary.early,
                        })}
                      </Text>
                      <Text style={{ color: "#111827", fontSize: 10 }}>
                        {t("attendance.hours", { hours: formatHours(summary.minutes) })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <Text className="text-gray-500 text-sm">
            {t("attendance.noWorkers")}
          </Text>
        )}
      </SectionCard>
      </View>
      </View>
      {busyKey ? (
        <Text className="text-gray-400 text-xs">{t("common.working")}</Text>
      ) : null}
    </ScreenScroll>
  );
}
