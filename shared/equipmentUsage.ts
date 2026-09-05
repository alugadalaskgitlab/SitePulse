// Canonical, pure runtime and fuel calculation for Equipment Usage and DPR
// equipment logs.  Keep this independent of database/UI concerns.
export type MeterType = "hour_meter" | "odometer";
export interface EquipmentUsageEquipment { meterType?: string | null; consumptionNorm?: number | null; }
export interface EquipmentUsageEntry {
  entryType?: string | null; tripBasedEntry?: boolean | null;
  openingReading?: number | null; closingReading?: number | null;
  startTime?: string | null; endTime?: string | null;
  numberOfTrips?: number | null; tripDistance?: number | null;
  diesel?: number | null; openingDiesel?: number | null;
  dieselBalanceInTank?: number | null;
  breakdowns?: Array<{
    fromTime?: string | null; toTime?: string | null;
    startTime?: string | null; endTime?: string | null;
  }> | null;
}
export type UsageBasis = "hour_meter" | "odometer" | "trip_based" | "time_fallback" | "none";
export type ActualDieselBasis = "tank_derived" | "issued_only" | "none";
export interface EquipmentUsageResult {
  meterType: MeterType; basis: UsageBasis; hoursWorked: number | null;
  totalKm: number | null; runtime: number; expectedDiesel: number | null;
  downtimeHours: number;
  actualDiesel: number | null; actualDieselBasis: ActualDieselBasis;
  dieselVariance: number | null; discrepancy: number | null;
  efficiencyValue: number | null; efficiencyLabel: string | null;
  efficiencyUnit: "L/hr" | "L/km"; warning: string | null;
}
export const AVERAGE_SPEED_KMPH = 25;

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function timeRange(start?: string | null, end?: string | null): [number, number] | null {
  const from = timeToMinutes(start), to = timeToMinutes(end);
  return from != null && to != null && to > from ? [from, to] : null;
}
function breakdownDowntime(
  breakdowns: EquipmentUsageEntry["breakdowns"],
  workRange: [number, number] | null,
): number {
  if (!workRange) return 0;
  const intervals = (breakdowns ?? []).flatMap((row) => {
    const range = timeRange(row.fromTime ?? row.startTime, row.toTime ?? row.endTime);
    if (!range) return [];
    const from = Math.max(workRange[0], range[0]), to = Math.min(workRange[1], range[1]);
    return to > from ? [[from, to] as [number, number]] : [];
  }).sort((a, b) => a[0] - b[0]);
  let total = 0, currentFrom: number | null = null, currentTo = 0;
  for (const [from, to] of intervals) {
    if (currentFrom == null) {
      currentFrom = from; currentTo = to;
    } else if (from <= currentTo) {
      currentTo = Math.max(currentTo, to);
    } else {
      total += currentTo - currentFrom;
      currentFrom = from; currentTo = to;
    }
  }
  if (currentFrom != null) total += currentTo - currentFrom;
  return total / 60;
}
function meterDiff(opening?: number | null, closing?: number | null): number | null {
  if (opening == null || closing == null || !Number.isFinite(opening) || !Number.isFinite(closing)) return null;
  const diff = closing - opening; return diff >= 0 ? diff : null;
}
function tripKm(trips?: number | null, distance?: number | null): number | null {
  if (!trips || !distance) return null;
  const km = trips * distance * 2; return km > 0 ? km : null;
}

