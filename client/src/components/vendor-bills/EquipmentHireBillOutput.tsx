import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Download, FileText } from "lucide-react";
import type { EquipmentPerformanceDailyRow } from "@shared/equipmentPerformance";
import { computeEquipmentUsage, formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { calculateEquipmentHireFinancials } from "@shared/hireBilling";
import { projectHireReview, hireReviewDisclosureLines, hireReviewTable, MONTHLY_BILL_HEADERS } from "@shared/vendorBillLayout";
import { formatConsumptionRate } from "./HireActivityBreakdownCalendar";
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
  downtimeHours: number | null;
  trips?: number | null;
  statusLabel?: string;
  consumptionRateText?: string | null;
};

const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const savedNumber = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const savedListText = (value: unknown) =>
  list(value).filter(item => item != null && item !== "").map(String).join(" · ");
const savedRemarks = (value: unknown) =>
  (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean).map(String);
const savedReading = (value: unknown) => {
  const readings = list(value).map(savedNumber).filter((reading): reading is number => reading != null);
  return readings.length ? readings[0] : null;
};

function buildSavedHireDailyRows(
  rows: BillingDailyRow[],
  snapshot: any,
  data: Pick<EquipmentHireExportData, "consumptionNorm" | "meterType" | "consumptionRateUnit">,
): BillingDailyRow[] {
  const dailyDecisions = [...list(snapshot.dailyDecisions), ...list(snapshot.decisions?.daily)];
  const tripDecisions = [...list(snapshot.tripDecisions), ...list(snapshot.decisions?.trip)];
  const exceptions = [...list(snapshot.exceptions), ...list(snapshot.exceptionDecisions)];
  const savedDays = list(snapshot.workingSheet);
  const dates = new Set<string>([
    ...savedDays.map(row => row?.date),
    ...dailyDecisions.map(row => row?.date || row?.businessDate || row?.key),
    ...tripDecisions.map(row => row?.businessDate || row?.date || row?.key),
    ...exceptions.map(row => row?.date || row?.exceptionDate || row?.businessDate),
    ...list(snapshot.payableDays).map(row => row?.date),
  ].filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)));
  const baseRows = rows.length ? rows : Array.from(dates).sort().map(date => ({
    date, status: "No Work" as const, remarks: "No activity recorded", downtimeHours: 0,
  }));
  const daysByDate = new Map(savedDays.map(day => [day?.date, day]));
  return baseRows.map(row => {
    const day = daysByDate.get(row.date);
    if (!day) return row;
    const noActivity = day.activity === "no_activity";
    const noSavedActivity = day.activity == null;
    const performance = row.performance || (noActivity || noSavedActivity ? undefined : {
      key: `saved-working-sheet-${row.date}`,
      date: row.date,
      projectSite: savedListText(day.siteLocations),
      openingMeter: savedReading(day.openingReadings),
      closingMeter: savedReading(day.closingReadings),
      workingHours: savedNumber(day.hours),
      workingHoursIncomplete: false,
      startTime: null,
      endTime: null,
      multipleTimeSegments: false,
      clockDuration: null,
      clockDurationIncomplete: false,
      dieselIssued: savedNumber(day.actualDiesel),
      openingTank: null,
      closingTank: null,
      dieselConsumed: null,
      expectedDiesel: day.expectedDieselAvailable === false ? null : savedNumber(day.expectedDiesel),
      difference: day.expectedDieselAvailable === false ? null : savedNumber(day.dieselVariance),
      consumptionRate: null,
      consumptionRateUnit: (snapshot.dieselNormBasisOverride ?? data.consumptionRateUnit) === "L/km"
        ? "L/km" as const : "L/hr" as const,
      consumptionIncomplete: false,
      events: [],
    } satisfies EquipmentPerformanceDailyRow);
    const decisions = dailyDecisions.filter(decision =>
      (decision?.date || decision?.businessDate || decision?.key) === row.date,
    ).map(decision =>
      `Decision: ${decision.decision || decision.action || decision.resolution || "Not established"}${decision.reason ? ` — ${decision.reason}` : ""}`,
    );
    const trips = tripDecisions.filter(decision =>
      (decision?.businessDate || decision?.date || decision?.key) === row.date,
    ).map(decision =>
      `Trip decision: ${decision.selected === false ? "Excluded" : "Included"} ${decision.acceptedTrips ?? "—"} / ${decision.recordedTrips ?? "—"} trips${decision.reason ? ` — ${decision.reason}` : ""}`,
    );
    const exceptionNotes = exceptions.filter(decision =>
      (decision?.date || decision?.exceptionDate || decision?.businessDate) === row.date,
    ).map(decision =>
      `Exception: ${decision.decision || decision.action || decision.resolution || "Not established"}${decision.reason ? ` — ${decision.reason}` : ""}`,
    );
    const savedDayRemarks = [
      ...savedRemarks(day.remarks),
      ...savedListText(day.activityDescriptions).split(" · ").filter(Boolean),
      ...savedListText(day.maintenanceDescriptions).split(" · ").filter(Boolean),
      ...savedListText(day.movementReferences).split(" · ").filter(Boolean).map(reference => `Movement: ${reference}`),
      ...decisions, ...trips, ...exceptionNotes,
    ];
    const remarks = [...new Set([...row.remarks.split(" · ").filter(Boolean), ...savedDayRemarks])].join(" · ");
    const statusLabel = noActivity ? "No Activity — Still Billable"
      : day.activity === "breakdown" ? "Breakdown / Operator Unavailable"
        : noSavedActivity ? "Activity Not Recorded" : "Worked";
    const rateText = noActivity || noSavedActivity ? "—"
      : formatConsumptionRate(
        Number(day.actualDiesel ?? 0),
        Number(day.hours ?? 0),
        data.consumptionNorm,
        snapshot.dieselNormBasisOverride ?? data.consumptionRateUnit,
        data.meterType,
      );
    return {
      ...row,
      performance,
      status: noActivity ? "No Work" : day.activity === "breakdown" ? "Breakdown" : noSavedActivity ? row.status : "Worked",
      statusLabel,
      remarks,
      downtimeHours: savedNumber(day.downtimeHours) ?? row.downtimeHours,
      trips: noActivity || noSavedActivity ? null : savedNumber(day.trips),
      consumptionRateText: rateText,
    };
  });
}

