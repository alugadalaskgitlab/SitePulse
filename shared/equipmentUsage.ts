// Canonical, pure runtime and fuel calculation for Equipment Usage and DPR
// equipment logs.  Keep this independent of database/UI concerns.
export type MeterType = "hour_meter" | "odometer";
export interface EquipmentUsageEquipment { meterType?: string | null; consumptionNorm?: number | null; }
export interface EquipmentUsageEntry {
  entryType?: string | null; tripBasedEntry?: boolean | null;
  openingReading?: number | null; closingReading?: number | null;
  startTime?: string | null; endTime?: string | null;
  numberOfTrips?: number | null; tripDistance?: number | null;
}
export type UsageBasis = "hour_meter" | "odometer" | "trip_based" | "time_fallback" | "none";
export interface EquipmentUsageResult {
  meterType: MeterType; basis: UsageBasis; hoursWorked: number | null;
  totalKm: number | null; runtime: number; expectedDiesel: number | null;
  efficiencyValue: number | null; efficiencyLabel: string | null;
  efficiencyUnit: "L/hr" | "L/km"; warning: string | null;
}
export const AVERAGE_SPEED_KMPH = 25;

function timeToHours(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = start.split(":").map(Number), e = end.split(":").map(Number);
  if (s.some(Number.isNaN) || e.some(Number.isNaN)) return null;
  const minutes = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
  return minutes > 0 ? minutes / 60 : null;
}
function meterDiff(opening?: number | null, closing?: number | null): number | null {
  if (opening == null || closing == null) return null;
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
  const time = timeToHours(entry.startTime, entry.endTime);
  const trips = tripKm(entry.numberOfTrips, entry.tripDistance);
  const build = (basis: UsageBasis, hoursWorked: number | null, totalKm: number | null, runtime: number, appliedNorm: number | null, unit: "L/hr" | "L/km", warning: string | null): EquipmentUsageResult => ({
    meterType, basis, hoursWorked, totalKm, runtime,
    expectedDiesel: appliedNorm != null && runtime > 0 ? runtime * appliedNorm : null,
    efficiencyValue: appliedNorm, efficiencyLabel: appliedNorm != null ? `${appliedNorm} ${unit}` : null,
    efficiencyUnit: unit, warning,
  });
  if (explicitTrip) {
    if (trips != null) return build("trip_based", null, trips, trips, meterType === "hour_meter" ? (norm != null ? norm / AVERAGE_SPEED_KMPH : null) : norm, "L/km", null);
    return build("none", null, null, 0, null, "L/km", "Trips / one-way distance not entered — cannot compute KM.");
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
export function meterTypeLabel(meterType?: string | null): string {
  return meterType === "odometer" ? "Odometer (km)" : "Hour Meter (hrs)";
}