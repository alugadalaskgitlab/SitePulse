import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Download, FileText } from "lucide-react";
import type { EquipmentPerformanceDailyRow } from "@shared/equipmentPerformance";
import { computeEquipmentUsage, formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { calculateEquipmentHireFinancials } from "@shared/hireBilling";
import { projectHireReview, hireReviewDisclosureLines, hireReviewTable, MONTHLY_BILL_HEADERS, type HireReview } from "@shared/vendorBillLayout";
import { getBaseSiteName } from "@shared/siteName";
import { formatConsumptionRate } from "./HireActivityBreakdownCalendar";
import { drawPdfBillFooter, drawPdfBillHeader, INK_LIGHT_TABLE } from "./pdfExportStyle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hireStatementExportFromData, type WholeBillSnapshot } from "./wholeBillSnapshot";
import { buildWholeBillEquipmentPdf } from "./wholeBillEquipmentPdf";

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
  workingSheetSource?: boolean;
};

const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const savedNumber = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const savedList = (value: unknown) =>
  list(value).filter(item => item != null && item !== "").map(String);
const savedListText = (value: unknown) => savedList(value).join(" · ");
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
  const baseRows: BillingDailyRow[] = rows.length ? rows : Array.from(dates).sort().map(date => ({
    date, status: "No Work" as const, remarks: "No activity recorded", downtimeHours: 0,
  }));
  const daysByDate = new Map(savedDays.map(day => [day?.date, day]));
  return baseRows.map(row => {
    const day = daysByDate.get(row.date);
    const daily = dailyDecisions.some(decision => (decision?.date || decision?.businessDate || decision?.key) === row.date);
    const trip = tripDecisions.some(decision => (decision?.businessDate || decision?.date || decision?.key) === row.date);
    const exception = exceptions.some(decision => (decision?.date || decision?.exceptionDate || decision?.businessDate) === row.date);
    if (!day && !daily && !trip && !exception) return row;
    const noActivity = day?.activity === "no_activity";
    const noRecordedActivity = noActivity || day?.activity === "not_recorded";
    const noSavedActivity = day?.activity == null;
    const performance = !day || noRecordedActivity ? undefined : row.performance || (noSavedActivity ? undefined : {
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
      openingTank: savedNumber(day.openingDiesel),
      closingTank: savedNumber(day.closingDiesel),
      dieselConsumed: null,
      expectedDiesel: day.expectedDieselAvailable === false ? null : savedNumber(day.expectedDiesel),
      difference: day.expectedDieselAvailable === false ? null : savedNumber(day.dieselVariance),
      consumptionRate: savedNumber(day.consumptionRate),
      consumptionRateUnit: day.consumptionRateUnit ?? null,
      consumptionIncomplete: day.consumptionIncomplete ?? true,
      events: [],
    } satisfies EquipmentPerformanceDailyRow);
    const decisions = dailyDecisions.filter(decision =>
      (decision?.date || decision?.businessDate || decision?.key) === row.date,
    ).map(decision =>
      `Decision: ${decision.decision || decision.action || decision.resolution || "Not established"}${decision.reason ? ` — ${decision.reason}` : ""}${decision.remarks ? ` · ${decision.remarks}` : ""}`,
    );
    const trips = tripDecisions.filter(decision =>
      (decision?.businessDate || decision?.date || decision?.key) === row.date,
    ).map(decision =>
      `Trip decision: ${decision.selected === false ? "Excluded" : "Included"} ${decision.acceptedTrips ?? "—"} / ${decision.recordedTrips ?? "—"} trips${decision.reason ? ` — ${decision.reason}` : ""}${decision.remarks ? ` · ${decision.remarks}` : ""}`,
    );
    const exceptionNotes = exceptions.filter(decision =>
      (decision?.date || decision?.exceptionDate || decision?.businessDate) === row.date,
    ).map(decision =>
      `Exception: ${decision.decision || decision.action || decision.resolution || "Not established"}${decision.reason ? ` — ${decision.reason}` : ""}${decision.remarks ? ` · ${decision.remarks}` : ""}`,
    );
    const savedDayRemarks = [
      ...savedRemarks(day?.remarks),
      ...savedList(day?.activityDescriptions),
      ...savedList(day?.maintenanceDescriptions),
      ...(day?.usageStatusReason ? [String(day.usageStatusReason)] : []),
      ...savedList(day?.movementReferences).map(reference => `Movement: ${reference}`),
      ...decisions, ...trips, ...exceptionNotes,
    ];
    const baseRemarks = row.remarks === "No activity recorded" && day?.activity != null ? [] : row.remarks.split(" · ").filter(Boolean);
    const remarks = Array.from(new Set([...baseRemarks, ...savedDayRemarks])).join(" · ");
    const statusLabel = !day ? row.statusLabel
      : day.activity === "idle_no_work" ? "Idle — No Work Available"
        : day.activity === "idle_no_operator" ? "Operator / Driver Unavailable"
          : day.activity === "breakdown" ? "Breakdown"
            : noActivity || day.activity === "not_recorded" ? "Activity Not Recorded"
              : noSavedActivity ? "Activity Not Recorded" : "Worked";
    const unavailableActivity = noActivity || noSavedActivity || day?.activity === "not_recorded";
    const rateText = !day ? row.consumptionRateText : unavailableActivity ? "—"
      : formatConsumptionRate(
        performance?.consumptionRate ?? day.consumptionRate,
        performance?.consumptionRateUnit ?? day.consumptionRateUnit,
        data.consumptionNorm,
        performance?.consumptionIncomplete ?? day.consumptionIncomplete,
      );
    return {
      ...row,
      performance,
      ...(day ? { workingSheetSource: true } : {}),
      status: !day ? row.status : noActivity ? "No Work" : day.activity === "breakdown" ? "Breakdown" : noSavedActivity ? row.status : "Worked",
      statusLabel,
      remarks,
      downtimeHours: savedNumber(day?.downtimeHours) ?? row.downtimeHours,
      ...(day ? { trips: noActivity || noSavedActivity ? null : savedNumber(day.trips) } : {}),
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
  billDate?: string;
  billStatus?: string;
  companyName?: string;
  vendorName: string;
  equipmentName: string;
  equipmentType?: string;
  equipmentMasterReference?: string | number | null;
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
  advanceAdjustmentDate?: string | null;
  otherCredit: number;
  otherCreditReason?: string;
  hsdRecoveryReason?: string;
  gstRate: number;
  gstAmount: number | null;
  taxableAmount: number | null;
  taxBase?: number | null;
  invoiceTotal: number | null;
  tdsRate: number;
  tdsAmount: number | null;
  netPayable: number | null;
  paid: number | null;
  monthlyDivisorType?: string | null;
  monthlyDivisor?: number | null;
  hireReview?: HireReview;
  dieselResponsibility?: "hlc" | "vendor" | string | null;
  consumptionNorm?: number | null;
  meterType?: string | null;
  consumptionRateUnit?: "L/hr" | "L/km" | null;
};

const money = (value: number | null | undefined) => value == null
  ? "—"
  : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: number | null | undefined, decimals = 1) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: decimals });