export function computeEquipmentUsage(equipment: EquipmentUsageEquipment | null | undefined, entry: EquipmentUsageEntry): EquipmentUsageResult {
  const meterType: MeterType = equipment?.meterType === "odometer" ? "odometer" : "hour_meter";
  const norm = equipment?.consumptionNorm ?? null;
  const explicitTrip = entry.entryType === "trip_based" || !!entry.tripBasedEntry;
  const meters = meterDiff(entry.openingReading, entry.closingReading);
  const workRange = timeRange(entry.startTime, entry.endTime);
  const hasAnyTime = !!entry.startTime || !!entry.endTime;
  const hasBothTimes = !!entry.startTime && !!entry.endTime;
  const timeWarning = hasBothTimes && !workRange
    ? "End time is invalid or must be later than start time — time usage was not used."
    : hasAnyTime && !hasBothTimes
      ? "Start/end time is incomplete — time usage was not used."
      : null;
  const elapsedTime = workRange ? (workRange[1] - workRange[0]) / 60 : null;
  const downtimeHours = breakdownDowntime(entry.breakdowns, workRange);
  const time = elapsedTime == null ? null : Math.max(0, elapsedTime - downtimeHours);
  const trips = tripKm(entry.numberOfTrips, entry.tripDistance);
  const hasBothMeters = entry.openingReading != null && entry.closingReading != null;
  const meterWarning = hasBothMeters && meters == null
    ? `Closing ${meterType === "odometer" ? "odometer" : "hour meter"} reading is invalid or lower than opening — meter usage was not used.`
    : (entry.openingReading != null || entry.closingReading != null) && !hasBothMeters
      ? `${meterType === "odometer" ? "Odometer" : "Hour meter"} reading is incomplete — meter usage was not used.`
      : null;
  const finiteNonnegative = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) && value >= 0 ? value : null;
  const issued = finiteNonnegative(entry.diesel);
  const openingTank = finiteNonnegative(entry.openingDiesel);
  const closingTank = finiteNonnegative(entry.dieselBalanceInTank);
  const rawTankActual = openingTank != null && closingTank != null
    ? openingTank + (issued ?? 0) - closingTank
    : null;
  const tankWarning = rawTankActual != null && rawTankActual < 0
    ? "Closing tank balance exceeds opening plus issued fuel — tank-derived consumption is invalid."
    : null;
  const tankActual = rawTankActual != null && rawTankActual >= 0 ? rawTankActual : null;
  const actualDiesel = tankActual ?? issued;
  const actualDieselBasis: ActualDieselBasis =
    tankActual != null ? "tank_derived" : issued != null ? "issued_only" : "none";
  const build = (basis: UsageBasis, hoursWorked: number | null, totalKm: number | null, runtime: number, appliedNorm: number | null, unit: "L/hr" | "L/km", warning: string | null): EquipmentUsageResult => ({
    meterType, basis, hoursWorked, totalKm, runtime, downtimeHours,
    expectedDiesel: appliedNorm != null && runtime > 0 ? runtime * appliedNorm : null,
    actualDiesel, actualDieselBasis,
    dieselVariance: actualDiesel != null && appliedNorm != null && runtime > 0 ? actualDiesel - runtime * appliedNorm : null,
    // Tank-vs-entered reconciliation is distinct from norm-vs-actual variance.
    // It answers whether the entered/refilled litres agree with physical tank
    // movement, while dieselVariance compares actual consumption with the norm.
    discrepancy: tankActual != null && issued != null ? tankActual - issued : null,
    efficiencyValue: appliedNorm, efficiencyLabel: appliedNorm != null ? `${appliedNorm} ${unit}` : null,
    efficiencyUnit: unit,
    warning: [warning, tankWarning].filter(Boolean).join(" ") || null,
  });
  if (explicitTrip) {
    if (trips != null) return build("trip_based", null, trips, trips, meterType === "hour_meter" ? (norm != null ? norm / AVERAGE_SPEED_KMPH : null) : norm, "L/km", null);
    return build("none", null, null, 0, null, "L/km", "Trips / one-way distance not entered — cannot compute KM.");
  }
  if (meterType === "hour_meter") {
    if (meters != null) return build("hour_meter", meters, null, meters, norm, "L/hr", null);
    if (time != null) return build("time_fallback", time, null, time, norm, "L/hr", meterWarning ?? "Hour meter not entered — using start/end time.");
    return build("none", null, null, 0, null, "L/hr", meterWarning ?? timeWarning ?? "No hour meter reading or start/end time entered.");
  }
  if (meters != null) return build("odometer", null, meters, meters, norm, "L/km", null);
  if (trips != null) return build("trip_based", null, trips, trips, norm, "L/km", meterWarning ?? "Odometer not entered — using trips x one-way distance.");
  if (time != null) return build("time_fallback", null, time * AVERAGE_SPEED_KMPH, time * AVERAGE_SPEED_KMPH, norm, "L/km", meterWarning ?? `KM not entered — using time fallback (assumed ${AVERAGE_SPEED_KMPH} km/hr).`);
  return build("none", null, null, 0, null, "L/km", meterWarning ?? timeWarning ?? "No odometer reading, trips, or start/end time entered.");
}
export function meterTypeLabel(meterType?: string | null): string {
  return meterType === "odometer" ? "Odometer (km)" : "Hour Meter (hrs)";
}