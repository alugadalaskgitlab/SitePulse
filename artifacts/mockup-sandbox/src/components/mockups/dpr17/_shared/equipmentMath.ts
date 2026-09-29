// Isolated pure calculation seam copied from shared/equipmentUsage.ts.
// No client imports, services, or requests are used in this mockup.
export type Equipment = { meterType?: string | null; consumptionNorm?: number | null };
export type Entry = { entryType?: string | null; openingReading?: number | null; closingReading?: number | null; startTime?: string | null; endTime?: string | null; numberOfTrips?: number | null; tripDistance?: number | null };
export const AVERAGE_SPEED_KMPH = 25;
export function calculateEquipmentClockDuration(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = start.split(":").map(Number), e = end.split(":").map(Number);
  if (s.length < 2 || e.length < 2 || s.some(Number.isNaN) || e.some(Number.isNaN)) return null;
  const minutes = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
  return minutes > 0 ? minutes / 60 : null;
}
export function formatEquipmentDuration(hours?: number | null): string {
  if (hours == null || !Number.isFinite(Number(hours)) || Number(hours) < 0) return "—";
  const totalMinutes = Math.round(Number(hours) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes} min`;
  if (minutes === 0) return `${wholeHours} h`;
  return `${wholeHours} h ${String(minutes).padStart(2, "0")} min`;
}
export function formatEquipmentTime(value?: string | null): string {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "—";
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}
function meterDiff(opening?: number | null, closing?: number | null): number | null {
  if (opening == null || closing == null) return null;
  const diff = closing - opening; return diff >= 0 ? diff : null;
}
function tripKm(trips?: number | null, distance?: number | null): number | null {
  if (!trips || !distance) return null;
  const km = trips * distance * 2; return km > 0 ? km : null;
}
export function computeEquipmentUsage(equipment: Equipment | null | undefined, entry: Entry) {
  const meterType = equipment?.meterType === "odometer" ? "odometer" : "hour_meter";
  const norm = equipment?.consumptionNorm ?? null;
  const explicitTrip = entry.entryType === "trip_based";
  const meters = meterDiff(entry.openingReading, entry.closingReading);
  const time = calculateEquipmentClockDuration(entry.startTime, entry.endTime);
  const trips = tripKm(entry.numberOfTrips, entry.tripDistance);
  const build = (basis: string, hoursWorked: number | null, totalKm: number | null, runtime: number, appliedNorm: number | null, unit: "L/hr" | "L/km", warning: string | null) => ({
    meterType, basis, hoursWorked, totalKm, runtime,
    expectedDiesel: appliedNorm != null && runtime > 0 ? runtime * appliedNorm : null,
    efficiencyUnit: unit, warning,
  });
  if (explicitTrip) {
    if (meterType === "hour_meter" && meters != null) return build("hour_meter", meters, null, meters, norm, "L/hr", null);
    if (meterType === "odometer" && meters != null) return build("odometer", null, meters, meters, norm, "L/km", null);
    if (trips != null) return build("trip_based", null, trips, trips, meterType === "hour_meter" ? (norm != null ? norm / AVERAGE_SPEED_KMPH : null) : norm, "L/km", null);
    if (time != null) return meterType === "hour_meter"
      ? build("time_fallback", time, null, time, norm, "L/hr", "Trips / one-way distance not entered — using start/end time.")
      : build("time_fallback", null, time * AVERAGE_SPEED_KMPH, time * AVERAGE_SPEED_KMPH, norm, "L/km", `Trips / one-way distance not entered — using time fallback (assumed ${AVERAGE_SPEED_KMPH} km/hr).`);
    return build("none", null, null, 0, null, "L/km", "No trip reading, trips, or start/end time entered.");
  }
  if (meterType === "hour_meter") {
    if (meters != null) return build("hour_meter", meters, null, meters, norm, "L/hr", null);
    if (time != null) return build("time_fallback", time, null, time, norm, "L/hr", "Hour meter not entered — using start/end time.");
    return build("none", null, null, 0, null, "L/hr", "No hour meter reading or start/end time entered.");
  }
  if (meters != null) return build("odometer", null, meters, meters, norm, "L/km", null);
  if (trips != null) return build("trip_based", null, trips, trips, norm, "L/km", "Odometer not entered — using trips x one-way distance.");
  if (time != null) return build("time_fallback", null, time * AVERAGE_SPEED_KMPH, time * AVERAGE_SPEED_KMPH, norm, "L/km", `KM not entered — using time fallback (assumed ${AVERAGE_SPEED_KMPH} km/hr).`);
  return build("none", null, null, 0, null, "L/km", "No odometer reading, trips, or start/end time entered.");
}
export function resolveEquipmentConsumptionNormRate(equipment: Equipment | null | undefined, usage: { efficiencyUnit: "L/hr" | "L/km" }) {
  const norm = equipment?.consumptionNorm;
  if (norm == null || !Number.isFinite(Number(norm))) return { value: null, unit: usage.efficiencyUnit };
  const tripNorm = usage.efficiencyUnit === "L/km" && equipment?.meterType !== "odometer" ? Number(norm) / AVERAGE_SPEED_KMPH : Number(norm);
  return { value: tripNorm, unit: usage.efficiencyUnit };
}
export function computeEquipmentFuelSummary(usage: { runtime: number; expectedDiesel: number | null; efficiencyUnit: "L/hr" | "L/km" }, input: { openingTank?: number | null; dieselIssued?: number | null; closingTank?: number | null; expectedDiesel?: number | null }) {
  const finite = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const openingTank = finite(input.openingTank), dieselIssued = finite(input.dieselIssued), closingTank = finite(input.closingTank);
  const expectedDiesel = finite(input.expectedDiesel) ?? finite(usage.expectedDiesel);
  const actualConsumed = openingTank != null && dieselIssued != null && closingTank != null ? openingTank + dieselIssued - closingTank : null;
  return { actualConsumed, expectedDiesel, variance: actualConsumed != null && expectedDiesel != null ? actualConsumed - expectedDiesel : null,
    actualRate: actualConsumed != null && usage.runtime > 0 ? actualConsumed / usage.runtime : null, actualRateUnit: usage.efficiencyUnit };
}
// Isolated from shared/equipmentActivityAllocations.ts.
export function calculateEquipmentAllocationHours(startTime: string, endTime: string): number | null {
  const pattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!pattern.test(startTime) || !pattern.test(endTime)) return null;
  const [sh, sm] = startTime.split(":").map(Number), [eh, em] = endTime.split(":").map(Number);
  const minutes = eh * 60 + em - sh * 60 - sm;
  return minutes > 0 ? Math.round((minutes / 60) * 1_000_000) / 1_000_000 : null;
}
export function resolveEquipmentAllocationParentDuration(row: { startTime?: string | null; endTime?: string | null }) {
  const hours = row.startTime && row.endTime ? calculateEquipmentAllocationHours(row.startTime, row.endTime) : null;
  return { hours, basis: hours == null ? "none" : "clock_duration" };
}