const numberFixed = (value: number, decimals = 2) => Number(value).toLocaleString("en-IN", {
  minimumFractionDigits: decimals, maximumFractionDigits: decimals,
});
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
const litres = (value: number | null | undefined) => value == null ? "Tank Readings N/A" : `${numberFixed(value)} L`;
const tankReading = (value: number | null | undefined) => value == null ? "Tank Readings N/A" : `${number(value)} L`;
const expectedLitres = (value: number | null | undefined) => value == null ? "—" : `${numberFixed(value)} L`;
const varianceLitres = (value: number | null | undefined) =>
  value == null ? "—" : `${value >= 0 ? "+" : "−"}${numberFixed(Math.abs(value))} L`;
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

function dailyHeaders(dieselResponsibility?: string | null) {
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  return [
    "Date", "Project / Site", "Opening Meter", "Closing Meter", "Working Hours", "Trips", "Start", "End", "Clock Duration",
    ...(fuelIsContractorScope ? [] : ["Diesel Issued", "Opening Tank", "Closing Tank"]),
    ...(fuelIsContractorScope ? [] : ["Diesel Consumed", "Expected", "Difference", "Norm"]),
    "Consumption Rate",
    "Status / Remarks",
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
  const noActivity = row.statusLabel === "No Activity — Still Billable" || row.statusLabel === "Activity Not Recorded";
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
    duration(item?.workingHours, item?.workingHoursIncomplete), number(rowTrips(row), 2),
    formatEquipmentTime(item?.startTime), formatEquipmentTime(item?.endTime),
    duration(item?.clockDuration, item?.clockDurationIncomplete),
     ...(fuelIsContractorScope ? [] : [
       noActivity ? "—" : item?.dieselIssued == null ? "Tank Readings N/A" : litres(item.dieselIssued),
       noActivity ? "—" : tankReading(item?.openingTank),
       noActivity ? "—" : tankReading(item?.closingTank),
     ]),
    ...(fuelIsContractorScope ? [] : [
       noActivity ? "—" : item?.consumptionIncomplete ? "Tank Readings N/A" : litres(item?.dieselConsumed),
      expectedLitres(item?.expectedDiesel),
      varianceLitres(item?.difference),
      norm,
    ]),
    row.consumptionRateText ?? (item?.consumptionRate == null
      ? "—"
      : `${number(item.consumptionRate, 2)}${displayConsumptionUnit(item.consumptionRateUnit) ? ` ${displayConsumptionUnit(item.consumptionRateUnit)}` : ""}`),
    `${row.statusLabel || (row.status === "No Work" ? "Activity Not Recorded" : row.status === "Breakdown" ? "Breakdown" : row.status)}${row.downtimeHours ? ` · ${number(row.downtimeHours, 2)}h downtime` : ""}${row.remarks ? ` — ${row.remarks}` : ""}`,
  ];
  return values;
}