export type EquipmentHirePeriodTotals = {
  hours: number | null;
  dieselIssued: number | null;
  dieselConsumed: number | null;
  expectedDiesel: number | null;
  variance: number | null;
  trips: number | null;
  breakdownDays: number;
  noActivityDays: number;
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
  paid: number | null;
  hireReview?: HireReview;
  dieselResponsibility?: "hlc" | "vendor" | string | null;
  consumptionNorm?: number | null;
  meterType?: string | null;
  consumptionRateUnit?: "L/hr" | "L/km" | null;
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
const expectedLitres = (value: number | null | undefined) => value == null ? "—" : `${number(value)} L`;
const displayConsumptionUnit = (unit: EquipmentPerformanceDailyRow["consumptionRateUnit"] | undefined) =>
  unit === "L/hr" ? "L/Hr" : unit === "L/km" ? "L/Km" : "";
const masterConsumptionUnit = (meterType?: string | null): EquipmentPerformanceDailyRow["consumptionRateUnit"] =>
  meterType ? computeEquipmentUsage({ meterType }, {}).efficiencyUnit : null;
const calendarConsumptionUnit = (
  rows: BillingDailyRow[],
  meterType?: string | null,
  frozenUnit?: EquipmentPerformanceDailyRow["consumptionRateUnit"],
) => frozenUnit || masterConsumptionUnit(meterType) || rows.map(row => row.performance?.consumptionRateUnit).find(Boolean);

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
    const activity = Array.from(new Set((performance?.events || [])
      .map(event => String(event.task || "").trim())
      .filter(Boolean)))
      .join(", ");
    const combinedRemarks = [remarks, activity].filter(Boolean).join(" | ");
    return {
      date,
      performance,
      status: breakdowns.length ? "Breakdown" : performance ? "Worked" : "No Work",
      remarks: combinedRemarks || "No activity recorded",
      downtimeHours,
    };
  });
}

function dailyHeaders(dieselResponsibility?: string | null, includeSavedEvidence = false) {
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  return [
    "Date", "Project / Site", "Opening Meter", "Closing Meter", "Working Hours", "Start", "End", "Clock Duration",
    ...(fuelIsContractorScope ? [] : ["Diesel Issued", "Opening Tank", "Closing Tank"]),
    ...(fuelIsContractorScope ? [] : ["Diesel Consumed", "Expected", "Norm"]),
    "Status / Remarks",
    ...(includeSavedEvidence ? SAVED_EVIDENCE_HEADERS : []),
  ];
}

