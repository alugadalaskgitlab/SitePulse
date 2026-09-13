import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Download, FileText } from "lucide-react";
import type { EquipmentPerformanceDailyRow } from "@shared/equipmentPerformance";
import { formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { calculateEquipmentHireFinancials } from "@shared/hireBilling";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type BillingMaintenance = {
  businessDate?: string;
  date?: string;
  description?: string;
  downtimeHours?: number | null;
  fromTime?: string | null;
  toTime?: string | null;
  remarks?: string | null;
};

export type BillingDailyRow = {
  date: string;
  performance?: EquipmentPerformanceDailyRow;
  status: "Worked" | "Breakdown" | "No Work";
  remarks: string;
  downtimeHours: number;
};

export type EquipmentHireExportData = {
  billNo: string;
  vendorName: string;
  equipmentName: string;
  projectSite?: string;
  periodFrom: string;
  periodTo: string;
  hireBasis: string;
  rate: number;
  grossHire: number;
  breakdownDeduction: number;
  hsdRecovery: number;
  otherDebit: number;
  otherDebitReason?: string;
  advanceAdjustment: number;
  advanceAdjustmentReason?: string;
  otherCredit: number;
  otherCreditReason?: string;
  gstRate: number;
  gstAmount: number;
  taxableAmount: number;
  invoiceTotal: number;
  tdsRate: number;
  tdsAmount: number;
  netPayable: number;
  paid: number;
  dieselResponsibility?: "hlc" | "vendor" | string | null;
  consumptionNorm?: number | null;
};

const money = (value: number | null | undefined) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: number | null | undefined, decimals = 1) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: decimals });
// jsPDF's built-in Helvetica fonts are WinAnsi, not Unicode. Keep the user
// interface and XLSX values untouched, but make PDF table text reliably
// printable in every supported PDF viewer.
const pdfText = (value: string) => value
  .replace(/₹/g, "Rs. ")
  .replace(/[−–—]/g, "-")
  .replace(/×/g, "x");
const dateLabel = (value: string) => {
  try { return format(new Date(`${value}T00:00:00`), "dd MMM yyyy"); } catch { return value; }
};
const duration = (value: number | null | undefined, incomplete = false) =>
  value == null ? "—" : `${incomplete ? "Partial · " : ""}${formatEquipmentDuration(value)}`;
// Billing users explicitly use this wording for unavailable measured fuel;
// never substitute an inferred value or alternate wording.
const litres = (value: number | null | undefined) => value == null ? "Tank Readings N/A" : `${number(value)} L`;
const tankReading = (value: number | null | undefined) => value == null ? "Tank Readings N/A" : `${number(value)} L`;
const difference = (row?: EquipmentPerformanceDailyRow) =>
  !row || row.consumptionIncomplete ? "Tank Readings N/A" : row.difference == null ? "Tank Readings N/A" : `${row.difference > 0 ? "+" : ""}${litres(row.difference)}`;