/** Same columns, values and widths as exportEquipmentHireBill's hire sheet. */
export function equipmentHireActivitySheetRows(
  rows: BillingDailyRow[], dieselResponsibility?: string | null, consumptionNorm?: number | null,
  meterType?: string | null, compactEmptyColumns = false,
) {
  const headers = dailyHeaders(dieselResponsibility);
  const unit = calendarConsumptionUnit(rows, meterType);
  const siteIndex = headers.indexOf("Project / Site");
  const values = rows.map(row => {
    const cells = dailyValues(row, dieselResponsibility, consumptionNorm, unit);
    if (siteIndex >= 0 && cells[siteIndex] && cells[siteIndex] !== "—") {
      cells[siteIndex] = getBaseSiteName(String(cells[siteIndex]));
    }
    return cells;
  });
  const activeIndexes = compactEmptyColumns
    ? headers.map((_, index) => index).filter(index =>
        values.some(row => {
          const value = row[index];
          return value != null && String(value).trim() !== "" && !["—", "-"].includes(String(value).trim());
        }),
      )
    : headers.map((_, index) => index);
  const visibleHeaders = activeIndexes.map(index => headers[index]);
  return {
    headers: visibleHeaders,
    values: values.map(row => activeIndexes.map(index => row[index])),
    columns: visibleHeaders.map(header => ({ wch: header === "Status / Remarks" ? 52 : header === "Trips" ? 9 : Math.max(14, header.length + 2) })),
  };
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
  const headers = dailyHeaders(dieselResponsibility);
  const consumptionUnit = calendarConsumptionUnit(rows, meterType, consumptionRateUnit);
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1920px] text-xs">
      <thead className="bg-muted text-[10px] uppercase tracking-wide"><tr>{headers.map(header => <th key={header} className="px-2 py-2 text-right first:text-left last:text-left">{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={`${row.date}-${rowIndex}`} className="border-b align-top">
        {dailyValues(row, dieselResponsibility, consumptionNorm, consumptionUnit).map((value, index) => <td key={index} className={`px-2 py-2 ${index === 0 || index === 1 || index === headers.length - 1 ? "text-left" : "text-right"}`}>{value}</td>)}
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
  const balance = data.paid == null || data.netPayable == null ? null : data.netPayable - data.paid;
  const summary = [
    ["Vendor", data.vendorName], ["Equipment", data.equipmentName], ...(data.projectSite ? [["Project / Site", data.projectSite]] : []), ["Bill period", `${dateLabel(data.periodFrom)} to ${dateLabel(data.periodTo)}`],
    ["Hire basis", data.hireBasis], ["Rate", money(data.rate)], ["Gross Hire", money(data.grossHire)],
    ["Breakdown Deduction", `− ${money(data.breakdownDeduction)}`],
    ...(data.taxBase == null ? [] : [["Gross bill amount (taxable)", money(data.taxBase)]]),
    ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [] : [["HSD Recovery", `− ${money(data.hsdRecovery)}`]]),
    ["Other Debit / Recovery", `− ${money(data.otherDebit)}${data.otherDebitReason ? ` (${data.otherDebitReason})` : ""}`],
    ["Advance Adjustment", `− ${money(data.advanceAdjustment)}${data.advanceAdjustmentReason ? ` (${data.advanceAdjustmentReason})` : ""}`],
    ["Other Credit", `+ ${money(data.otherCredit)}${data.otherCreditReason ? ` (${data.otherCreditReason})` : ""}`],
    ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [["Fuel / Diesel", "Contractor Scope"]] : []),
    [data.taxBase == null ? "Taxable / Bill Amount" : "Net amount - this bill (before GST/TDS)", money(data.taxableAmount)],
    [`GST @ ${data.gstRate}%`, `+ ${money(data.gstAmount)}`], ["Invoice Total", money(data.invoiceTotal)],
    [`TDS @ ${data.tdsRate}%`, `− ${money(data.tdsAmount)}`], ["NET PAYABLE", money(data.netPayable)], ["Paid", data.paid == null ? "—" : money(data.paid)], ["Balance This Bill", balance == null ? "—" : money(balance)],
  ];
  const safeName = (data.billNo || "equipment-hire-bill").replace(/[^\w-]+/g, "-");
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet([["Equipment Hire Bill Summary"], ...summary]);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 60 }];
    const activity = equipmentHireActivitySheetRows(rows, "hlc", data.consumptionNorm, data.meterType, false);
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
      sheet["!cols"] = [10, 50, 16, 16, 32, 20, 34, 22].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, sheet, "Monthly Billing Summary");
    }
    XLSX.utils.book_append_sheet(workbook, activitySheet, "Daily Activity");
    XLSX.writeFile(workbook, `${safeName}.xlsx`);
    return;
  }
  const statementExport = hireStatementExportFromData(data);
  const gstAmount = data.gstAmount != null && Number.isFinite(data.gstAmount) ? data.gstAmount : 0;
  const billSnapshot: WholeBillSnapshot = {
    companyName: data.companyName || "Highlane Constructions",
    vendorName: data.vendorName,
    billNo: data.billNo || "",
    billDate: data.billDate || data.periodTo,
    periodFrom: data.periodFrom,
    periodTo: data.periodTo,
    site: data.projectSite || "",
    equipmentType: data.equipmentType,
    billType: "equipment",
    billTypeLabel: "Equipment hire",
    saved: !!data.billStatus && data.billStatus.toLowerCase() !== "draft",
    status: data.billStatus || "Draft",
    generatedAt: new Date().toISOString(),
    sections: [],
    calendars: [],
    hireReviews: data.hireReview ? [data.hireReview] : [],
    hireStatementDetails: [statementExport],
    financialRows: [
      { label: "Gross hire", amount: data.grossHire },
      { label: "Breakdown deduction", amount: -Math.abs(data.breakdownDeduction) },
      { label: "Gross bill amount", amount: data.taxBase ?? data.taxableAmount ?? Number.NaN },
      ...(String(data.dieselResponsibility).toLowerCase() === "vendor" ? [] : [{ label: "HSD recovery", amount: -Math.abs(data.hsdRecovery), reason: data.hsdRecoveryReason }]),
      ...(data.otherDebit ? [{ label: "Other debit", amount: -Math.abs(data.otherDebit), reason: data.otherDebitReason }] : []),
      ...(data.advanceAdjustment ? [{ label: "Advance adjustment", amount: -Math.abs(data.advanceAdjustment), reason: data.advanceAdjustmentReason }] : []),
      ...(data.otherCredit ? [{ label: "Other credit", amount: Math.abs(data.otherCredit), reason: data.otherCreditReason }] : []),
      ...(data.tdsAmount == null ? [] : [{ label: `IT TDS @ ${data.tdsRate}%`, amount: -Math.abs(data.tdsAmount) }]),
      { label: "NET PAYABLE", amount: data.netPayable ?? Number.NaN },
    ],
    totals: {
      subtotal: data.taxableAmount ?? Number.NaN,
      gst: gstAmount > 0 ? [{ label: `GST @ ${data.gstRate}%`, amount: gstAmount }] : [],
      totalGst: gstAmount,
      adjustments: [],
      tds: { label: `IT TDS @ ${data.tdsRate}%`, amount: data.tdsAmount == null ? Number.NaN : -Math.abs(data.tdsAmount) },
      netPayable: data.netPayable ?? Number.NaN,
    },
  };
  const doc = buildWholeBillEquipmentPdf(billSnapshot);
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