function dailyValues(
  row: BillingDailyRow,
  dieselResponsibility?: string | null,
  consumptionNorm?: number | null,
  fallbackConsumptionUnit?: EquipmentPerformanceDailyRow["consumptionRateUnit"],
) {
  const item = row.performance;
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  // Norm is a master value, so its explicit master/frozen unit wins over a
  // row's usage unit (for example, a trip-converted hour-meter activity).
  const consumptionUnit = displayConsumptionUnit(fallbackConsumptionUnit || item?.consumptionRateUnit);
  const norm = consumptionNorm == null
    ? "—"
    : `${number(consumptionNorm, 2)}${consumptionUnit ? ` ${consumptionUnit}` : ""}`;
  const values = [
    dateLabel(row.date),
    item?.projectSite || "—",
    number(item?.openingMeter), number(item?.closingMeter),
    duration(item?.workingHours, item?.workingHoursIncomplete),
    formatEquipmentTime(item?.startTime), formatEquipmentTime(item?.endTime),
    duration(item?.clockDuration, item?.clockDurationIncomplete),
    ...(fuelIsContractorScope ? [] : [item?.dieselIssued == null ? "Tank Readings N/A" : litres(item.dieselIssued), tankReading(item?.openingTank), tankReading(item?.closingTank)]),
    ...(fuelIsContractorScope ? [] : [
      item?.consumptionIncomplete ? "Tank Readings N/A" : litres(item?.dieselConsumed),
      expectedLitres(item?.expectedDiesel),
      norm,
    ]),
    `${row.savedEvidence?.displayStatus || (row.status === "No Work" ? "Activity Not Recorded" : row.status === "Breakdown" ? "Breakdown / Operator Unavailable" : row.status)}${row.downtimeHours ? ` · ${number(row.downtimeHours, 2)}h downtime` : ""}${row.remarks ? ` — ${row.remarks}` : ""}`,
  ];
  if (row.savedEvidence) values.push(row.savedEvidence.workingSheet, row.savedEvidence.dieselSummary,
    row.savedEvidence.decisions, row.savedEvidence.remarksAndMovements);
  return values;
}

/** Same columns, values and widths as exportEquipmentHireBill's hire sheet. */
export function equipmentHireActivitySheetRows(
  rows: BillingDailyRow[], dieselResponsibility?: string | null, consumptionNorm?: number | null,
  meterType?: string | null,
) {
  const headers = dailyHeaders(dieselResponsibility, rows.some(row => !!row.savedEvidence));
  const unit = calendarConsumptionUnit(rows, meterType);
  return { headers, values: rows.map(row => dailyValues(row, dieselResponsibility, consumptionNorm, unit)),
    columns: headers.map((header, index) => ({ wch: index === headers.length - 1 ? 52 : Math.max(14, header.length + 2) })) };
}

type DailyTotalsRow = BillingDailyRow & {
  /** Kept out of BillingDailyRow so the persisted/live row contract stays unchanged. */
  trips?: number | null;
};

const knownNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Sum a nullable measurement without turning a wholly unavailable series into
 * a misleading zero.  A measured zero remains a measured zero.
 */