function isoDays(from: string, to: string) {
  if (!from || !to || from > to) return [];
  const values: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

/**
 * The performance row is deliberately passed through untouched.  The billing
 * view only supplies missing calendar days and the billing-only status column.
 */
export function buildBillingDailyRows(
  dailyRows: EquipmentPerformanceDailyRow[],
  periodFrom: string,
  periodTo: string,
  maintenance: BillingMaintenance[] = [],
): BillingDailyRow[] {
  const byDate = new Map(dailyRows.map(row => [row.date, row]));
  const maintenanceByDate = new Map<string, BillingMaintenance[]>();
  maintenance.forEach(entry => {
    const key = entry.businessDate || entry.date;
    if (key) maintenanceByDate.set(key, [...(maintenanceByDate.get(key) || []), entry]);
  });
  return isoDays(periodFrom, periodTo).map(date => {
    const performance = byDate.get(date);
    const breakdowns = maintenanceByDate.get(date) || [];
    const downtimeHours = breakdowns.reduce((sum, entry) => sum + Number(entry.downtimeHours || 0), 0);
    const remarks = breakdowns.map(entry => [
      entry.description || "Breakdown",
      entry.downtimeHours != null ? `${Number(entry.downtimeHours)}h downtime` : null,
      entry.fromTime || entry.toTime ? `${entry.fromTime || "?"}–${entry.toTime || "?"}` : null,
      entry.remarks,
    ].filter(Boolean).join(" · ")).join(" | ");
    return {
      date,
      performance,
      status: breakdowns.length ? "Breakdown" : performance ? "Worked" : "No Work",
      remarks: remarks || (performance ? "Activity recorded" : "No activity recorded"),
      downtimeHours,
    };
  });
}

function dailyHeaders(dieselResponsibility?: string | null) {
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  return [
    "Date", "Project / Site", "Opening Meter", "Closing Meter", "Working Hours", "Start", "End", "Clock Duration",
    ...(fuelIsContractorScope ? [] : ["Diesel Issued", "Opening Tank", "Closing Tank"]),
    ...(fuelIsContractorScope ? [] : ["Diesel Consumed", "Expected", "Difference", "Actual Consumption | Master Norm"]),
    "Status / Remarks",
  ];
}

function dailyValues(row: BillingDailyRow, dieselResponsibility?: string | null, consumptionNorm?: number | null) {
  const item = row.performance;
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  const consumptionUnit = item?.consumptionRateUnit || "";
  const actualAndNorm = item?.consumptionIncomplete || item?.consumptionRate == null
    ? "Tank Readings N/A"
    : `Actual: ${number(item.consumptionRate, 2)} ${consumptionUnit} | Master Norm: ${consumptionNorm == null ? "Tank Readings N/A" : `${number(consumptionNorm, 2)} ${consumptionUnit}`}`;
  return [
    dateLabel(row.date),
    item?.projectSite || "—",
    number(item?.openingMeter), number(item?.closingMeter),
    duration(item?.workingHours, item?.workingHoursIncomplete),
    formatEquipmentTime(item?.startTime), formatEquipmentTime(item?.endTime),
    duration(item?.clockDuration, item?.clockDurationIncomplete),
    ...(fuelIsContractorScope ? [] : [item?.dieselIssued == null ? "Tank Readings N/A" : litres(item.dieselIssued), tankReading(item?.openingTank), tankReading(item?.closingTank)]),
    ...(fuelIsContractorScope ? [] : [
      item?.consumptionIncomplete ? "Tank Readings N/A" : litres(item?.dieselConsumed),
      item?.consumptionIncomplete ? "Tank Readings N/A" : litres(item?.expectedDiesel),
      difference(item), actualAndNorm,
    ]),
    `${row.status}${row.downtimeHours ? ` · ${number(row.downtimeHours, 2)}h downtime` : ""}${row.remarks ? ` — ${row.remarks}` : ""}`,
  ];
}

export function EquipmentHireDailyActivity({ open, onOpenChange, rows, dieselResponsibility, consumptionNorm }: {
  open: boolean; onOpenChange: (value: boolean) => void; rows: BillingDailyRow[];
  dieselResponsibility?: string | null; consumptionNorm?: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [open]);
  const headers = dailyHeaders(dieselResponsibility);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[98vw] overflow-y-auto">
      <DialogHeader><DialogTitle>Daily Activity</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Performance figures are the precomputed Equipment Performance daily rows for this equipment and bill period. Status and downtime remarks are provided for billing review.</p>
       {fuelIsContractorScope && <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Fuel / Diesel: Contractor Scope</div>}
       <div ref={scrollRef} className="overflow-x-auto">
         <table className="w-full min-w-[1780px] text-xs">
           <thead className="bg-muted text-[10px] uppercase tracking-wide"><tr>{headers.map(header => <th key={header} className="px-2 py-2 text-right first:text-left last:text-left">{header}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.date} className="border-b align-top">
             {dailyValues(row, dieselResponsibility, consumptionNorm).map((value, index) => <td key={index} className={`px-2 py-2 ${index === 0 || index === 1 || index === headers.length - 1 ? "text-left" : "text-right"}`}>{value}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </DialogContent>
  </Dialog>;
}

export function exportEquipmentHireBill(data: EquipmentHireExportData, rows: BillingDailyRow[], format: "pdf" | "xlsx") {
  const balance = Math.max(0, data.netPayable - data.paid);
  const summary = [
    ["Vendor", data.vendorName], ["Equipment", data.equipmentName], ...(data.projectSite ? [["Project / Site", data.projectSite]] : []), ["Bill period", `${dateLabel(data.periodFrom)} to ${dateLabel(data.periodTo)}`],
    ["Hire basis", data.hireBasis], ["Rate", money(data.rate)], ["Gross Hire", money(data.grossHire)],
    ["Breakdown Deduction", `− ${money(data.breakdownDeduction)}`],
    ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [] : [["HSD Recovery", `− ${money(data.hsdRecovery)}`]]),
    ["Other Debit / Recovery", `− ${money(data.otherDebit)}${data.otherDebitReason ? ` (${data.otherDebitReason})` : ""}`],
    ["Advance Adjustment", `− ${money(data.advanceAdjustment)}${data.advanceAdjustmentReason ? ` (${data.advanceAdjustmentReason})` : ""}`],
    ["Other Credit", `+ ${money(data.otherCredit)}${data.otherCreditReason ? ` (${data.otherCreditReason})` : ""}`],
    ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [["Fuel / Diesel", "Contractor Scope"]] : []),
    ["Taxable / Bill Amount", money(data.taxableAmount)],
    [`GST @ ${data.gstRate}%`, `+ ${money(data.gstAmount)}`], ["Invoice Total", money(data.invoiceTotal)],
    [`TDS @ ${data.tdsRate}%`, `− ${money(data.tdsAmount)}`], ["NET PAYABLE", money(data.netPayable)], ["Paid", money(data.paid)], ["Balance This Bill", money(balance)],
  ];
  const safeName = (data.billNo || "equipment-hire-bill").replace(/[^\w-]+/g, "-");
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet([["Equipment Hire Bill Summary"], ...summary]);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 60 }];
    const headers = dailyHeaders(data.dieselResponsibility);
    const activitySheet = XLSX.utils.aoa_to_sheet([
      ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [["Fuel / Diesel: Contractor Scope"]] : []),
      headers, ...rows.map(row => dailyValues(row, data.dieselResponsibility, data.consumptionNorm)),
    ]);
    activitySheet["!cols"] = headers.map((header, index) => ({ wch: index === headers.length - 1 ? 52 : Math.max(14, header.length + 2) }));
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Bill Summary");
    XLSX.utils.book_append_sheet(workbook, activitySheet, "Daily Activity");
    XLSX.writeFile(workbook, `${safeName}.xlsx`);
    return;
  }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text("EQUIPMENT HIRE VENDOR BILL", 14, 16);
  doc.setFontSize(9);
  doc.text(`Bill No: ${data.billNo || "Draft"}`, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [["Bill Summary", "Amount / Detail"]],
    body: summary.map(row => row.map(value => pdfText(String(value)))),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [180, 83, 9] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 65 }, 1: { cellWidth: 110 } },
    didParseCell: cell => {
      const label = String((cell.row.raw as string[] | undefined)?.[0] || "");
      if (cell.section === "body" && ["Taxable / Bill Amount", "Invoice Total", "NET PAYABLE", "Balance This Bill"].includes(label)) {
        cell.cell.styles.fontStyle = "bold";
      }
    },
  });
  // The activity always begins on a new page, keeping the summary cleanly on page one.
  doc.addPage("a4", "landscape");
  doc.setFontSize(13);
  doc.text("DAILY ACTIVITY", 14, 12);
  if (String(data.dieselResponsibility).toLowerCase() === "vendor") {
    doc.setFontSize(9);
    doc.text("Fuel / Diesel: Contractor Scope", 14, 17);
  }
  autoTable(doc, {
    startY: String(data.dieselResponsibility).toLowerCase() === "vendor" ? 21 : 16,
    head: [dailyHeaders(data.dieselResponsibility)],
    body: rows.map(row => dailyValues(row, data.dieselResponsibility, data.consumptionNorm).map(value => pdfText(String(value)))),
    theme: "grid",
    styles: { fontSize: 5.7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [180, 83, 9], fontSize: 5.8 },
    margin: { left: 6, right: 6 },
  });
  doc.save(`${safeName}.pdf`);
}

