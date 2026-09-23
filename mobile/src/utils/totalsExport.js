import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

function dateKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(dateStr) {
  if (!dateStr) return "?";
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${d.getDate()}`;
}

function formatHours(value) {
  if (!value || value <= 0) return "";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[c]);
}

function splitWorkerName(workerName) {
  const parts = String(workerName || "").trim().split(/\s+/).filter(Boolean);
  return {
    lastName: parts.shift() || "",
    firstName: parts.join(" "),
  };
}

function buildRankedRows(rows, hours) {
  const workers = {};
  const rowKeys = new Set(rows.map((r) => `${r.workerID}__${dateKey(r.date)}`));

  rows.forEach((r) => {
    const key = String(r.workerID);
    if (!workers[key]) {
      workers[key] = {
        workerID: r.workerID,
        workerName: r.workerName,
        vines: 0,
        hours: 0,
      };
    }
    workers[key].vines += Number(r.vines) || 0;
  });

  Object.values(workers).forEach((worker) => {
    rowKeys.forEach((key) => {
      if (key.startsWith(`${worker.workerID}__`)) {
        worker.hours += Number(hours[key]?.hours) || 0;
      }
    });
    Object.assign(worker, splitWorkerName(worker.workerName));
    worker.rate = worker.hours > 0 ? worker.vines / worker.hours : 0;
  });

  const byVines = Object.values(workers).sort((a, b) =>
    b.vines - a.vines || a.lastName.localeCompare(b.lastName)
  );
  const byRate = [...byVines].sort((a, b) =>
    b.rate - a.rate || b.vines - a.vines || a.lastName.localeCompare(b.lastName)
  );
  const fastest = new Map(byRate.map((worker, index) => [String(worker.workerID), index + 1]));

  return byVines.map((worker, index) => ({
    ...worker,
    position: index + 1,
    fastest: fastest.get(String(worker.workerID)),
  }));
}

function formatRate(value) {
  return value > 0 ? value.toFixed(1).replace(".", ",") : "";
}

function formatSheetNumber(value) {
  return Number(value).toFixed(1).replace(".", ",");
}

/**
 * Build a print-ready HTML report (worker x day matrix) from the exact rows
 * and hours currently shown on screen, so exports stay correct under filters.
 */
export function buildTotalsHtml({ rows = [], hours = {}, blockFilter = "", jobFilter = "", rowFilter = "", title = "" }) {
  const rankedRows = buildRankedRows(rows, hours);
  const grandVines = rankedRows.reduce((sum, worker) => sum + worker.vines, 0);
  const grandHours = rankedRows.reduce((sum, worker) => sum + worker.hours, 0);

  const filterText = [
    blockFilter ? `Block: ${blockFilter}` : "",
    jobFilter ? `Job: ${jobFilter}` : "",
    rowFilter ? `Row: ${rowFilter}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "All blocks · All jobs";

  const summary = [
    `Workers: ${rankedRows.length}`,
    `Vines: ${grandVines}`,
    `Hours: ${formatHours(grandHours) || "0h"}`,
    `Days: ${new Set(rows.map((r) => dateKey(r.date))).size}`,
  ].join("  |  ");

  const heading = title
    ? `Glen Oak Farm — ${esc(title)}`
    : "Glen Oak Farm — Totals";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Helvetica, Arial, sans-serif; color: #111827; margin: 24px; }
      h1 { color: #1a5f4a; margin: 0 0 2px; font-size: 20px; }
      .sub { color: #6b7280; font-size: 11px; margin-bottom: 6px; }
      .filter { color: #1a5f4a; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
      .summary { background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 700; color: #15803d; margin-bottom: 16px; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      th, td { border: 1px solid #111; padding: 4px 5px; font-size: 10px; text-align: center; }
      th { background: #b44b4b; color: #fff; font-weight: 700; }
      td.name { text-align: left; font-weight: 700; color: #d14343; }
      td.id { color: #075aaa; font-weight: 700; }
      td.vines { color: #159447; }
      td.rate { color: #a720b7; }
      td.position { color: #e00000; font-weight: 700; }
      tr.total-row td { background: #f0fdf4; font-weight: 800; color: #16a34a; }
    </style>
  </head>
  <body>
    <h1>${heading}</h1>
    <div class="sub">Generated ${new Date().toLocaleString("en-US")}</div>
    <div class="filter">${esc(filterText)}</div>
    <div class="summary">${esc(summary)}</div>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Last name</th><th>First Name</th><th>Vines</th>
          <th>Hours</th><th>Vines/hour</th><th>Position</th><th>Fastest</th>
        </tr>
      </thead>
      <tbody>
        ${rankedRows.map((w) => `<tr>
          <td class="id">${esc(w.workerID)}</td>
          <td class="name">${esc(w.lastName)}</td>
          <td class="name">${esc(w.firstName)}</td>
          <td class="vines">${w.vines}</td>
          <td>${w.hours ? esc(formatSheetNumber(w.hours)) : ""}</td>
          <td class="rate">${esc(formatRate(w.rate))}</td>
          <td class="position">${w.position}</td>
          <td>${w.fastest}</td>
        </tr>`).join("\n")}
      <tfoot>
        <tr class="total-row">
          <td></td><td></td><td>Total</td><td>${grandVines}</td>
          <td>${formatSheetNumber(grandHours)}</td><td>${formatRate(grandHours ? grandVines / grandHours : 0)}</td><td></td><td></td>
        </tr>
      </tfoot>
    </table>
  </body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side PDF generation (web). Produces a real downloadable .pdf without
// any native module, so "Export" works as a download in the browser.
// ─────────────────────────────────────────────────────────────────────────────

// Windows-1252 punctuation/symbols that live in the 0x80–0x9F control range.
const WIN1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function escapePdfText(text) {
  let out = "";
  for (const ch of String(text ?? "")) {
    const code = ch.charCodeAt(0);
    if (code === 0x5c) out += "\\\\";
    else if (code === 0x28) out += "\\(";
    else if (code === 0x29) out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += String.fromCharCode(code);
    else if (WIN1252_HIGH[code] !== undefined) out += String.fromCharCode(WIN1252_HIGH[code]);
    else out += "?";
  }
  return out;
}

function buildMatrixPdf({ rows = [], hours = {}, blockFilter = "", jobFilter = "", rowFilter = "", title = "" }) {
  const PAGE_W = 842;
  const PAGE_H = 595;
  const M = 30;

  const wMap = {};
  const dMap = {};
  rows.forEach((r) => {
    const dk = dateKey(r.date);
    const wk = r.workerID;
    if (!wMap[wk]) wMap[wk] = { workerID: wk, workerName: r.workerName, cells: {} };
    if (!dMap[dk]) dMap[dk] = r.date;
    if (!wMap[wk].cells[dk]) wMap[wk].cells[dk] = { vines: 0 };
    wMap[wk].cells[dk].vines += r.vines;
  });

  const workerOrder = Object.values(wMap).sort((a, b) =>
    a.workerName.localeCompare(b.workerName)
  );
  const dateOrder = Object.keys(dMap).sort((a, b) => b.localeCompare(a));
  const rowKeys = new Set(rows.map((r) => `${r.workerID}__${dateKey(r.date)}`));
  const hoursAt = (wk, dk) => hours[`${wk}__${dk}`]?.hours || 0;

  const colVines = {};
  const colHours = {};
  dateOrder.forEach((dk) => {
    let v = 0;
    let h = 0;
    workerOrder.forEach((w) => {
      v += w.cells[dk] ? w.cells[dk].vines : 0;
      if (rowKeys.has(`${w.workerID}__${dk}`)) h += hoursAt(w.workerID, dk);
    });
    colVines[dk] = v;
    colHours[dk] = h;
  });

  const grandVines = rows.reduce((s, r) => s + r.vines, 0);
  const grandHours = Array.from(rowKeys).reduce(
    (s, key) => s + (hours[key]?.hours || 0),
    0
  );

  const nameW = 130;
  const idW = 45;
  const totalW = 66;
  const headerH = 20;
  const footerH = 18;
  const titleBlockH = 62;
  const tableTop = M + titleBlockH;
  const availRows = Math.max(
    4,
    Math.floor((PAGE_H - M - tableTop - footerH) / headerH)
  );
  const rowCount = Math.max(1, workerOrder.length);
  const rowH = Math.min(16, Math.floor((PAGE_H - M - tableTop - footerH) / rowCount));

  const dateArea = PAGE_W - 2 * M - nameW - idW - totalW;
  const dateW = dateOrder.length
    ? Math.max(30, Math.floor(dateArea / dateOrder.length))
    : 0;

  const colX = (ci) => M + nameW + idW + ci * dateW;
  const rightTotalX = M + nameW + idW + dateOrder.length * dateW;

  const filterText = [
    blockFilter ? `Block: ${blockFilter}` : "",
    jobFilter ? `Job: ${jobFilter}` : "",
    rowFilter ? `Row: ${rowFilter}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "All blocks · All jobs";

  const summaryText = `Workers: ${workerOrder.length}   Vines: ${grandVines}   Hours: ${
    formatHours(grandHours) || "0h"
  }   Days: ${dateOrder.length}`;

  const R = [];
  const addText = (text, x, yTop, { font = "F1", size = 9, align = "left", g = 0.129, r = 0.129, b = 0.129 } = {}) => {
    const py = PAGE_H - (yTop + size * 0.35);
    let tx = x;
    if (align === "center") tx = x;
    else if (align === "right") tx = x;
    R.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    R.push(`BT /${font} ${size} Tf ${tx.toFixed(2)} ${py.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`);
  };

  // Title block
  addText(title ? `Glen Oak Farm — ${title}` : "Glen Oak Farm — Totals", M, M, {
    font: "F2",
    size: 16,
    g: 0.102,
    r: 0.102,
    b: 0.102,
  });
  addText(`Generated ${new Date().toLocaleString("en-US")}`, M, M + 22, { size: 8, g: 0.42, r: 0.42, b: 0.42 });
  addText(filterText, M, M + 34, { font: "F2", size: 10, g: 0.102, r: 0.102, b: 0.102 });
  addText(summaryText, M, M + 48, { font: "F2", size: 9, g: 0.09, r: 0.09, b: 0.09 });

  // Header row background
  const headerY = tableTop;
  R.push(`${(249 / 255).toFixed(3)} ${(250 / 255).toFixed(3)} ${(251 / 255).toFixed(3)} rg`);
  R.push(`${M.toFixed(2)} ${(PAGE_H - headerY - headerH).toFixed(2)} ${(PAGE_W - 2 * M).toFixed(2)} ${headerH.toFixed(2)} re f`);

  addText("Worker", M + 6, headerY + 5, { font: "F2", size: 9 });
  addText("ID", M + nameW + 6, headerY + 5, { font: "F2", size: 9 });
  dateOrder.forEach((dk, ci) => {
    addText(dayLabel(dMap[dk]), colX(ci) + dateW / 2, headerY + 5, {
      font: "F2",
      size: 8,
      align: "center",
    });
  });
  addText("Total", rightTotalX + totalW / 2, headerY + 5, { font: "F2", size: 8, align: "center" });

  // Data rows
  workerOrder.forEach((w, ri) => {
    const yTop = headerY + headerH + ri * rowH;
    if (ri % 2 === 1) {
      R.push("0.980 0.980 0.980 rg");
      R.push(`${M.toFixed(2)} ${(PAGE_H - yTop - rowH).toFixed(2)} ${(PAGE_W - 2 * M).toFixed(2)} ${rowH.toFixed(2)} re f`);
    }

    addText(w.workerName, M + 6, yTop + 4, { font: "F2", size: 9 });
    addText(String(w.workerID), M + nameW + 6, yTop + 4, { size: 8 });

    let wVines = 0;
    let wHours = 0;
    dateOrder.forEach((dk, ci) => {
      const cell = w.cells[dk];
      const vines = cell ? cell.vines : 0;
      wVines += vines;
      if (rowKeys.has(`${w.workerID}__${dk}`)) wHours += hoursAt(w.workerID, dk);
      const cx = colX(ci) + dateW / 2;
      if (vines > 0) {
        addText(String(vines), cx, yTop + 4, { align: "center", font: "F2", size: 8 });
      }
      const hrs = hoursAt(w.workerID, dk);
      if (hrs > 0) {
        addText(formatHours(hrs), cx, yTop + 11, { align: "center", size: 7, g: 0.09, r: 0.09, b: 0.09 });
      }
    });

    const wHrsHtml = wHours > 0 ? formatHours(wHours) : "";
    addText(String(wVines), rightTotalX + totalW / 2, yTop + 4, {
      font: "F2",
      size: 9,
      align: "center",
      g: 0.09,
      r: 0.09,
      b: 0.09,
    });
    if (wHrsHtml) {
      addText(wHrsHtml, rightTotalX + totalW / 2, yTop + 11, {
        size: 7,
        align: "center",
        g: 0.09,
        r: 0.09,
        b: 0.09,
      });
    }
  });

  // Footer / totals row
  const footY = headerY + headerH + rowCount * rowH;
  R.push(`${(240 / 255).toFixed(3)} ${(253 / 255).toFixed(3)} ${(244 / 255).toFixed(3)} rg`);
  R.push(`${M.toFixed(2)} ${(PAGE_H - footY - footerH).toFixed(2)} ${(PAGE_W - 2 * M).toFixed(2)} ${footerH.toFixed(2)} re f`);

  addText("Total", M + 6, footY + 4, { font: "F2", size: 9, g: 0.09, r: 0.09, b: 0.09 });
  dateOrder.forEach((dk, ci) => {
    const cx = colX(ci) + dateW / 2;
    addText(String(colVines[dk] || 0), cx, footY + 4, { font: "F2", size: 8, align: "center", g: 0.09, r: 0.09, b: 0.09 });
    if (colHours[dk] > 0) {
      addText(formatHours(colHours[dk]), cx, footY + 11, { size: 7, align: "center", g: 0.09, r: 0.09, b: 0.09 });
    }
  });
  addText(String(grandVines), rightTotalX + totalW / 2, footY + 4, {
    font: "F2",
    size: 9,
    align: "center",
    g: 0.09,
    r: 0.09,
    b: 0.09,
  });
  if (grandHours > 0) {
    addText(formatHours(grandHours), rightTotalX + totalW / 2, footY + 11, {
      size: 7,
      align: "center",
      g: 0.09,
      r: 0.09,
      b: 0.09,
    });
  }

  // Table borders
  R.push("0.900 0.902 0.906 RG");
  R.push(`${M.toFixed(2)} ${(PAGE_H - headerY - headerH).toFixed(2)} ${(PAGE_W - 2 * M).toFixed(2)} ${(headerH + rowCount * rowH + footerH).toFixed(2)} re S`);
  for (let ri = 0; ri <= rowCount; ri++) {
    const y = headerY + headerH + ri * rowH;
    R.push(`${M.toFixed(2)} ${(PAGE_H - y).toFixed(2)} m ${(PAGE_W - M).toFixed(2)} ${(PAGE_H - y).toFixed(2)} l S`);
  }
  const yFoot = headerY + headerH + rowCount * rowH;
  R.push(`${M.toFixed(2)} ${(PAGE_H - yFoot).toFixed(2)} m ${(PAGE_W - M).toFixed(2)} ${(PAGE_H - yFoot).toFixed(2)} l S`);
  const colEdges = [M, M + nameW, M + nameW + idW];
  for (let ci = 0; ci <= dateOrder.length; ci++) {
    colEdges.push(colX(ci));
  }
  colEdges.push(rightTotalX + totalW);
  colEdges.forEach((x) => {
    R.push(`${x.toFixed(2)} ${(PAGE_H - headerY - headerH).toFixed(2)} m ${x.toFixed(2)} ${(PAGE_H - yFoot - footerH).toFixed(2)} l S`);
  });

  const content = R.join("\n");
  const stream = `${content}\n`;

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`;
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 7\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i < 7; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
}

function buildTotalsPdf({ rows = [], hours = {}, blockFilter = "", jobFilter = "", rowFilter = "", title = "" }) {
  const PAGE_W = 842;
  const PAGE_H = 595;
  const M = 30;
  const rankedRows = buildRankedRows(rows, hours);
  const grandVines = rankedRows.reduce((sum, worker) => sum + worker.vines, 0);
  const grandHours = rankedRows.reduce((sum, worker) => sum + worker.hours, 0);
  const columns = [
    { label: "ID", width: 42 },
    { label: "Last name", width: 86 },
    { label: "First Name", width: 105 },
    { label: "Vines", width: 75 },
    { label: "Hours", width: 65 },
    { label: "Vines/hour", width: 85 },
    { label: "Position", width: 72 },
    { label: "Fastest", width: 62 },
  ];
  const headerH = 24;
  const footerH = 20;
  const titleBlockH = 78;
  const tableTop = M + titleBlockH;
  const rowH = Math.min(16, Math.floor((PAGE_H - M - tableTop - footerH) / Math.max(1, rankedRows.length)));
  const tableW = columns.reduce((sum, column) => sum + column.width, 0);
  const xAt = (index) => M + columns.slice(0, index).reduce((sum, column) => sum + column.width, 0);

  const filterText = [
    blockFilter ? `Block: ${blockFilter}` : "",
    jobFilter ? `Job: ${jobFilter}` : "",
    rowFilter ? `Row: ${rowFilter}` : "",
  ].filter(Boolean).join(" · ") || "All blocks · All jobs";
  const summaryText = `Workers: ${rankedRows.length}   Vines: ${grandVines}   Hours: ${formatHours(grandHours) || "0h"}`;
  const R = [];
  const addText = (text, x, yTop, { font = "F1", size = 9, g = 0.129, r = 0.129, b = 0.129 } = {}) => {
    const py = PAGE_H - (yTop + size * 0.35);
    R.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    R.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${py.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`);
  };
  const centeredText = (text, index, yTop, options = {}) => {
    const column = columns[index];
    addText(String(text), xAt(index) + column.width / 2, yTop, options);
  };

  addText(title ? `Glen Oak Farm — ${title}` : "Glen Oak Farm — Totals", M, M, { font: "F2", size: 16, g: 0.102, r: 0.102, b: 0.102 });
  addText(`Generated ${new Date().toLocaleString("en-US")}`, M, M + 22, { size: 8, g: 0.42, r: 0.42, b: 0.42 });
  addText(filterText, M, M + 38, { font: "F2", size: 10, g: 0.102, r: 0.102, b: 0.102 });
  addText(summaryText, M, M + 54, { font: "F2", size: 9, g: 0.09, r: 0.09, b: 0.09 });

  R.push("0.706 0.294 0.294 rg");
  R.push(`${M} ${(PAGE_H - tableTop - headerH).toFixed(2)} ${tableW} ${headerH} re f`);
  columns.forEach((column, index) => centeredText(column.label, index, tableTop + 7, { font: "F2", size: 8, g: 1, r: 1, b: 1 }));

  rankedRows.forEach((worker, rowIndex) => {
    const yTop = tableTop + headerH + rowIndex * rowH;
    if (rowIndex % 2 === 1) {
      R.push("0.970 0.970 0.970 rg");
      R.push(`${M} ${(PAGE_H - yTop - rowH).toFixed(2)} ${tableW} ${rowH.toFixed(2)} re f`);
    }
    centeredText(worker.workerID, 0, yTop + 4, { font: "F2", size: 8, g: 0.02, r: 0.02, b: 0.35 });
    addText(worker.lastName, xAt(1) + 4, yTop + 4, { font: "F2", size: 8, g: 0.25, r: 0.82, b: 0.25 });
    addText(worker.firstName, xAt(2) + 4, yTop + 4, { font: "F2", size: 8, g: 0.25, r: 0.82, b: 0.25 });
    centeredText(worker.vines, 3, yTop + 4, { font: "F2", size: 8, g: 0.08, r: 0.58, b: 0.28 });
    centeredText(worker.hours ? formatSheetNumber(worker.hours) : "", 4, yTop + 4, { size: 8 });
    centeredText(formatRate(worker.rate), 5, yTop + 4, { size: 8, g: 0.12, r: 0.12, b: 0.65 });
    centeredText(worker.position, 6, yTop + 4, { font: "F2", size: 8, g: 0, r: 0.8, b: 0 });
    centeredText(worker.fastest, 7, yTop + 4, { size: 8 });
  });

  const footY = tableTop + headerH + rankedRows.length * rowH;
  R.push("0.941 0.992 0.957 rg");
  R.push(`${M} ${(PAGE_H - footY - footerH).toFixed(2)} ${tableW} ${footerH} re f`);
  centeredText("Total", 2, footY + 5, { font: "F2", size: 8, g: 0.09, r: 0.09, b: 0.09 });
  centeredText(grandVines, 3, footY + 5, { font: "F2", size: 8, g: 0.09, r: 0.09, b: 0.09 });
  centeredText(formatSheetNumber(grandHours), 4, footY + 5, { font: "F2", size: 8, g: 0.09, r: 0.09, b: 0.09 });
  centeredText(formatRate(grandHours ? grandVines / grandHours : 0), 5, footY + 5, { font: "F2", size: 8, g: 0.09, r: 0.09, b: 0.09 });

  R.push("0.067 0.067 0.067 RG");
  R.push(`${M} ${(PAGE_H - tableTop - headerH).toFixed(2)} ${tableW} ${(headerH + rankedRows.length * rowH + footerH).toFixed(2)} re S`);
  for (let row = 0; row <= rankedRows.length; row++) {
    const y = tableTop + headerH + row * rowH;
    R.push(`${M} ${(PAGE_H - y).toFixed(2)} m ${M + tableW} ${(PAGE_H - y).toFixed(2)} l S`);
  }
  columns.forEach((column, index) => {
    const x = xAt(index);
    R.push(`${x} ${(PAGE_H - tableTop - headerH).toFixed(2)} m ${x} ${(PAGE_H - footY - footerH).toFixed(2)} l S`);
  });
  R.push(`${M + tableW} ${(PAGE_H - tableTop - headerH).toFixed(2)} m ${M + tableW} ${(PAGE_H - footY - footerH).toFixed(2)} l S`);

  const stream = `${R.join("\n")}\n`;
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`;
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n`;
  for (let index = 1; index < 7; index++) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

function pdfStringToBytes(pdfString) {
  const bytes = new Uint8Array(pdfString.length);
  for (let i = 0; i < pdfString.length; i++) {
    bytes[i] = pdfString.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function triggerWebDownload(pdfString, filename) {
  const blob = new Blob([pdfStringToBytes(pdfString)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generate a PDF for the given (already filtered) totals data and share it.
 * On web it writes a real PDF and downloads it directly.
 * Returns the local PDF file URI (native) or blob URL (web).
 */
export async function exportTotalsPdf(params) {
  if (Platform.OS === "web") {
    const pdfString = buildTotalsPdf(params);
    const slug = (params.title || "totals")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const day = new Date().toISOString().split("T")[0];
    triggerWebDownload(pdfString, `glen-oak-${slug}-${day}.pdf`);
    return pdfString;
  }

  const html = buildTotalsHtml(params);
  const printResult = await Print.printToFileAsync({
    html,
    width: 900,
    base64: true,
  });
  const uri = printResult.uri;

  if (await Sharing.isAvailableAsync()) {
    let shareUri = uri;
    if (printResult.base64 && FileSystem.documentDirectory) {
      shareUri = `${FileSystem.documentDirectory}glen-oak-totals-${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(shareUri, printResult.base64, {
        encoding: "base64",
      });
    }
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      dialogTitle: "Glen Oak Totals PDF",
      UTI: "com.adobe.pdf",
    });
  }

  return uri;
}