const noActivityRecorded = (row: BillingDailyRow) =>
  row.status === "No Work" ||
  row.statusLabel === "No Activity — Still Billable" ||
  row.statusLabel === "Activity Not Recorded";

function monthTitle(value: string) {
  try { return format(new Date(`${value.slice(0, 10)}T00:00:00`), "MMMM yyyy"); } catch { return value.slice(0, 7); }
}

function formatHoursMinutes(value: number) {
  const totalMinutes = Math.round(Number(value) * 60);
  const sign = totalMinutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(totalMinutes);
  return `${sign}${Math.floor(absoluteMinutes / 60)}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
}

function activityStatementRow(
  row: BillingDailyRow,
  data: EquipmentHireExportData,
  tripColumn: boolean,
  fuelIsContractorScope: boolean,
  consumptionUnit: string,
) {
  const item = row.performance;
  const isBreakdown = row.status === "Breakdown";
  const review = !isBreakdown && (!item || !!item.workingHoursIncomplete || !!item.clockDurationIncomplete ||
    (!fuelIsContractorScope && (
      item.openingTank == null || item.closingTank == null || !!item.consumptionIncomplete
    )));
  const status = isBreakdown ? "Breakdown" : review ? "Review‡" : "Billed";
  const values: Array<string | number> = [
    dateLabel(row.date),
    item?.projectSite || data.projectSite || "—",
    number(item?.openingMeter),
    number(item?.closingMeter),
    item?.workingHours == null ? "—" : formatHoursMinutes(item.workingHours),
    ...(tripColumn ? [number(rowTrips(row), 2)] : []),
    formatEquipmentTime(item?.startTime ?? undefined),
    formatEquipmentTime(item?.endTime ?? undefined),
    item?.clockDuration == null ? "—" : formatHoursMinutes(item.clockDuration),
    item?.openingTank == null ? "N/A" : `${number(item.openingTank)} L`,
    item?.closingTank == null ? "N/A" : `${number(item.closingTank)} L`,
    fuelIsContractorScope
      ? "Contractor scope"
      : item?.dieselIssued == null ? "N/A" : `${numberFixed(item.dieselIssued)} L`,
    fuelIsContractorScope || item?.openingTank == null || item?.closingTank == null || item?.consumptionIncomplete || item?.consumptionRate == null
      ? "" : `${number(item.consumptionRate, 2)} ${consumptionUnit}`,
    status,
  ];
  return { values, review };
}

function activityMonthTotalRow(
  month: BillingDailyRow[],
  monthName: string,
  headers: string[],
  tripColumn: boolean,
  fuelIsContractorScope: boolean,
  consumptionUnit: string,
) {
  const active = month.filter(row => !noActivityRecorded(row));
  const workingRows = active.filter(row => row.status !== "Breakdown");
  const totals = active.length
    ? buildEquipmentHirePeriodTotals(active, fuelIsContractorScope ? "vendor" : "hlc")
    : null;
  const hoursComplete = workingRows.length > 0 && workingRows.every(row =>
    row.performance?.workingHours != null && !row.performance.workingHoursIncomplete);
  const issuedComplete = workingRows.length > 0 && (fuelIsContractorScope || workingRows.every(row => row.performance?.dieselIssued != null));
  const consumptionComplete = workingRows.length > 0 && !fuelIsContractorScope && workingRows.every(row =>
    row.performance?.dieselConsumed != null &&
    row.performance.openingTank != null &&
    row.performance.closingTank != null &&
    !row.performance.consumptionIncomplete);
  const hourTotal = totals?.hours == null || !hoursComplete ? "—" : formatHoursMinutes(totals.hours);
  const issuedTotal = fuelIsContractorScope
    ? "Contractor scope"
    : !issuedComplete || totals?.dieselIssued == null ? "N/A" : `${numberFixed(totals.dieselIssued)} L`;
  const average = consumptionComplete && totals?.hours && totals.dieselConsumed != null
    ? `${number(totals.dieselConsumed / totals.hours, 2)} ${consumptionUnit}`
    : "";
  const values: string[] = Array(headers.length).fill("");
  values[0] = `${monthName} total`;
  values[4] = hourTotal;
  const first = tripColumn ? 6 : 5;
  if (tripColumn) values[5] = number(totals?.trips ?? 0, 2);
  values[first + 5] = issuedTotal;
  values[first + 6] = average;
  values[headers.length - 1] = "TOTAL";
  return values;
}

/**
 * Export only the daily activity calendar and its period totals.  The bill
 * summary deliberately lives only in exportEquipmentHireBill.
 */
export function exportEquipmentHireCalendar(data: EquipmentHireExportData, rows: BillingDailyRow[], exportFormat: "pdf" | "xlsx") {
  const fuelIsContractorScope = String(data.dieselResponsibility).toLowerCase() === "vendor";
  const totals = buildEquipmentHirePeriodTotals(rows, data.dieselResponsibility);
  // Excel is the internal audit copy: retain the full fuel/tank evidence columns
  // even when the vendor is responsible for diesel.
  const headers = dailyHeaders("hlc");
  const consumptionUnit = calendarConsumptionUnit(rows, data.meterType, data.consumptionRateUnit) || "L/hr";
  const safeName = (data.billNo || "equipment-hire-bill").replace(/[^\w-]+/g, "-");
  const metadata: Array<Array<string | number | null>> = [
    ["Equipment Hire Daily Activity"],
    ["Equipment", data.equipmentName],
    ...(data.projectSite ? [["Project / Site", data.projectSite]] : []),
    ["Bill period", `${dateLabel(data.periodFrom)} to ${dateLabel(data.periodTo)}`],
    ...(fuelIsContractorScope ? [["Fuel / Diesel", "Contractor Scope"]] : []),
  ];
  if (exportFormat === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const activitySheet = XLSX.utils.aoa_to_sheet([
      ...metadata,
      [],
      ...calendarTotalsRows(totals, fuelIsContractorScope),
      [],
      ...(fuelIsContractorScope ? [["Fuel / Diesel: Contractor Scope"]] : []),
      headers,
       ...rows.map(row => dailyValues(row, "hlc", data.consumptionNorm, consumptionUnit)),
    ]);
    activitySheet["!cols"] = headers.map((header, index) => ({ wch: index === headers.length - 1 ? 52 : Math.max(14, header.length + 2) }));
    XLSX.utils.book_append_sheet(workbook, activitySheet, "Daily Activity");
    XLSX.writeFile(workbook, `${safeName}-calendar.xlsx`);
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const isHourMeter = String(data.meterType || "").toLowerCase().includes("hour");
  const tripColumn = !isHourMeter && String(data.hireBasis).toLowerCase().includes("trip") &&
    rows.some(row => Number(rowTrips(row) || 0) > 0);
  const activityHeaders = [
    "Date", "Site", "Open meter", "Close meter", "Working hrs (h:min)",
    ...(tripColumn ? ["Trips"] : []),
    "Start time", "End time", "Clock duration", "Tank open", "Tank close",
    "Diesel issued", "Consumption (L/hr)", "Status",
  ];
  const rowsByMonth = new Map<string, BillingDailyRow[]>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    rowsByMonth.set(key, [...(rowsByMonth.get(key) || []), row]);
  }
  const isMonthly = String(data.hireBasis).toLowerCase().includes("monthly");
  const divisorValue = data.monthlyDivisorType === "30"
    ? 30
    : data.monthlyDivisorType === "custom" ? data.monthlyDivisor : null;
  const divisorLabel = data.monthlyDivisorType === "calendar"
    ? "Calendar days"
    : divisorValue ? `${divisorValue} days` : "Not recorded";
  const ratePerDay = isMonthly && divisorValue && divisorValue > 0
    ? pdfText(money(data.rate / divisorValue))
    : isMonthly ? "Varies by month" : "Not applicable";
  const detailLine = [
    `Vendor: ${data.vendorName || "Not recorded"}`,
    `Equipment: ${data.equipmentName} · Master ref: ${data.equipmentMasterReference ?? "Not recorded"}`,
    `Hire basis: ${data.hireBasis} · Rate: ${pdfText(money(data.rate))} · Rate/day: ${ratePerDay}`,
    `Monthly divisor: ${divisorLabel}`,
    `Site: ${data.projectSite || "Not recorded"} · Diesel norm: ${data.consumptionNorm == null ? "Not recorded" : `${number(data.consumptionNorm, 2)} ${data.consumptionRateUnit || ""}`}`,
  ].join(" · ");
  const header = {
    title: "ACTIVITY STATEMENT",
    companyName: data.companyName || "Highlane Constructions",
    billNo: data.billNo || "Not yet saved",
    billDate: data.billDate,
    periodFrom: data.periodFrom,
    periodTo: data.periodTo,
    status: data.billStatus || "Draft",
    detailLines: [detailLine],
  };
  const headerBottom = drawPdfBillHeader(doc, header);
  const drawHeader = () => { drawPdfBillHeader(doc, header); };
  let y = headerBottom + 4;
  let reviewSeen = false;
  const noActivityDays = rows.filter(noActivityRecorded).length;
  for (const [key, monthRows] of Array.from(rowsByMonth).sort(([a], [b]) => a.localeCompare(b))) {
    const title = monthTitle(`${key}-01`);
    if (y > doc.internal.pageSize.getHeight() - 55) {
      doc.addPage("a4", "landscape");
      y = drawPdfBillHeader(doc, header) + 4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(25, 25, 25);
    doc.text(title, 8, y);
    const active = monthRows.filter(row => !noActivityRecorded(row));
    const tableRows = active.map(row => {
      const projected = activityStatementRow(row, data, tripColumn, fuelIsContractorScope, consumptionUnit);
      reviewSeen ||= projected.review;
      return projected.values.map(value => pdfText(String(value)));
    });
    tableRows.push(activityMonthTotalRow(active, title, activityHeaders, tripColumn, fuelIsContractorScope, consumptionUnit));
    autoTable(doc, {
      startY: y + 2,
      head: [activityHeaders.map(pdfText)],
      body: tableRows,
      ...INK_LIGHT_TABLE,
      styles: { ...INK_LIGHT_TABLE.styles, fontSize: 6.3, cellPadding: 1.3 },
      headStyles: { ...INK_LIGHT_TABLE.headStyles, fontSize: 6.4 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 32 },
        2: { cellWidth: 19, halign: "right" },
        3: { cellWidth: 19, halign: "right" },
        4: { cellWidth: 25, halign: "right" },
        ...(tripColumn ? { 5: { cellWidth: 11, halign: "right" as const } } : {}),
        [tripColumn ? 6 : 5]: { cellWidth: 17 },
        [tripColumn ? 7 : 6]: { cellWidth: 17 },
        [tripColumn ? 8 : 7]: { cellWidth: 22, halign: "right" },
        [tripColumn ? 9 : 8]: { cellWidth: 18, halign: "right" },
        [tripColumn ? 10 : 9]: { cellWidth: 18, halign: "right" },
        [tripColumn ? 11 : 10]: { cellWidth: 20, halign: "right" },
        [tripColumn ? 12 : 11]: { cellWidth: 27, halign: "right" },
        [tripColumn ? 13 : 12]: { cellWidth: 18 },
      },
      margin: { left: 7, right: 7, top: headerBottom + 2, bottom: 16 },
      showHead: "everyPage",
      didDrawPage: drawHeader,
      didParseCell: cell => {
        if (cell.section === "body" && cell.row.index === tableRows.length - 1) {
          cell.cell.styles.fontStyle = "bold";
          cell.cell.styles.lineColor = [65, 65, 65];
          cell.cell.styles.lineWidth = 0.5;
        }
      },
    });
    y = Number((doc as any).lastAutoTable?.finalY || y + 10) + 7;
  }

  if (reviewSeen) {
    if (y > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage("a4", "landscape");
      y = drawPdfBillHeader(doc, header) + 5;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(45, 45, 45);
    doc.text("‡ dip/meter incomplete — amount unaffected on monthly hire", 8, y);
    y += 5;
  }
  if (noActivityDays > 0) {
    if (y > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage("a4", "landscape");
      y = drawPdfBillHeader(doc, header) + 5;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(45, 45, 45);
    doc.text(`No activity recorded on ${noActivityDays} other day(s) in the period.`, 8, y);
    y += 6;
  }
  if (y > doc.internal.pageSize.getHeight() - 35) {
    doc.addPage("a4", "landscape");
    y = drawPdfBillHeader(doc, header) + 6;
  }
  const signatureWidth = (doc.internal.pageSize.getWidth() - 24) / 2;
  doc.setDrawColor(65, 65, 65);
  doc.setLineWidth(0.3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(45, 45, 45);
  doc.line(8, y + 15, 8 + signatureWidth, y + 15);
  doc.text("Prepared · HLC", 8, y + 20);
  doc.line(16 + signatureWidth, y + 15, doc.internal.pageSize.getWidth() - 8, y + 15);
  doc.text("Received · Vendor", 16 + signatureWidth, y + 20);

  const generatedAt = format(new Date(), "dd MMM yyyy HH:mm");
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    drawPdfBillFooter(doc, page, pages, generatedAt, data.billNo || "Not yet saved");
  }
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
  const frozenFinancials = snapshot.financials && typeof snapshot.financials === "object"
    ? snapshot.financials : null;
  const hasFrozenFinancials = !!frozenFinancials && Object.keys(frozenFinancials).length > 0;
  const hasCalculationSnapshot = Object.keys(snapshot).length > 0;
  const financials = hasFrozenFinancials
    ? {
      grossHire: savedNumber(frozenFinancials.grossHire) ?? grossHire,
      breakdownDeduction: savedNumber(frozenFinancials.breakdownDeduction) ?? breakdownDeduction,
      hsdRecovery: savedNumber(frozenFinancials.hsdRecovery) ?? hsdRecovery,
      otherDebit: savedNumber(frozenFinancials.otherDebit) ?? otherDebit,
      advanceAdjustment: savedNumber(frozenFinancials.advanceAdjustment) ?? advanceAdjustment,
      otherCredit: savedNumber(frozenFinancials.otherCredit) ?? otherCredit,
        taxBase: savedNumber(frozenFinancials.taxBase) ?? savedNumber(snapshot.taxBase),
        taxableAmount: savedNumber(frozenFinancials.taxableAmount) ?? savedNumber(snapshot.taxableAmount),
        gstRate: savedNumber(frozenFinancials.gstRate) ?? savedNumber(snapshot.gstRate) ?? Number(bill.gstRateEquipment || 0),
        gstAmount: savedNumber(frozenFinancials.gstAmount) ?? savedNumber(snapshot.gstAmount),
        invoiceTotal: savedNumber(frozenFinancials.invoiceTotal) ?? savedNumber(snapshot.invoiceTotal),
        tdsRate: savedNumber(frozenFinancials.tdsRate) ?? savedNumber(snapshot.tdsRate) ?? Number(bill.tdsRate || 0),
        tdsAmount: savedNumber(frozenFinancials.tdsAmount) ?? savedNumber(snapshot.tdsAmount),
        netPayable: savedNumber(frozenFinancials.netPayable) ??
          savedNumber(snapshot.netPayable) ?? savedNumber(bill.netPayableAmount),
    }
    : hasCalculationSnapshot
      ? {
        grossHire,
        breakdownDeduction,
        hsdRecovery,
        otherDebit,
        advanceAdjustment,
        otherCredit,
        taxBase: savedNumber(snapshot.taxBase),
        taxableAmount: savedNumber(snapshot.taxableAmount ?? statement.taxableAmount),
        gstRate: savedNumber(snapshot.gstRate) ?? Number(bill.gstRateEquipment || 0),
        gstAmount: savedNumber(snapshot.gstAmount),
        invoiceTotal: savedNumber(snapshot.invoiceTotal),
        tdsRate: savedNumber(snapshot.tdsRate) ?? Number(bill.tdsRate || 0),
        tdsAmount: savedNumber(snapshot.tdsAmount),
        netPayable: savedNumber(snapshot.netPayable) ?? savedNumber(bill.netPayableAmount),
      }
      : calculateEquipmentHireFinancials({
      grossHire, breakdownDeduction, hsdRecovery, otherDebit, advanceAdjustment, otherCredit,
      gstRate: bill.gstRateEquipment, tdsRate: bill.tdsRate,
    });
  // Paid status and paidAt do not establish a cash/bank amount.
  const paid = bill.amountPaid != null && bill.amountPaid !== "" && Number.isFinite(Number(bill.amountPaid))
    ? Number(bill.amountPaid) : null;
  const data: EquipmentHireExportData = {
    hireReview: bill.hireReview || projectHireReview(statement, bill),
    billNo: bill.billNo, billDate: bill.billDate, billStatus: bill.status,
    companyName: bill.companyName,
    vendorName: bill.vendorName,
    equipmentName: statement.equipmentName || snapshot.equipmentName || (equipmentId ? `Equipment #${equipmentId}` : "Equipment"),
    equipmentMasterReference: snapshot.equipmentMasterReference ?? snapshot.equipment?.registrationNumber ?? equipmentId,
    equipmentType: statement.equipmentType || undefined, projectSite: snapshot.projectSite,
    periodFrom, periodTo, hireBasis: String(statement.billingBasis || snapshot.terms?.billingBasis || "Hire").toUpperCase(),
    rate: Number(statement.rate ?? snapshot.terms?.rate ?? 0),
    grossHire: financials.grossHire,
    breakdownDeduction: financials.breakdownDeduction,
    hsdRecovery: financials.hsdRecovery,
    otherDebit: financials.otherDebit,
    otherDebitReason: adjustments.otherDebitReason,
    hsdRecoveryReason: adjustments.hsdRecoveryReason,
    advanceAdjustment: financials.advanceAdjustment,
    advanceAdjustmentReason: adjustments.advanceAdjustmentReason,
    advanceAdjustmentDate: adjustments.advanceAdjustmentDate,
    otherCredit: financials.otherCredit, otherCreditReason: adjustments.otherCreditReason,
    gstRate: financials.gstRate, gstAmount: financials.gstAmount, taxableAmount: financials.taxableAmount,
    invoiceTotal: financials.invoiceTotal, tdsRate: financials.tdsRate, tdsAmount: financials.tdsAmount,
    taxBase: financials.taxBase,
    netPayable: hasFrozenFinancials || hasCalculationSnapshot
      ? financials.netPayable ?? savedNumber(bill.netPayableAmount)
      : savedNumber(bill.netPayableAmount) ?? financials.netPayable,
    paid,
    monthlyDivisorType: snapshot.terms?.monthlyDivisorType,
    monthlyDivisor: savedNumber(snapshot.terms?.monthlyDivisor),
    dieselResponsibility: snapshot.terms?.dieselResponsibility ?? statement.dieselResponsibility,
    consumptionNorm: snapshot.diesel?.consumptionNorm ?? snapshot.terms?.consumptionNorm,
    meterType: snapshot.terms?.meterType,
    consumptionRateUnit: snapshot.terms?.consumptionRateUnit ?? snapshot.dieselNormBasisOverride,
  };
  return { data, rows: buildSavedHireDailyRows(rows, snapshot, data), hasFrozenDailyRows };
}