export function EquipmentHireExportButtons({ data, rows, disabled = false }: { data: EquipmentHireExportData; rows: BillingDailyRow[]; disabled?: boolean }) {
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const download = (kind: "pdf" | "xlsx") => {
    setExporting(kind);
    try { exportEquipmentHireBill(data, rows, kind); } finally { setExporting(null); }
  };
  return <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" size="sm" disabled={disabled || !!exporting} onClick={() => download("pdf")} data-testid="button-export-equipment-hire-pdf"><FileText className="mr-1 h-4 w-4" />{exporting === "pdf" ? "Preparing…" : "Export PDF"}</Button>
    <Button type="button" variant="outline" size="sm" disabled={disabled || !!exporting} onClick={() => download("xlsx")} data-testid="button-export-equipment-hire-excel"><Download className="mr-1 h-4 w-4" />{exporting === "xlsx" ? "Preparing…" : "Export Excel"}</Button>
  </div>;
}

/** Converts the persisted statement shape into the exact export model. */
export function buildSavedEquipmentHireBillOutput(bill: any): { data: EquipmentHireExportData; rows: BillingDailyRow[]; hasFrozenDailyRows: boolean } | null {
  const statement = Array.isArray(bill.hireStatements) ? bill.hireStatements[0] : null;
  const snapshot = statement?.calculationSnapshot || {};
  const equipmentId = Number(statement?.equipmentId || snapshot?.equipmentId || 0);
  const periodFrom = statement?.periodFrom || bill.periodFrom || "";
  const periodTo = statement?.periodTo || bill.periodTo || "";
  if (!statement || !equipmentId || !periodFrom || !periodTo) return null;
  const maintenance: BillingMaintenance[] = Array.isArray(snapshot.sourceEvidence?.maintenance)
    ? snapshot.sourceEvidence.maintenance.map((entry: any) => ({
      businessDate: entry.businessDate || entry.date,
      description: entry.description,
      downtimeHours: entry.downtimeHours,
      fromTime: entry.fromTime,
      toTime: entry.toTime,
      remarks: entry.remarks,
    }))
    : (snapshot.workingSheet || []).flatMap((row: any) =>
      (row.maintenanceDescriptions || []).map((description: string) => ({
        businessDate: row.date,
        description,
        downtimeHours: row.downtimeHours,
      })),
    );
  const frozenDailyRows = (snapshot.performanceDailyRows || snapshot.dailyRows || []) as EquipmentPerformanceDailyRow[];
  const hasFrozenDailyRows = Array.isArray(frozenDailyRows) && frozenDailyRows.length > 0;
  const rows = hasFrozenDailyRows ? buildBillingDailyRows(frozenDailyRows, periodFrom, periodTo, maintenance) : [];
  const adjustments = snapshot.adjustments || {};
  const grossHire = Number(statement.grossAmount ?? snapshot.grossAmount ?? 0);
  // Statement.deductionAmount is the final aggregate (breakdown + HSD +
  // manual debits/credits). Only the separately frozen calculation component
  // belongs on the Breakdown line of the export.
  const breakdownDeduction = Number(snapshot.adjustments?.breakdownDeduction ?? snapshot.deductionAmount ?? 0);
  const hsdRecovery = Number(snapshot.adjustments?.hsdRecovery ?? snapshot.dieselRecoveryFinalAmount ?? snapshot.diesel?.finalRecoveryAmount ?? 0);
  const otherDebit = Number(adjustments.otherDebit || 0);
  const advanceAdjustment = Number(adjustments.advanceAdjustment || 0);
  const otherCredit = Number(adjustments.otherCredit || 0);
  const frozenFinancials = snapshot.financials || {};
  const financials = calculateEquipmentHireFinancials({
    grossHire: frozenFinancials.grossHire ?? grossHire,
    breakdownDeduction: frozenFinancials.breakdownDeduction ?? breakdownDeduction,
    hsdRecovery: frozenFinancials.hsdRecovery ?? hsdRecovery,
    otherDebit: frozenFinancials.otherDebit ?? otherDebit,
    advanceAdjustment: frozenFinancials.advanceAdjustment ?? advanceAdjustment,
    otherCredit: frozenFinancials.otherCredit ?? otherCredit,
    gstRate: frozenFinancials.gstRate ?? bill.gstRateEquipment,
    tdsRate: frozenFinancials.tdsRate ?? bill.tdsRate,
  });
  // Legacy paid bills did not store amountPaid. Preserve their paid-in-full
  // rendering against the frozen net (or the exact reconstructed financial
  // chain), rather than treating the absent field as zero.
  const paid = bill.amountPaid != null
    ? Number(bill.amountPaid)
    : bill.status === "paid"
      ? Number(bill.netPayableAmount ?? frozenFinancials.netPayable ?? financials.netPayable)
      : 0;
  const data: EquipmentHireExportData = {
    billNo: bill.billNo, vendorName: bill.vendorName, equipmentName: statement.equipmentName || snapshot.equipmentName || `Equipment #${equipmentId}`, projectSite: snapshot.projectSite,
    periodFrom, periodTo, hireBasis: String(statement.billingBasis || snapshot.terms?.billingBasis || "Hire").toUpperCase(),
    rate: Number(statement.rate ?? snapshot.terms?.rate ?? 0), grossHire, breakdownDeduction, hsdRecovery,
    otherDebit, otherDebitReason: adjustments.otherDebitReason, advanceAdjustment, advanceAdjustmentReason: adjustments.advanceAdjustmentReason,
    otherCredit, otherCreditReason: adjustments.otherCreditReason,
    gstRate: financials.gstRate, gstAmount: financials.gstAmount, taxableAmount: financials.taxableAmount,
    invoiceTotal: financials.invoiceTotal, tdsRate: financials.tdsRate, tdsAmount: financials.tdsAmount,
    netPayable: Number(bill.netPayableAmount ?? financials.netPayable), paid,
    dieselResponsibility: snapshot.terms?.dieselResponsibility ?? statement.dieselResponsibility,
    consumptionNorm: snapshot.diesel?.consumptionNorm ?? snapshot.terms?.consumptionNorm,
  };
  return { data, rows, hasFrozenDailyRows };
}

/** Detail-page action set. Approved/saved bills always export the frozen daily
 * rows held in their calculation snapshot; current Equipment Performance data
 * must never rewrite a historical bill. */
export function EquipmentHireBillDetailOutput({ bill }: { bill: any }) {
  const [showDaily, setShowDaily] = useState(false);
  const output = buildSavedEquipmentHireBillOutput(bill);
  if (!output) return null;
  const { data, rows, hasFrozenDailyRows } = output;
  return <div className="flex flex-wrap gap-2">
    {!hasFrozenDailyRows && <span className="self-center text-xs text-amber-700">Frozen daily activity is unavailable for this historical bill.</span>}
    <Button type="button" variant="outline" size="sm" onClick={() => setShowDaily(true)} data-testid="button-detail-view-daily-activity">View Daily Activity</Button>
    <EquipmentHireExportButtons data={data} rows={rows} />
    <EquipmentHireDailyActivity open={showDaily} onOpenChange={setShowDaily} rows={rows} dieselResponsibility={data.dieselResponsibility} consumptionNorm={data.consumptionNorm} />
  </div>;
}