function sumKnown(values: Array<number | null | undefined>): number | null {
  const known = values.filter(knownNumber);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function rowTrips(row: BillingDailyRow): number | null {
  const candidate = row as DailyTotalsRow;
  if (knownNumber(candidate.trips)) return candidate.trips;

  const performance = candidate.performance as (EquipmentPerformanceDailyRow & {
    trips?: number | null;
    numberOfTrips?: number | null;
  }) | undefined;
  if (knownNumber(performance?.trips)) return performance.trips;
  if (knownNumber(performance?.numberOfTrips)) return performance.numberOfTrips;

  const events = performance?.events || [];
  const eventTrips = events
    .map(event => {
      const item = event as typeof event & { numberOfTrips?: number | null };
      return knownNumber(item.trips) ? item.trips : item.numberOfTrips;
    })
    .filter(knownNumber);
  return eventTrips.length ? eventTrips.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Calculate the compact calendar totals from exactly the rows displayed in the
 * daily table.  Unknown measurements are omitted from a partial sum; if every
 * row is unknown the total remains null, rather than becoming zero.
 */
export function buildEquipmentHirePeriodTotals(
  rows: BillingDailyRow[],
  dieselResponsibility?: string | null,
): EquipmentHirePeriodTotals {
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  const performanceRows = rows.map(row => row.performance);
  const measuredRows = performanceRows.map(item => ({
    hours: item?.workingHours,
    dieselIssued: fuelIsContractorScope ? null : item?.dieselIssued,
    dieselConsumed: fuelIsContractorScope || item?.consumptionIncomplete ? null : item?.dieselConsumed,
    expectedDiesel: fuelIsContractorScope ? null : item?.expectedDiesel,
    variance: fuelIsContractorScope || item?.consumptionIncomplete ? null : item?.difference,
  }));
  return {
    hours: sumKnown(measuredRows.map(item => item.hours)),
    dieselIssued: sumKnown(measuredRows.map(item => item.dieselIssued)),
    dieselConsumed: sumKnown(measuredRows.map(item => item.dieselConsumed)),
    expectedDiesel: sumKnown(measuredRows.map(item => item.expectedDiesel)),
    variance: sumKnown(measuredRows.map(item => item.variance)),
    trips: sumKnown(rows.map(rowTrips)),
    breakdownDays: rows.filter(row => row.status === "Breakdown").length,
    noActivityDays: rows.filter(row => row.status === "No Work").length,
  };
}

function periodTotalLabel(value: number | null, suffix = "") {
  return value == null ? "—" : `${number(value)}${suffix}`;
}

function EquipmentHirePeriodTotalsSummary({
  rows,
  dieselResponsibility,
}: {
  rows: BillingDailyRow[];
  dieselResponsibility?: string | null;
}) {
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  const totals = buildEquipmentHirePeriodTotals(rows, dieselResponsibility);
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border bg-muted/30 px-3 py-2 text-xs" data-testid="equipment-hire-period-totals">
    <span><strong>Hours:</strong> {periodTotalLabel(totals.hours, " h")}</span>
    {!fuelIsContractorScope && <>
      <span><strong>Diesel issued:</strong> {periodTotalLabel(totals.dieselIssued, " L")}</span>
      <span><strong>Consumed:</strong> {periodTotalLabel(totals.dieselConsumed, " L")}</span>
      <span><strong>Expected:</strong> {periodTotalLabel(totals.expectedDiesel, " L")}</span>
    </>}
    {totals.trips != null && <span><strong>Trips:</strong> {periodTotalLabel(totals.trips)}</span>}
    <span><strong>Breakdown days:</strong> {totals.breakdownDays}</span>
    <span><strong>No-activity days:</strong> {totals.noActivityDays}</span>
  </div>;
}

export function EquipmentHireDailyTable({ rows, dieselResponsibility, consumptionNorm, meterType, consumptionRateUnit }: {
  rows: BillingDailyRow[];
  dieselResponsibility?: string | null;
  consumptionNorm?: number | null;
  meterType?: string | null;
  consumptionRateUnit?: EquipmentPerformanceDailyRow["consumptionRateUnit"];
}) {
  const includeSavedEvidence = rows.some(row => !!row.savedEvidence);
  const headers = dailyHeaders(dieselResponsibility, includeSavedEvidence);
  const savedEvidenceStart = headers.length - (includeSavedEvidence ? SAVED_EVIDENCE_HEADERS.length : 0);
  const consumptionUnit = calendarConsumptionUnit(rows, meterType, consumptionRateUnit);
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1780px] text-xs">
      <thead className="bg-muted text-[10px] uppercase tracking-wide"><tr>{headers.map(header => <th key={header} className="px-2 py-2 text-right first:text-left last:text-left">{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={`${row.date}-${rowIndex}`} className="border-b align-top">
        {dailyValues(row, dieselResponsibility, consumptionNorm, consumptionUnit).map((value, index) => <td key={index} className={`px-2 py-2 ${index < savedEvidenceStart ? (index === 0 || index === 1 || index === savedEvidenceStart - 1 ? "text-left" : "text-right") : "whitespace-pre-wrap text-left"}`}>{value}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

export function EquipmentHireDailyActivity({ open, onOpenChange, rows, dieselResponsibility, consumptionNorm, meterType, consumptionRateUnit }: {
  open: boolean; onOpenChange: (value: boolean) => void; rows: BillingDailyRow[];
  dieselResponsibility?: string | null; consumptionNorm?: number | null;
  meterType?: string | null; consumptionRateUnit?: EquipmentPerformanceDailyRow["consumptionRateUnit"];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[98vw] overflow-y-auto">
      <DialogHeader><DialogTitle>Daily Activity</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Performance figures are the precomputed Equipment Performance daily rows for this equipment and bill period. Status and downtime remarks are provided for billing review.</p>
       {fuelIsContractorScope && <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Fuel / Diesel: Contractor Scope</div>}
       <EquipmentHirePeriodTotalsSummary rows={rows} dieselResponsibility={dieselResponsibility} />
       <div ref={scrollRef}>
         <EquipmentHireDailyTable rows={rows} dieselResponsibility={dieselResponsibility} consumptionNorm={consumptionNorm} meterType={meterType} consumptionRateUnit={consumptionRateUnit} />
       </div>
    </DialogContent>
  </Dialog>;
}

export function exportEquipmentHireBill(data: EquipmentHireExportData, rows: BillingDailyRow[], format: "pdf" | "xlsx") {
  const balance = data.paid == null ? null : data.netPayable - data.paid;
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
    [`TDS @ ${data.tdsRate}%`, `− ${money(data.tdsAmount)}`], ["NET PAYABLE", money(data.netPayable)], ["Paid", data.paid == null ? "—" : money(data.paid)], ["Balance This Bill", balance == null ? "—" : money(balance)],
  ];
  const safeName = (data.billNo || "equipment-hire-bill").replace(/[^\w-]+/g, "-");
  const consumptionUnit = calendarConsumptionUnit(rows, data.meterType, data.consumptionRateUnit);
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet([["Equipment Hire Bill Summary"], ...summary]);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 60 }];
    const activity = equipmentHireActivitySheetRows(rows, data.dieselResponsibility, data.consumptionNorm, data.meterType);
    const headers = activity.headers;
    const activitySheet = XLSX.utils.aoa_to_sheet([
      ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [["Fuel / Diesel: Contractor Scope"]] : []),
      headers, ...activity.values,
    ]);
    activitySheet["!cols"] = activity.columns;
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Bill Summary");
    if (data.hireReview) {
      const sheet = XLSX.utils.aoa_to_sheet([
        MONTHLY_BILL_HEADERS, ...hireReviewTable(data.hireReview),
        ...hireReviewDisclosureLines(data.hireReview).map(line => [line]),
      ]);
      sheet["!cols"] = [10, 50, 16, 16, 32, 38, 22].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, sheet, "Monthly Billing Summary");
    }
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
  if (data.hireReview) {
    doc.addPage("a4", "landscape");
    doc.setFontSize(12);
    doc.text("Monthly Billing Summary", 14, 16);
    autoTable(doc, { startY: 22, head: [MONTHLY_BILL_HEADERS.map(pdfText)],
      body: hireReviewTable(data.hireReview).map(row => row.map(value => pdfText(String(value)))),
      styles: { fontSize: 8 }, headStyles: { fillColor: [180, 83, 9] } });
    const disclosures = hireReviewDisclosureLines(data.hireReview);
    if (disclosures.length) {
      let y = ((doc as any).lastAutoTable?.finalY ?? 188) + 7;
      doc.setFontSize(9);
      for (const line of disclosures) {
        if (y > 195) { doc.addPage("a4", "landscape"); y = 16; }
        doc.text(pdfText(line), 14, y);
        y += 5;
      }
    }
  }
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
    head: [dailyHeaders(data.dieselResponsibility, rows.some(row => !!row.savedEvidence))],
    body: rows.map(row => dailyValues(row, data.dieselResponsibility, data.consumptionNorm, consumptionUnit).map(value => pdfText(String(value)))),
    theme: "grid",
    styles: { fontSize: 5.7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [180, 83, 9], fontSize: 5.8 },
    margin: { left: 6, right: 6 },
  });
  doc.save(`${safeName}.pdf`);
}

function calendarTotalsRows(
  totals: EquipmentHirePeriodTotals,
  fuelIsContractorScope: boolean,
): Array<Array<string | number | null>> {
  return [
    ["Period totals"],
    ["Total Hours", totals.hours],
    ...(fuelIsContractorScope ? [] : [
      ["Total Diesel Issued", totals.dieselIssued],
      ["Total Diesel Consumed", totals.dieselConsumed],
      ["Total Expected Diesel", totals.expectedDiesel],
    ]),
    ...(totals.trips == null ? [] : [["Total Trips", totals.trips]]),
    ["Breakdown Days", totals.breakdownDays],
    ["No-Activity Days", totals.noActivityDays],
  ];
}

/**
 * Export only the daily activity calendar and its period totals.  The bill
 * summary deliberately lives only in exportEquipmentHireBill.
 */
export function exportEquipmentHireCalendar(data: EquipmentHireExportData, rows: BillingDailyRow[], format: "pdf" | "xlsx") {
  const fuelIsContractorScope = String(data.dieselResponsibility).toLowerCase() === "vendor";
  const totals = buildEquipmentHirePeriodTotals(rows, data.dieselResponsibility);
  const headers = dailyHeaders(data.dieselResponsibility, rows.some(row => !!row.savedEvidence));
  const consumptionUnit = calendarConsumptionUnit(rows, data.meterType, data.consumptionRateUnit);
  const safeName = (data.billNo || "equipment-hire-bill").replace(/[^\w-]+/g, "-");
  const metadata: Array<Array<string | number | null>> = [
    ["Equipment Hire Daily Activity"],
    ["Equipment", data.equipmentName],
    ...(data.projectSite ? [["Project / Site", data.projectSite]] : []),
    ["Bill period", `${dateLabel(data.periodFrom)} to ${dateLabel(data.periodTo)}`],
    ...(fuelIsContractorScope ? [["Fuel / Diesel", "Contractor Scope"]] : []),
  ];
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const activitySheet = XLSX.utils.aoa_to_sheet([
      ...metadata,
      [],
      ...calendarTotalsRows(totals, fuelIsContractorScope),
      [],
      ...(fuelIsContractorScope ? [["Fuel / Diesel: Contractor Scope"]] : []),
      headers,
      ...rows.map(row => dailyValues(row, data.dieselResponsibility, data.consumptionNorm, consumptionUnit)),
    ]);
    activitySheet["!cols"] = headers.map((header, index) => ({ wch: index === headers.length - 1 ? 52 : Math.max(14, header.length + 2) }));
    XLSX.utils.book_append_sheet(workbook, activitySheet, "Daily Activity");
    XLSX.writeFile(workbook, `${safeName}-calendar.xlsx`);
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(13);
  doc.text("DAILY ACTIVITY CALENDAR", 14, 12);
  doc.setFontSize(8);
  doc.text(`Equipment: ${pdfText(String(data.equipmentName))}`, 14, 18);
  doc.text(`Period: ${pdfText(`${dateLabel(data.periodFrom)} to ${dateLabel(data.periodTo)}`)}`, 14, 23);
  if (data.projectSite) doc.text(`Project / Site: ${pdfText(data.projectSite)}`, 14, 28);
  const totalsStartY = data.projectSite ? 33 : 28;
  autoTable(doc, {
    startY: totalsStartY,
    head: [["Period Totals", "Value"]],
    body: calendarTotalsRows(totals, fuelIsContractorScope).slice(1).map(row => row.map(value => pdfText(String(value == null ? "—" : value)))),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [180, 83, 9] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 }, 1: { cellWidth: 35 } },
  });
  doc.addPage("a4", "landscape");
  doc.setFontSize(13);
  doc.text("DAILY ACTIVITY", 14, 12);
  if (fuelIsContractorScope) {
    doc.setFontSize(9);
    doc.text("Fuel / Diesel: Contractor Scope", 14, 17);
  }
  autoTable(doc, {
    startY: fuelIsContractorScope ? 21 : 16,
    head: [headers],
    body: rows.map(row => dailyValues(row, data.dieselResponsibility, data.consumptionNorm, consumptionUnit).map(value => pdfText(String(value)))),
    theme: "grid",
    styles: { fontSize: 5.7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [180, 83, 9], fontSize: 5.8 },
    margin: { left: 6, right: 6 },
  });
  doc.save(`${safeName}-calendar.pdf`);
}

