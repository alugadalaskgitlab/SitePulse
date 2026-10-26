import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  billSectionTable,
  populatedBillSections,
  type BillExportAdjustment,
  type BillExportCell,
  type WholeBillSnapshot,
  type HireStatementExport,
} from "./wholeBillSnapshot";
import { drawPdfBillFooter, drawPdfBillHeader, INK_LIGHT_TABLE } from "./pdfExportStyle";

const printable = (value: unknown) => String(value ?? "")
  .replace(/₹/g, "Rs. ").replace(/[−–—→]/g, "-").replace(/×/g, "x").replace(/·/g, " / ");
const asAmount = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};
const amountText = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(Rs. ${formatted})` : `Rs. ${formatted}`;
};
const dateText = (value?: string | null) => {
  if (!value) return "Date not recorded";
  try { return format(new Date(`${value.slice(0, 10)}T00:00:00`), "dd MMM yyyy"); } catch { return value; }
};
const sumIfComplete = (values: Array<number | null | undefined>): number | null =>
  values.length && values.every(value => value != null && Number.isFinite(value))
    ? values.reduce<number>((sum, value) => sum + Number(value), 0)
    : null;
const rowLabel = (row: BillExportAdjustment) => String(row.label ?? "").toLowerCase();
const rowAmount = (row: BillExportAdjustment) => asAmount(row.amount);

type MonthlyRow = {
  key: string;
  month: string;
  days: number | null;
  gross: number | null;
  breakdown: number | null;
  grossBill: number | null;
  advance: number | null;
  net: number | null;
};

function monthlyRows(statements: HireStatementExport[], snapshot: WholeBillSnapshot): MonthlyRow[] {
  const byMonth = new Map<string, HireStatementExport["months"]>();
  for (const statement of statements) {
    for (const month of statement.months || []) {
      const key = month.from?.slice(0, 7) || month.label;
      byMonth.set(key, [...(byMonth.get(key) || []), month]);
    }
  }
  if (!byMonth.size) {
    for (const review of snapshot.hireReviews || []) {
      for (const month of review.months) {
        const key = month.from?.slice(0, 7) || month.label;
        const row: HireStatementExport["months"][number] = {
          label: month.label, from: month.from, to: month.to, daysBilled: asAmount(month.daysBilled),
          grossHire: asAmount(month.gross), breakdownDeduction: null, grossBillAmount: null,
          advanceAdjustment: null, netMonth: null,
        };
        byMonth.set(key, [...(byMonth.get(key) || []), row]);
      }
    }
  }
  return Array.from(byMonth, ([key, months]) => {
    const month = months[0];
    const exact = <K extends "daysBilled" | "grossHire" | "breakdownDeduction" | "grossBillAmount" | "advanceAdjustment" | "netMonth">(field: K) =>
      sumIfComplete(months.map(item => asAmount(item[field])));
    const grossBill = exact("grossBillAmount");
    const advance = exact("advanceAdjustment");
    return {
      key,
      month: month.label || key,
      days: exact("daysBilled"),
      gross: exact("grossHire"),
      breakdown: exact("breakdownDeduction"),
      grossBill,
      advance,
      // This column is the month's bill amount less its saved advance only.
      // TDS and bill-level deductions remain in the Bill Summary box.
      net: grossBill != null && advance != null ? grossBill - advance : null,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function detailLines(snapshot: WholeBillSnapshot, statements: HireStatementExport[]) {
  const unique = (values: Array<string | number | null | undefined>) =>
    Array.from(new Set(values.map(value => String(value ?? "").trim()).filter(Boolean))).join("; ") || "Not recorded";
  const equipmentLabels = statements.map(statement => {
    const rawName = String(statement.equipmentName || "").trim();
    const placeholder = /^equipment\s*#\s*\d+$/i.test(rawName);
    const name = placeholder
      ? statement.equipmentType || snapshot.equipmentType || "Equipment"
      : rawName || statement.equipmentType || snapshot.equipmentType || "Equipment";
    const master = typeof statement.masterReference === "string" ? statement.masterReference.trim() : "";
    return master && !name.includes(master) ? `${name} · ${master}` : name;
  });
  const basisLines = statements.map(statement => {
    const monthly = statement.basis.toLowerCase().includes("monthly");
    const divisorValue = statement.monthlyDivisorType === "30"
      ? 30
      : statement.monthlyDivisorType === "custom"
        ? statement.monthlyDivisor
        : null;
    const divisor = statement.monthlyDivisorType === "calendar"
      ? "calendar days"
      : divisorValue
        ? `${divisorValue} days`
        : statement.monthlyDivisorType === "30" ? "30 days" : statement.divisorLabel || "Not recorded";
    const ratePerDay = monthly && divisorValue && divisorValue > 0
      ? amountText(statement.rate / divisorValue)
      : monthly ? "Varies by month" : "Not applicable";
    return `${statement.basis}, ${amountText(statement.rate)}${monthly ? "/month" : ""} · Rate/day: ${ratePerDay} · Divisor: ${divisor}`;
  });
  const norms = statements.map(statement => statement.dieselNorm == null
    ? "" : `${statement.dieselNorm.toLocaleString("en-IN")} ${statement.dieselNormUnit || ""}`.trim());
  return [
    `Vendor: ${snapshot.vendorName} · Equipment: ${unique(equipmentLabels)} · Site: ${unique(statements.map(statement => statement.site || snapshot.site))}`,
    `Hire basis: ${unique(basisLines)} · Diesel norm: ${unique(norms)}`,
  ];
}

function financialRows(snapshot: WholeBillSnapshot) {
  return snapshot.financialRows || [];
}

function matchingRow(snapshot: WholeBillSnapshot, patterns: string[]) {
  return financialRows(snapshot).find(row => {
    const label = rowLabel(row);
    return patterns.some(pattern => label.includes(pattern));
  });
}

function totalFromRows(snapshot: WholeBillSnapshot, patterns: string[]) {
  const row = matchingRow(snapshot, patterns);
  return row ? rowAmount(row) : null;
}

function advances(statements: HireStatementExport[]) {
  return statements
    .filter(statement => statement.advanceAdjustment > 0)
    .map(statement => ({
      label: `Advance · ${dateText(statement.advanceAdjustmentDate)}`,
      amount: -Math.abs(statement.advanceAdjustment),
      reason: statement.advanceAdjustmentReason || "",
    }));
}

function additionalAdjustments(snapshot: WholeBillSnapshot, statements: HireStatementExport[]) {
  const included = financialRows(snapshot).filter(row => {
    const label = rowLabel(row);
    const amount = rowAmount(row);
    if (amount == null || amount >= 0) return false;
    if (["gross", "gross hire", "gross bill amount", "hire earned", "advance", "breakdown", "gst", "tds", "net payable"].some(value => label.includes(value))) return false;
    return true;
  }).map(row => ({
    label: String(row.label ?? "Additional deduction"),
    amount: rowAmount(row)!,
    reason: String(row.reason ?? ""),
  }));
  if (included.length) return included;
  return statements.flatMap(statement => [
    ...(statement.hsdRecovery > 0 ? [{ label: "HSD recovery", amount: -statement.hsdRecovery, reason: statement.hsdRecoveryReason || "" }] : []),
    ...(statement.otherDebit > 0 ? [{ label: "Other debit", amount: -statement.otherDebit, reason: statement.otherDebitReason || "" }] : []),
  ]);
}

function creditAdjustments(snapshot: WholeBillSnapshot, statements: HireStatementExport[]) {
  const rows = financialRows(snapshot).filter(row => {
    const label = rowLabel(row);
    const amount = rowAmount(row);
    return amount != null && amount > 0 && !["gross", "gross hire", "gross bill amount", "hire earned", "gst", "net payable"].some(value => label.includes(value));
  });
  if (rows.length) return rows.map(row => ({
    label: String(row.label ?? "Other credit"), amount: rowAmount(row)!, reason: String(row.reason ?? ""),
  }));
  return statements.filter(statement => statement.otherCredit > 0).map(statement => ({
    label: `Other credit · ${statement.equipmentName}`,
    amount: statement.otherCredit,
    reason: statement.otherCreditReason || "",
  }));
}

function totalRowValue(snapshot: WholeBillSnapshot, statements: HireStatementExport[], field: "grossHire" | "breakdownDeduction" | "grossBillAmount" | "advanceAdjustment" | "netPayable") {
  if (field === "netPayable") {
    return asAmount(snapshot.totals.netPayable) ??
      sumIfComplete(statements.map(statement => asAmount(statement.netPayable))) ??
      totalFromRows(snapshot, ["net payable"]);
  }
  const fromStatements = sumIfComplete(statements.map(statement => asAmount(statement[field])));
  if (fromStatements != null) return fromStatements;
  const patterns: Record<typeof field, string[]> = {
    grossHire: ["gross hire", "gross"],
    breakdownDeduction: ["breakdown deduction"],
    grossBillAmount: ["gross bill amount", "hire earned"],
    advanceAdjustment: ["advance adjustment"],
  };
  return totalFromRows(snapshot, patterns[field]);
}

function makeHeader(snapshot: WholeBillSnapshot, statements: HireStatementExport[]) {
  const details = detailLines(snapshot, statements);
  return {
    title: "EQUIPMENT HIRE BILL",
    companyName: "Highlane Constructions",
    logoDataUrl: snapshot.logoDataUrl,
    billNo: snapshot.saved ? snapshot.billNo : "Not yet saved",
    billDate: snapshot.billDate,
    periodFrom: snapshot.periodFrom,
    periodTo: snapshot.periodTo,
    status: snapshot.saved ? snapshot.status.toUpperCase() : "UNSAVED",
    detailLines: details.length ? details : snapshot.equipmentType
      ? [`Vendor: ${snapshot.vendorName} · Equipment type: ${snapshot.equipmentType} · Site: ${snapshot.site || "Not recorded"}`]
      : [],
  };
}

function addSignatures(doc: jsPDF, y: number) {
  const width = doc.internal.pageSize.getWidth();
  const labels = ["Prepared · HLC", "Verified", "Approved", "Received · Vendor"];
  const left = 10;
  const gap = 4;
  const blockWidth = (width - 20 - gap * 3) / 4;
  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(45, 45, 45);
  labels.forEach((label, index) => {
    const x = left + index * (blockWidth + gap);
    doc.line(x, y + 18, x + blockWidth, y + 18);
    doc.text(label, x, y + 23);
  });
}

export function buildWholeBillEquipmentPdf(snapshot: WholeBillSnapshot): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const statements = snapshot.hireStatementDetails || [];
  const header = makeHeader(snapshot, statements);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerBottom = drawPdfBillHeader(doc, header);
  const drawHeader = () => { drawPdfBillHeader(doc, header); };
  const pageMargins = { left: 10, right: 10, top: headerBottom + 2, bottom: 16 };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(25, 25, 25);
  doc.text("MONTHLY BILLING SUMMARY", 10, headerBottom + 2);

  const monthRows = monthlyRows(statements, snapshot);
  const monthTable: BillExportCell[][] = monthRows.map(row => [
    row.month, row.days ?? "—", amountText(row.gross), amountText(row.breakdown),
    amountText(row.grossBill), amountText(row.advance), amountText(row.net),
  ]);
  const monthlyNetTotal = sumIfComplete(monthRows.map(row => row.net));
  const totals: BillExportCell[] = [
    "Total",
    monthRows.length && monthRows.every(row => row.days != null)
      ? monthRows.reduce((sum, row) => sum + Number(row.days), 0) : "—",
    amountText(totalRowValue(snapshot, statements, "grossHire")),
    amountText(totalRowValue(snapshot, statements, "breakdownDeduction")),
    amountText(totalRowValue(snapshot, statements, "grossBillAmount")),
    amountText(totalRowValue(snapshot, statements, "advanceAdjustment")),
    amountText(monthlyNetTotal),
  ];
  autoTable(doc, {
    startY: headerBottom + 5,
    head: [["Month", "Days billed", "Gross hire", "Breakdown", "Gross bill amount", "Advance", "Net—month"]],
    body: [...monthTable, totals],
    ...INK_LIGHT_TABLE,
    styles: { ...INK_LIGHT_TABLE.styles, fontSize: 6.6, cellPadding: 1.8 },
    headStyles: { ...INK_LIGHT_TABLE.headStyles, fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 29 },
      1: { cellWidth: 20, halign: "right" },
      2: { cellWidth: 27, halign: "right" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 31, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
      6: { cellWidth: 27, halign: "right" },
    },
    margin: pageMargins,
    showHead: "everyPage",
    didDrawPage: drawHeader,
    didParseCell: cell => {
      if (cell.section === "body" && cell.row.index === monthTable.length) {
        cell.cell.styles.fontStyle = "bold";
        cell.cell.styles.lineColor = [65, 65, 65];
        cell.cell.styles.lineWidth = 0.5;
      }
    },
  });

  let y = Number((doc as any).lastAutoTable?.finalY || headerBottom + 5) + 7;
  const advancesList = advances(statements);
  const advanceTotal = totalRowValue(snapshot, statements, "advanceAdjustment");
  const breakdownTotal = totalRowValue(snapshot, statements, "breakdownDeduction");
  const additional = additionalAdjustments(snapshot, statements);
  const credits = creditAdjustments(snapshot, statements);

  const leftRows: Array<[string, string, string]> = [
    ...advancesList.map(row => [row.label, amountText(row.amount), row.reason] as [string, string, string]),
    ...(advanceTotal != null ? [["Total advance adjusted", amountText(-Math.abs(advanceTotal)), ""] as [string, string, string]] : []),
    ...(breakdownTotal != null ? [["Breakdown deduction", amountText(-Math.abs(breakdownTotal)), ""] as [string, string, string]] : []),
    ...additional.map(row => [row.label, amountText(row.amount), row.reason] as [string, string, string]),
    ...credits.map(row => [row.label, amountText(row.amount), row.reason] as [string, string, string]),
  ];

  const summaryRows: Array<[string, string]> = [
    ["Gross hire", amountText(totalRowValue(snapshot, statements, "grossHire"))],
    ["Less: Breakdown", amountText(breakdownTotal == null ? null : -Math.abs(breakdownTotal))],
    ["Gross bill amount", amountText(totalRowValue(snapshot, statements, "grossBillAmount"))],
  ];
  for (const gst of snapshot.totals.gst || []) {
    const amount = asAmount(gst.amount);
    if (amount != null && amount > 0) summaryRows.push([String(gst.label || "GST"), amountText(amount)]);
  }
  const tdsAmount = asAmount(snapshot.totals.tds?.amount);
  if (tdsAmount != null && tdsAmount !== 0) {
    const tdsLabel = String(snapshot.totals.tds?.label || "IT TDS");
    summaryRows.push([`${tdsLabel} (on gross bill amount)`, amountText(tdsAmount)]);
  }
  if (advanceTotal != null && advanceTotal !== 0) {
    summaryRows.push(["Less: Advance adjustment", amountText(-Math.abs(advanceTotal))]);
  }
  additional.forEach(row => summaryRows.push([row.label, amountText(row.amount)]));
  credits.forEach(row => summaryRows.push([row.label, amountText(row.amount)]));
  summaryRows.push(["NET PAYABLE", amountText(totalRowValue(snapshot, statements, "netPayable"))]);

  const rowCount = Math.max(leftRows.length, summaryRows.length);
  const pairedRows: string[][] = Array.from({ length: rowCount }, (_, index) => [
    leftRows[index]?.[0] || "",
    leftRows[index]?.[1] || "",
    summaryRows[index]?.[0] || "",
    summaryRows[index]?.[1] || "",
  ]);
  if (y > pageHeight - 96) {
    doc.addPage();
    y = drawPdfBillHeader(doc, header) + 3;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(25, 25, 25);
  doc.text("Deductions & Adjustments", 10, y);
  doc.text("Bill Summary", pageWidth / 2 + 2, y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Adjustment", "Amount", "Summary", "Amount"]],
    body: pairedRows.length ? pairedRows : [["", "", "NET PAYABLE", amountText(totalRowValue(snapshot, statements, "netPayable"))]],
    ...INK_LIGHT_TABLE,
    styles: { ...INK_LIGHT_TABLE.styles, fontSize: 6.3, cellPadding: 1.5 },
    headStyles: { ...INK_LIGHT_TABLE.headStyles, fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 54 },
      1: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 75 },
      3: { cellWidth: 27, halign: "right" },
    },
    margin: { left: 10, right: 10, top: headerBottom + 2, bottom: 44 },
    didDrawPage: drawHeader,
    didParseCell: cell => {
      const raw = cell.row.raw as string[] | undefined;
      if (cell.section === "body" && raw?.[2] === "NET PAYABLE") {
        cell.cell.styles.fontStyle = "bold";
        cell.cell.styles.lineColor = [65, 65, 65];
        cell.cell.styles.lineWidth = 0.5;
      }
    },
  });

  let billNotesY = Number((doc as any).lastAutoTable?.finalY || y + 2) + 4;
  if (snapshot.notes?.trim()) {
    const noteLines = doc.splitTextToSize(printable(`Notes / remarks: ${snapshot.notes.trim()}`), pageWidth - 20);
    if (billNotesY + noteLines.length * 3.2 < pageHeight - 46) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(45, 45, 45);
      doc.text(noteLines, 10, billNotesY);
      billNotesY += noteLines.length * 3.2 + 3;
    }
  }
  addSignatures(doc, pageHeight - 42);

  const hasHireData = statements.length > 0 || !!snapshot.hireReviews?.length || snapshot.billType.toLowerCase() === "equipment";
  const nonHireSections = populatedBillSections(snapshot).filter(section =>
    !hasHireData || section.category.toLowerCase() !== "equipment");
  for (const section of nonHireSections) {
    const content = billSectionTable(section);
    if (!content.values.length) continue;
    const visibleColumns = content.headers
      .map((_, index) => index)
      .filter(index => content.values.some(row => row[index] != null && String(row[index]).trim() !== ""));
    const headers = visibleColumns.map(index => printable(content.headers[index]));
    const values = content.values.map(row => visibleColumns.map(index => printable(row[index])));
    if (!headers.length) continue;
    doc.addPage("a4", "landscape");
    const nonHireHeaderBottom = drawPdfBillHeader(doc, header);
    autoTable(doc, {
      startY: nonHireHeaderBottom + 5,
      head: [[{ content: printable(section.category.toUpperCase()), colSpan: headers.length }], headers],
      body: values,
      ...INK_LIGHT_TABLE,
      styles: { ...INK_LIGHT_TABLE.styles, fontSize: 5.5, cellPadding: 1.1, overflow: "ellipsize" },
      margin: { left: 7, right: 7, top: nonHireHeaderBottom + 2, bottom: 16 },
      showHead: "everyPage",
      didDrawPage: () => { drawPdfBillHeader(doc, header); },
    });
  }

  const pages = doc.getNumberOfPages();
  const generatedAt = snapshot.generatedAt
    ? (() => {
      try { return format(new Date(snapshot.generatedAt), "dd MMM yyyy HH:mm"); } catch { return snapshot.generatedAt; }
    })()
    : "Not recorded";
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    drawPdfBillFooter(doc, page, pages, generatedAt, snapshot.saved ? snapshot.billNo : "Not yet saved");
  }
  return doc;
}
