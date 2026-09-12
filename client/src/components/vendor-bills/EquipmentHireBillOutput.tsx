import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Download, FileText } from "lucide-react";
import type { EquipmentPerformanceDailyRow } from "@shared/equipmentPerformance";
import { formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
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
  tdsRate: number;
  tdsAmount: number;
  netPayable: number;
  paid: number;
};

const money = (value: number | null | undefined) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: number | null | undefined, decimals = 1) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: decimals });
const dateLabel = (value: string) => {
  try { return format(new Date(`${value}T00:00:00`), "dd MMM yyyy"); } catch { return value; }
};
const duration = (value: number | null | undefined, incomplete = false) =>
  value == null ? "—" : `${incomplete ? "Partial · " : ""}${formatEquipmentDuration(value)}`;
const litres = (value: number | null | undefined) => value == null ? "—" : `${number(value)} L`;
const difference = (row?: EquipmentPerformanceDailyRow) =>
  !row || row.consumptionIncomplete ? "Incomplete" : row.difference == null ? "—" : `${row.difference > 0 ? "+" : ""}${litres(row.difference)}`;

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

function dailyHeaders() {
  return ["Date", "Project / Site", "Opening Meter", "Closing Meter", "Working Hours", "Start", "End", "Clock Duration", "Diesel Issued", "Opening Tank", "Closing Tank", "Diesel Consumed", "Expected", "Difference", "Consumption Rate", "Status / Remarks"];
}

function dailyValues(row: BillingDailyRow) {
  const item = row.performance;
  return [
    dateLabel(row.date),
    item?.projectSite || "—",
    number(item?.openingMeter), number(item?.closingMeter),
    duration(item?.workingHours, item?.workingHoursIncomplete),
    formatEquipmentTime(item?.startTime), formatEquipmentTime(item?.endTime),
    duration(item?.clockDuration, item?.clockDurationIncomplete),
    litres(item?.dieselIssued), litres(item?.openingTank), litres(item?.closingTank),
    item?.consumptionIncomplete ? "Incomplete" : litres(item?.dieselConsumed),
    litres(item?.expectedDiesel), difference(item),
    item?.consumptionIncomplete || !item?.consumptionRate ? "Incomplete" : `${number(item.consumptionRate, 2)} ${item.consumptionRateUnit || ""}`,
    `${row.status}${row.downtimeHours ? ` · ${number(row.downtimeHours, 2)}h downtime` : ""}${row.remarks ? ` — ${row.remarks}` : ""}`,
  ];
}

export function EquipmentHireDailyActivity({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (value: boolean) => void; rows: BillingDailyRow[] }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[98vw] overflow-y-auto">
      <DialogHeader><DialogTitle>Daily Activity</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Performance figures are the precomputed Equipment Performance daily rows for this equipment and bill period. Status and downtime remarks are provided for billing review.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1780px] text-xs">
          <thead className="bg-muted text-[10px] uppercase tracking-wide"><tr>{dailyHeaders().map(header => <th key={header} className="px-2 py-2 text-right first:text-left last:text-left">{header}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.date} className="border-b align-top">
            {dailyValues(row).map((value, index) => <td key={index} className={`px-2 py-2 ${index === 0 || index === 1 || index === 15 ? "text-left" : "text-right"}`}>{value}</td>)}
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
    ["Breakdown Deduction", `− ${money(data.breakdownDeduction)}`], ["HSD Recovery", `− ${money(data.hsdRecovery)}`],
    ["Other Debit / Recovery", `− ${money(data.otherDebit)}${data.otherDebitReason ? ` (${data.otherDebitReason})` : ""}`],
    ["Advance Adjustment", `− ${money(data.advanceAdjustment)}${data.advanceAdjustmentReason ? ` (${data.advanceAdjustmentReason})` : ""}`],
    ["Other Credit", `+ ${money(data.otherCredit)}${data.otherCreditReason ? ` (${data.otherCreditReason})` : ""}`],
    ["Taxable / Bill Amount", money(data.grossHire - data.breakdownDeduction - data.hsdRecovery - data.otherDebit - data.advanceAdjustment + data.otherCredit)],
    [`TDS @ ${data.tdsRate}%`, `− ${money(data.tdsAmount)}`], ["NET PAYABLE", money(data.netPayable)], ["Paid", money(data.paid)], ["Balance This Bill", money(balance)],
  ];
  const safeName = (data.billNo || "equipment-hire-bill").replace(/[^\w-]+/g, "-");
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet([["Equipment Hire Bill Summary"], ...summary]);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 60 }];
    const activitySheet = XLSX.utils.aoa_to_sheet([dailyHeaders(), ...rows.map(dailyValues)]);
    activitySheet["!cols"] = dailyHeaders().map((header, index) => ({ wch: index === 15 ? 52 : Math.max(14, header.length + 2) }));
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
    body: summary,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [180, 83, 9] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 65 }, 1: { cellWidth: 110 } },
  });
  // The activity always begins on a new page, keeping the summary cleanly on page one.
  doc.addPage("a4", "landscape");
  doc.setFontSize(13);
  doc.text("DAILY ACTIVITY", 14, 12);
  autoTable(doc, {
    startY: 16,
    head: [dailyHeaders()],
    body: rows.map(dailyValues),
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
  const taxable = Math.max(0, grossHire - breakdownDeduction - hsdRecovery - otherDebit - advanceAdjustment + otherCredit);
  const tdsRate = Number(bill.tdsRate || 0);
  const tdsAmount = taxable * tdsRate / 100;
  const netPayable = Number(bill.netPayableAmount ?? (taxable - tdsAmount));
  const paid = bill.amountPaid != null ? Number(bill.amountPaid) : bill.status === "paid" ? netPayable : 0;
  const data: EquipmentHireExportData = {
    billNo: bill.billNo, vendorName: bill.vendorName, equipmentName: statement.equipmentName || snapshot.equipmentName || `Equipment #${equipmentId}`, projectSite: snapshot.projectSite,
    periodFrom, periodTo, hireBasis: String(statement.billingBasis || snapshot.terms?.billingBasis || "Hire").toUpperCase(),
    rate: Number(statement.rate ?? snapshot.terms?.rate ?? 0), grossHire, breakdownDeduction, hsdRecovery,
    otherDebit, otherDebitReason: adjustments.otherDebitReason, advanceAdjustment, advanceAdjustmentReason: adjustments.advanceAdjustmentReason,
    otherCredit, otherCreditReason: adjustments.otherCreditReason, tdsRate, tdsAmount, netPayable, paid,
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
    <EquipmentHireDailyActivity open={showDaily} onOpenChange={setShowDaily} rows={rows} />
  </div>;
}