export type EquipmentHireExportFormat = "pdf" | "xlsx";
type EquipmentHireExportMode = "calendar" | "bill" | "both";

export function EquipmentHireExportButtons({
  data,
  rows,
  disabled = false,
  onExportBill,
  availableFormats = ["pdf", "xlsx"],
}: {
  data: EquipmentHireExportData;
  rows: BillingDailyRow[];
  disabled?: boolean;
  onExportBill?: (format: EquipmentHireExportFormat) => void | Promise<void>;
  availableFormats?: EquipmentHireExportFormat[];
}) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [choiceFormat, setChoiceFormat] = useState<EquipmentHireExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const formats = availableFormats.filter((kind, index, values) => values.indexOf(kind) === index);
  const openChoice = (kind: EquipmentHireExportFormat) => {
    setExportError(null);
    setChoiceFormat(kind);
  };
  const download = async (mode: EquipmentHireExportMode) => {
    if (!choiceFormat) return;
    const kind = choiceFormat;
    setExporting(`${mode}-${kind}`);
    setChoiceFormat(null);
    setExportError(null);
    try {
      if (mode === "bill" || mode === "both") {
        if (onExportBill) await onExportBill(kind);
        else exportEquipmentHireBill(data, rows, kind);
      }
      if (mode === "calendar" || mode === "both") exportEquipmentHireCalendar(data, rows, kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportError(message || "The export could not be completed.");
    } finally {
      setExporting(null);
    }
  };
  return <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" size="sm" disabled={disabled || !!exporting || !formats.includes("pdf")} onClick={() => openChoice("pdf")} data-testid="button-export-equipment-hire-pdf"><FileText className="mr-1 h-4 w-4" />{exporting?.endsWith("-pdf") ? "Preparing…" : "Export PDF"}</Button>
    <Button type="button" variant="outline" size="sm" disabled={disabled || !!exporting || !formats.includes("xlsx")} onClick={() => openChoice("xlsx")} data-testid="button-export-equipment-hire-excel"><Download className="mr-1 h-4 w-4" />{exporting?.endsWith("-xlsx") ? "Preparing…" : "Export Excel"}</Button>
    {exportError && <p role="alert" className="basis-full text-xs text-destructive">Export failed: {exportError}</p>}
    <Dialog open={choiceFormat !== null} onOpenChange={open => !open && setChoiceFormat(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Choose {choiceFormat === "xlsx" ? "Excel" : "PDF"} export</DialogTitle></DialogHeader>
        <div className="grid gap-2">
          <Button type="button" variant="outline" disabled={!!exporting} onClick={() => download("calendar")} data-testid="button-export-equipment-hire-choice-calendar">Export Calendar</Button>
          <Button type="button" variant="outline" disabled={!!exporting} onClick={() => download("bill")} data-testid="button-export-equipment-hire-choice-bill">Export Bill</Button>
          <Button type="button" disabled={!!exporting} onClick={() => download("both")} data-testid="button-export-equipment-hire-choice-both">Export Both</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

/** Converts the persisted statement shape into the exact export model. */
export function buildSavedEquipmentHireBillOutput(bill: any): { data: EquipmentHireExportData; rows: BillingDailyRow[]; hasFrozenDailyRows: boolean } | null {
  const statement = Array.isArray(bill.hireStatements) ? bill.hireStatements[0] : null;
  const snapshot = statement?.calculationSnapshot || {};
  const equipmentId = Number(statement?.equipmentId || snapshot?.equipmentId || 0);
  const periodFrom = statement?.periodFrom || bill.periodFrom || "";
  const periodTo = statement?.periodTo || bill.periodTo || "";
  if (!statement) return null;
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
  const savedDates = [
    ...list(snapshot.workingSheet).map(row => row?.date),
    ...list(snapshot.performanceDailyRows || snapshot.dailyRows).map(row => row?.date),
    ...list(snapshot.dailyDecisions).map(row => row?.date || row?.businessDate || row?.key),
    ...list(snapshot.decisions?.daily).map(row => row?.date || row?.businessDate || row?.key),
    ...list(snapshot.tripDecisions).map(row => row?.businessDate || row?.date || row?.key),
    ...list(snapshot.decisions?.trip).map(row => row?.businessDate || row?.date || row?.key),
    ...list(snapshot.exceptions).map(row => row?.date || row?.exceptionDate || row?.businessDate),
    ...list(snapshot.exceptionDecisions).map(row => row?.date || row?.exceptionDate || row?.businessDate),
    ...list(snapshot.payableDays).map(row => row?.date),
  ].filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const rowFrom = periodFrom || savedDates[0] || "";
  const rowTo = periodTo || savedDates.at(-1) || "";
  if (!equipmentId && !statement.equipmentName && !snapshot.equipmentName && !savedDates.length) return null;
  const rows = hasFrozenDailyRows && rowFrom && rowTo
    ? buildBillingDailyRows(frozenDailyRows, rowFrom, rowTo, maintenance) : [];
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
  // Paid status and paidAt do not establish a cash/bank amount.
  const paid = bill.amountPaid != null && bill.amountPaid !== "" && Number.isFinite(Number(bill.amountPaid))
    ? Number(bill.amountPaid) : null;
  const data: EquipmentHireExportData = {
    hireReview: bill.hireReview || projectHireReview(statement, bill),
    billNo: bill.billNo, vendorName: bill.vendorName, equipmentName: statement.equipmentName || snapshot.equipmentName || (equipmentId ? `Equipment #${equipmentId}` : "Equipment"), projectSite: snapshot.projectSite,
    periodFrom, periodTo, hireBasis: String(statement.billingBasis || snapshot.terms?.billingBasis || "Hire").toUpperCase(),
    rate: Number(statement.rate ?? snapshot.terms?.rate ?? 0), grossHire, breakdownDeduction, hsdRecovery,
    otherDebit, otherDebitReason: adjustments.otherDebitReason, advanceAdjustment, advanceAdjustmentReason: adjustments.advanceAdjustmentReason,
    otherCredit, otherCreditReason: adjustments.otherCreditReason,
    gstRate: financials.gstRate, gstAmount: financials.gstAmount, taxableAmount: financials.taxableAmount,
    invoiceTotal: financials.invoiceTotal, tdsRate: financials.tdsRate, tdsAmount: financials.tdsAmount,
    netPayable: Number(bill.netPayableAmount ?? financials.netPayable), paid,
    dieselResponsibility: snapshot.terms?.dieselResponsibility ?? statement.dieselResponsibility,
    consumptionNorm: snapshot.diesel?.consumptionNorm ?? snapshot.terms?.consumptionNorm,
    meterType: snapshot.terms?.meterType,
    consumptionRateUnit: snapshot.terms?.consumptionRateUnit ?? snapshot.dieselNormBasisOverride,
  };
  return { data, rows: buildSavedHireDailyRows(rows, snapshot, data.hireReview!, data), hasFrozenDailyRows };
}

/** Detail-page action set. Approved/saved bills always export the frozen daily
 * rows held in their calculation snapshot; current Equipment Performance data
 * must never rewrite a historical bill. */
export function EquipmentHireBillDetailOutput({ bill, output: suppliedOutput }: {
  bill: any;
  /** Reuse the page's already prepared display output for whole-bill capture. */
  output?: ReturnType<typeof buildSavedEquipmentHireBillOutput>;
}) {
  const [showDaily, setShowDaily] = useState(false);
  const output = suppliedOutput === undefined ? buildSavedEquipmentHireBillOutput(bill) : suppliedOutput;
  if (!output) return null;
  const { data, rows, hasFrozenDailyRows } = output;
  const hasExportablePeriod = hasFrozenDailyRows && !!data.periodFrom && !!data.periodTo;
  return <div className="flex flex-wrap gap-2">
    {!hasFrozenDailyRows && <span className="self-center text-xs text-amber-700">Frozen daily activity is unavailable for this historical bill.</span>}
    <Button type="button" variant="outline" size="sm" disabled={!hasFrozenDailyRows} onClick={() => setShowDaily(true)} data-testid="button-detail-view-daily-activity">View Daily Activity</Button>
    <EquipmentHireExportButtons data={data} rows={rows} disabled={!hasExportablePeriod} />
    <EquipmentHireDailyActivity open={showDaily} onOpenChange={setShowDaily} rows={rows} dieselResponsibility={data.dieselResponsibility} consumptionNorm={data.consumptionNorm} meterType={data.meterType} consumptionRateUnit={data.consumptionRateUnit} />
  </div>;
}