/** Detail-page action set. Approved/saved bills always export the frozen daily
 * rows held in their calculation snapshot; current Equipment Performance data
 * must never rewrite a historical bill. */
export function EquipmentHireBillDetailOutput({ bill, output: suppliedOutput, showExports = true }: {
  bill: any;
  /** Reuse the page's already prepared display output for whole-bill capture. */
  output?: ReturnType<typeof buildSavedEquipmentHireBillOutput>;
  showExports?: boolean;
}) {
  const [showDaily, setShowDaily] = useState(false);
  const output = suppliedOutput === undefined ? buildSavedEquipmentHireBillOutput(bill) : suppliedOutput;
  if (!output) return null;
  const { data, rows, hasFrozenDailyRows } = output;
  const hasExportablePeriod = hasFrozenDailyRows && !!data.periodFrom && !!data.periodTo;
  return <div className="flex flex-wrap gap-2">
    {!hasFrozenDailyRows && <span className="self-center text-xs text-amber-700">Frozen daily activity is unavailable for this historical bill.</span>}
    <Button type="button" variant="outline" size="sm" disabled={!hasFrozenDailyRows} onClick={() => setShowDaily(true)} data-testid="button-detail-view-daily-activity">View Daily Activity</Button>
    {showExports && <EquipmentHireExportButtons data={data} rows={rows} disabled={!hasExportablePeriod} />}
    <EquipmentHireDailyActivity open={showDaily} onOpenChange={setShowDaily} rows={rows} dieselResponsibility={data.dieselResponsibility} consumptionNorm={data.consumptionNorm} meterType={data.meterType} consumptionRateUnit={data.consumptionRateUnit} />
  </div>;
}