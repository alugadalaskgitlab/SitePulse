import { format } from "date-fns";
import { formatEquipmentTime } from "@shared/equipmentUsage";
import type { BillingDailyRow } from "./EquipmentHireBillOutput";

const finiteNumber = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

const formatNumber = (value: unknown, decimals = 2) => {
  const number = finiteNumber(value);
  return number == null ? "—" : number.toLocaleString("en-IN", { maximumFractionDigits: decimals });
};

const formatHoursMinutes = (value: unknown, incomplete = false) => {
  const hours = finiteNumber(value);
  if (hours == null) return "—";
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const sign = hours < 0 ? "−" : "";
  const formatted = `${sign}${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
  return incomplete ? `Partial · ${formatted}` : formatted;
};

const formatDate = (value: string) => {
  try {
    return format(new Date(`${value}T00:00:00`), "dd MMM yyyy");
  } catch {
    return value;
  }
};

function tripsForRow(row: BillingDailyRow): number | null {
  const savedTrips = finiteNumber((row as BillingDailyRow & { trips?: number | null }).trips);
  if (savedTrips != null) return savedTrips;

  const performance = row.performance as (BillingDailyRow["performance"] & {
    trips?: number | null;
    numberOfTrips?: number | null;
  }) | undefined;
  const directTrips = finiteNumber(performance?.trips ?? performance?.numberOfTrips);
  if (directTrips != null) return directTrips;

  const eventTrips = (performance?.events || [])
    .map(event => {
      const tripEvent = event as typeof event & { trips?: number | null; numberOfTrips?: number | null };
      return finiteNumber(tripEvent.trips ?? tripEvent.numberOfTrips);
    })
    .filter((value): value is number => value != null);
  return eventTrips.length ? eventTrips.reduce((sum, value) => sum + value, 0) : null;
}

function dailyConsumptionRate(row: BillingDailyRow): { rate: number; hours: number } | null {
  const performance = row.performance;
  const opening = finiteNumber(performance?.openingTank);
  const closing = finiteNumber(performance?.closingTank);
  const hours = finiteNumber(performance?.workingHours);
  if (
    opening == null || closing == null || hours == null || hours <= 0 ||
    opening < 0 || closing < 0 ||
    performance?.workingHoursIncomplete ||
    performance?.consumptionIncomplete !== false
  ) return null;

  const consumedFromTank = opening - closing;
  if (consumedFromTank < 0) return null;
  return { rate: consumedFromTank / hours, hours };
}

function tankReading(value: unknown) {
  const reading = finiteNumber(value);
  return reading == null ? "N/A" : `${reading.toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
}

export function SavedHireActivityTable({
  rows,
  isTripBased,
}: {
  rows: BillingDailyRow[];
  isTripBased: boolean;
}) {
  const tripValues = rows.map(tripsForRow);
  const showTrips = isTripBased && tripValues.some(value => value != null);
  const knownHours = rows.map(row => finiteNumber(row.performance?.workingHours)).filter((value): value is number => value != null);
  const knownIssued = rows.map(row => finiteNumber(row.performance?.dieselIssued)).filter((value): value is number => value != null);
  const totalHours = knownHours.length ? knownHours.reduce((sum, value) => sum + value, 0) : null;
  const totalDieselIssued = knownIssued.length ? knownIssued.reduce((sum, value) => sum + value, 0) : null;
  const rateRows = rows.map(dailyConsumptionRate).filter(
    (value): value is { rate: number; hours: number } => value != null,
  );
  const rateHours = rateRows.reduce((sum, row) => sum + row.hours, 0);
  const averageRate = rateHours > 0
    ? rateRows.reduce((sum, row) => sum + row.rate * row.hours, 0) / rateHours
    : null;
  const headers = [
    "Date", "Project/Site", "Open meter", "Close meter", "Working hrs (h:min)",
    ...(showTrips ? ["Trips"] : []),
    "Start time", "End time", "Clock duration", "Tank open", "Tank close",
    "Diesel issued", "Consumption rate", "Status",
  ];

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border bg-muted/30 px-3 py-2 text-xs" data-testid="saved-hire-activity-totals">
      <span><strong>Working hours:</strong> {formatHoursMinutes(totalHours)}</span>
      <span><strong>Diesel issued:</strong> {totalDieselIssued == null ? "—" : `${formatNumber(totalDieselIssued)} L`}</span>
      <span><strong>Average consumption rate:</strong> {averageRate == null ? "—" : `${formatNumber(averageRate)} L/hr`}</span>
      {showTrips && <span><strong>Trips:</strong> {formatNumber(tripValues.reduce<number>((sum, value) => sum + (value ?? 0), 0), 0)}</span>}
    </div>
    <div className="overflow-x-auto" role="region" aria-label="Saved equipment daily activity" tabIndex={0}>
      <table className="w-full min-w-[1500px] text-xs" data-testid="saved-hire-activity-table">
        <thead className="bg-muted text-[10px] uppercase tracking-wide">
          <tr>{headers.map(header => <th key={header} className="px-2 py-2 text-right first:text-left last:text-left">{header}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, rowIndex) => {
          const performance = row.performance;
          const rate = dailyConsumptionRate(row);
          const values: Array<string | number> = [
            formatDate(row.date),
            performance?.projectSite || "—",
            formatNumber(performance?.openingMeter),
            formatNumber(performance?.closingMeter),
            formatHoursMinutes(performance?.workingHours, performance?.workingHoursIncomplete),
            ...(showTrips ? [tripValues[rowIndex] == null ? "—" : formatNumber(tripValues[rowIndex], 0)] : []),
            formatEquipmentTime(performance?.startTime) || "—",
            formatEquipmentTime(performance?.endTime) || "—",
            formatHoursMinutes(performance?.clockDuration, performance?.clockDurationIncomplete),
            tankReading(performance?.openingTank),
            tankReading(performance?.closingTank),
            performance?.dieselIssued == null ? "—" : `${formatNumber(performance.dieselIssued)} L`,
            rate == null ? "" : `${formatNumber(rate.rate)} L/hr`,
            `${row.statusLabel || (row.status === "No Work" ? "Activity Not Recorded" : row.status)}${row.remarks ? ` — ${row.remarks}` : ""}`,
          ];
          return <tr key={`${row.date}-${rowIndex}`} className="border-b align-top">
            {values.map((value, index) => <td key={index} className={`px-2 py-2 tabular-nums ${index === 0 || index === 1 || index === values.length - 1 ? "text-left" : "text-right"}`}>{value}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
