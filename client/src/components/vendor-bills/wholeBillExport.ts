import { GState, jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { equipmentHireActivitySheetRows } from "./EquipmentHireBillOutput";
import {
  BILL_EXPORT_SHEET_NAMES, DRAFT_BILL_NOTICE, billExportIsDraft, billExportStatus,
  billSectionTable, billSummaryRows, populatedBillSections, wholeBillFilename, wholeBillPricingNotes,
  type BillExportCell, type WholeBillSnapshot,
} from "./wholeBillSnapshot";

export type WholeBillExportFormat = "xlsx" | "pdf";
const printable = (value: BillExportCell) => String(value ?? "")
  .replace(/₹/g, "Rs. ").replace(/[−–—→]/g, "-").replace(/×/g, "x").replace(/·/g, " / ");

/** Exactly Summary + populated categories; calendars stay inside Equipment. */
export function buildWholeBillWorkbook(snapshot: WholeBillSnapshot): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([["VENDOR BILL"], ...billSummaryRows(snapshot)]);
  summary["!cols"] = [{ wch: 42 }, { wch: 68 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");
  const populated = populatedBillSections(snapshot);
  const sections = snapshot.billType === "all" ? populated : [{
    category: snapshot.billType,
    groups: populated.flatMap(section => section.groups),
    subtotal: snapshot.totals.subtotal,
  }];
  for (const section of sections) {
    const table = billSectionTable(section);
    const values: BillExportCell[][] = [[BILL_EXPORT_SHEET_NAMES[section.category] || section.category], table.headers, ...table.values];
    let calendarColumns: { wch: number }[] = [];
    if (section.category === "equipment" || (snapshot.billType !== "all" && populated.some(value => value.category === "equipment"))) {
      for (const calendar of snapshot.calendars) {
        const activity = equipmentHireActivitySheetRows(calendar.rows, calendar.dieselResponsibility, calendar.consumptionNorm, calendar.meterType);
        calendarColumns = activity.columns;
        values.push([], ["DAILY ACTIVITY", calendar.equipmentName],
          ["Period", `${calendar.periodFrom} to ${calendar.periodTo}`],
          ...(calendar.unavailableReason ? [[calendar.unavailableReason]] : []),
          ...(String(calendar.dieselResponsibility).toLowerCase() === "vendor" ? [["Fuel / Diesel: Contractor Scope"]] : []),
          activity.headers, ...activity.values);
        if (calendar.breakdown) values.push([], ["ACTIVITY / BREAKDOWN CALENDAR"], calendar.breakdown.headers, ...calendar.breakdown.rows);
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet(values);
    sheet["!cols"] = Array.from({ length: Math.max(table.headers.length, calendarColumns.length) }, (_, index) =>
      ({ wch: Math.max(calendarColumns[index]?.wch || 14, index === 2 ? 62 : index === table.headers.length - 1 ? 24 : 18) }));
    // Financial cells remain numbers. Text comes through aoa_to_sheet as text,
    // including descriptions/reasons beginning with '=' (never formulas).
    for (const address of Object.keys(sheet)) {
      if (!address.startsWith("!") && sheet[address].t === "n") sheet[address].z = "#,##0.00";
    }
    for (let index = 0; index < table.values.length; index++) {
      const rateCell = sheet[XLSX.utils.encode_cell({ r: index + 2, c: table.headers.length - 2 })];
      if (rateCell?.t === "n") rateCell.z = "0.############";
    }
    XLSX.utils.book_append_sheet(workbook, sheet, BILL_EXPORT_SHEET_NAMES[section.category] || "Other");
  }
  return workbook;
}

/** Totals and grouping are projections only; no financial calculation here. */
export function buildWholeBillPdf(snapshot: WholeBillSnapshot): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageHeaderHeight = 52;
  const table = (title: string, headers: string[], rows: BillExportCell[][]) => {
    doc.addPage();
    autoTable(doc, {
      startY: pageHeaderHeight,
      head: [[title, ...Array(headers.length - 1).fill("")], headers.map(printable)],
      body: rows.map(row => row.map((value, index) => {
        const money = headers[index] === "Amount" || (headers[index] === "Value / Amount" && typeof value === "number");
        const qty = headers[index] === "Qty";
        return typeof value === "number" && (money || qty)
          ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : printable(value);
      })),
      theme: "grid", styles: { fontSize: 6.4, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [180, 83, 9] },
      margin: { top: pageHeaderHeight, bottom: 14, left: 10, right: 10 },
      showHead: "everyPage",
      didParseCell: cell => {
        if (cell.section === "body" && String((cell.row.raw as string[])?.[0]) === "NET PAYABLE") {
          cell.cell.styles.fontStyle = "bold";
        }
      },
    });
  };
  // Remove the initial empty page after tables are generated.
  for (const section of populatedBillSections(snapshot)) {
    const content = billSectionTable(section);
    table(BILL_EXPORT_SHEET_NAMES[section.category] || section.category, content.headers, content.values);
    if (section.category === "equipment") {
      for (const calendar of snapshot.calendars) {
        const activity = equipmentHireActivitySheetRows(calendar.rows, calendar.dieselResponsibility, calendar.consumptionNorm, calendar.meterType);
        table(`DAILY ACTIVITY: ${calendar.equipmentName} / ${calendar.periodFrom} to ${calendar.periodTo}${calendar.unavailableReason ? ` / ${calendar.unavailableReason}` : ""}`,
          activity.headers, activity.values);
        if (calendar.breakdown) table(`ACTIVITY / BREAKDOWN CALENDAR: ${calendar.equipmentName}`, calendar.breakdown.headers, calendar.breakdown.rows);
      }
    }
  }
  table("BILL SUMMARY / ADJUSTMENTS", ["Detail", "Value / Amount", "Reason / Reference"],
    billSummaryRows(snapshot).filter(row => row.length).map(row => [row[0], row[1] ?? "", row[2] ?? ""]));
  doc.deletePage(1);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setTextColor(45, 45, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(printable(`${snapshot.companyName} / VENDOR BILL`), 10, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = [
      `Vendor: ${snapshot.vendorName} | Bill: ${snapshot.saved ? snapshot.billNo : "Not yet saved"} | Status: ${billExportStatus(snapshot)}`,
      `Bill date: ${snapshot.billDate} | Period: ${snapshot.periodFrom} to ${snapshot.periodTo}`,
      `Site: ${snapshot.site} | Bill type: ${snapshot.billTypeLabel} | Generated: ${snapshot.generatedAt}`,
    ];
    let y = 16;
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(printable(line), width - 20);
      doc.text(wrapped, 10, y);
      y += wrapped.length * 3.4 + 1;
    }
    if (billExportIsDraft(snapshot)) {
      doc.setTextColor(140, 140, 140);
      doc.setFontSize(8);
      doc.text(printable(DRAFT_BILL_NOTICE), 10, Math.min(y + 1, 48));
      doc.saveGraphicsState();
      // The light mark is on every page, without touching table/header content.
      doc.setTextColor(225, 225, 225);
      doc.setGState(new GState({ opacity: 0.25 }));
      doc.setFontSize(30);
      doc.text(printable(DRAFT_BILL_NOTICE), width / 2, height / 2, { angle: 25, align: "center" });
      doc.restoreGraphicsState();
    }
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    doc.text(`Page ${page} of ${pages}`, width - 10, height - 6, { align: "right" });
  }
  return doc;
}

export type BillSaveHandle = { createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }> };
export type BillSavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<BillSaveHandle>;
export type BillExportEnvironment = {
  picker?: BillSavePicker;
  download(blob: Blob, filename: string): void;
};
const browserDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
function browserEnvironment(): BillExportEnvironment {
  const browser = window as Window & { showSaveFilePicker?: BillSavePicker };
  return { picker: browser.showSaveFilePicker?.bind(window), download: browserDownload };
}
const aborted = (error: unknown) => error instanceof Error && error.name === "AbortError";

export async function saveWholeBillFile(
  snapshot: WholeBillSnapshot,
  kind: WholeBillExportFormat,
  environment: BillExportEnvironment = browserEnvironment(),
): Promise<{ cancelled: boolean; filename: string; notes: string[] }> {
  const filename = wholeBillFilename(snapshot, kind);
  const notes = wholeBillPricingNotes(snapshot);
  const mime = kind === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
  let handle: BillSaveHandle | undefined;
  if (environment.picker) {
    try {
      // This is called in the click's user-activation stack, before generation.
      handle = await environment.picker({
        suggestedName: filename,
        types: [{ description: kind === "xlsx" ? "Excel workbook" : "PDF document", accept: { [mime]: [`.${kind}`] } }],
      });
    } catch (error) {
      if (aborted(error)) return { cancelled: true, filename, notes };
      // Embedded/unsupported browser contexts may expose the API but reject it.
      if (!(error instanceof Error) || !["SecurityError", "NotAllowedError", "NotSupportedError"].includes(error.name)) throw error;
    }
  }
  const blob = kind === "xlsx"
    ? new Blob([XLSX.write(buildWholeBillWorkbook(snapshot), { bookType: "xlsx", type: "array" })], { type: mime })
    : buildWholeBillPdf(snapshot).output("blob");
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      try { await writable.abort?.(); } catch { /* Preserve the original write error. */ }
      if (aborted(error)) return { cancelled: true, filename, notes };
      throw error;
    }
  } else {
    environment.download(blob, filename);
  }
  return { cancelled: false, filename, notes };
}