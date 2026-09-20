import type { HireActivityDay } from "@shared/hireBilling";

export interface HireActivityBreakdownCalendarProps {
  days: readonly HireActivityDay[];
  consumptionNorm?: number | null;
  normBasis?: string | null;
  meterType?: string | null;
  tripApplicable: boolean;
  showFuel: boolean;
  formatDate: (date: string) => string;
}

type ConsumptionUnit = "L/Hr" | "L/Km" | "Km/L";

export function resolveConsumptionUnit(
  normBasis?: string | null,
  meterType?: string | null,
): ConsumptionUnit | null {
  const basis = String(normBasis || "")
    .trim()
    .toLowerCase()
    .replace(/kilomet(?:er|re)s?/g, "km")
    .replace(/lit(?:er|re)s?/g, "l")
    .replace(/hours?|hrs?/g, "hr")
    .replace(/[_\s-]+/g, "")
    .replace(/per/g, "/");
  if (["km/l", "kpl"].includes(basis)) return "Km/L";
  if (["l/km", "lpkm"].includes(basis)) return "L/Km";
  if (["l/hr", "lph", "l/h"].includes(basis)) return "L/Hr";

  // Equipment Master stores the norm basis as meterType rather than a second
  // consumption-unit field: hour_meter => L/hr, odometer => L/km.
  const meter = String(meterType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (meter === "hour_meter") return "L/Hr";
  if (meter === "odometer") return "L/Km";
  return null;
}

export function formatConsumptionRate(
  actualDiesel: number,
  run: number,
  norm?: number | null,
  normBasis?: string | null,
  meterType?: string | null,
): string {
  if (!(Number(actualDiesel) > 0) || !(Number(run) > 0)) return "—";
  const unit = resolveConsumptionUnit(normBasis, meterType);
  if (!unit) return "—";
  const actual = unit === "Km/L" ? Number(run) / Number(actualDiesel) : Number(actualDiesel) / Number(run);
  const normValue = norm == null || !Number.isFinite(Number(norm)) ? null : Number(norm);
  return `${actual.toFixed(2)} ${unit}${normValue == null ? "" : ` (Norm: ${normValue.toFixed(2)})`}`;
}

function formatReadings(day: HireActivityDay) {
  const openings = [...day.openingReadings];
  const closings = [...day.closingReadings];
  if (!openings.length && !closings.length) return { value: "—", conflict: false };
  const conflict = openings.length > 1 || closings.length > 1;
  if (!conflict && openings.length === 1 && closings.length === 1) {
    return { value: `${openings[0]} → ${closings[0]}`, conflict: false };
  }
  return {
    value: `Open: ${openings.length ? openings.join(", ") : "—"} → Close: ${closings.length ? closings.join(", ") : "—"}`,
    conflict,
  };
}

function statusLabel(activity: HireActivityDay["activity"]) {
  if (activity === "breakdown") return "Breakdown";
  if (activity === "no_activity") return "No Activity — Still Billable";
  return "Worked";
}

function siteAndWork(day: HireActivityDay) {
  const site = day.siteLocations.join(", ");
  const work = day.activityDescriptions.join(", ");
  return site && work ? `${site} — ${work}` : site || work || "—";
}

function recordCount(day: HireActivityDay) {
  const label = `${day.activityCount} record${day.activityCount === 1 ? "" : "s"}`;
  if (day.activityCount <= 1 || (!day.openActivityCount && day.billableActivityCount === day.activityCount)) return label;
  return `${label} (${day.billableActivityCount} billable, ${day.openActivityCount} open)`;
}

export default function HireActivityBreakdownCalendar({
  days,
  consumptionNorm,
  normBasis,
  meterType,
  tripApplicable,
  showFuel,
  formatDate,
}: HireActivityBreakdownCalendarProps) {
  return (
    <div className="mt-2 max-h-96 overflow-auto rounded border" data-testid="hire-activity-calendar">
      <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="p-2 font-semibold">Date</th>
            <th className="p-2 font-semibold">Reading (Opening → Closing)</th>
            <th className="p-2 font-semibold">Hours / Km Run</th>
            <th className="p-2 font-semibold">Trips</th>
            {showFuel && <th className="p-2 font-semibold">Diesel Issued (Actual)</th>}
            {showFuel && <th className="p-2 font-semibold">Consumption Rate</th>}
            {showFuel && <th className="p-2 font-semibold">Excess / Under</th>}
            <th className="p-2 font-semibold">Downtime (Breakdown)</th>
            <th className="p-2 font-semibold">Status</th>
            <th className="p-2 font-semibold">Site / Work Done</th>
            <th className="p-2 font-semibold">Records</th>
          </tr>
        </thead>
        <tbody>
          {days.map(day => {
            const reading = formatReadings(day);
            return (
              <tr key={day.date} className="border-t align-top" data-testid={`hire-activity-day-${day.date}`}>
                <td className="whitespace-nowrap p-2 font-semibold">{formatDate(day.date)}</td>
                <td className="p-2">
                  <span>{reading.value}</span>
                  {reading.conflict && <span className="mt-1 block font-semibold text-amber-700" role="alert">Multiple conflicting readings — review records</span>}
                </td>
                <td className="p-2">{day.hours > 0 ? day.hours.toFixed(2) : "—"}</td>
                <td className="p-2">{tripApplicable ? day.trips.toFixed(2) : <span title="Not applicable to this equipment">N/A</span>}</td>
                {showFuel && <td className="p-2">{day.actualDiesel > 0 ? `${day.actualDiesel.toFixed(2)} L` : "—"}</td>}
                {showFuel && <td className="whitespace-nowrap p-2">{formatConsumptionRate(day.actualDiesel, day.hours, consumptionNorm, normBasis, meterType)}</td>}
                {showFuel && <td className="whitespace-nowrap p-2">{day.expectedDieselAvailable ? `${day.dieselVariance >= 0 ? "+" : "−"}${Math.abs(day.dieselVariance).toFixed(2)} L` : "Tank Readings N/A"}</td>}
                <td className="p-2">{day.activity === "breakdown" && day.downtimeHours > 0 ? `${day.downtimeHours.toFixed(2)} h` : "—"}</td>
                <td className="p-2 font-medium">{statusLabel(day.activity)}</td>
                <td className="p-2">{siteAndWork(day)}</td>
                <td className="p-2">{recordCount(day)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}