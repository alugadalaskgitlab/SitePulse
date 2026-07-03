// Shared equipment usage/diesel calculation logic used by both the Site DPR
// equipment log and the Plant Equipment Usage entry screen. Branches on the
// equipment's meter type (hour_meter vs odometer) and the entry's own
// entry/trip mode, always falling back gracefully (meter -> trip -> time)
// while surfacing a visible warning whenever a fallback is used instead of
// silently guessing.

export type MeterType = "hour_meter" | "odometer";

export interface EquipmentUsageEquipment {
  meterType?: string | null;
  consumptionNorm?: number | null;
}

export interface EquipmentUsageEntry {
  entryType?: string | null;
  tripBasedEntry?: boolean | null;
  openingReading?: number | null;
  closingReading?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  numberOfTrips?: number | null;
  tripDistance?: number | null;
}

export type UsageBasis = "hour_meter" | "odometer" | "trip_based" | "time_fallback" | "none";

export interface EquipmentUsageResult {
  meterType: MeterType;
  basis: UsageBasis;
  hoursWorked: number | null;
  totalKm: number | null;
  // The quantity (hours or km) actually used for the diesel/efficiency math.
  runtime: number;
  expectedDiesel: number | null;
  efficiencyValue: number | null; // the norm actually applied, in efficiencyUnit
  efficiencyLabel: string | null;
  efficiencyUnit: "L/hr" | "L/km";
  warning: string | null;
}

// Typical heavy-vehicle running speed used to convert hour-based time entry
// into an estimated KM figure for odometer equipment (and vice versa for
// trip-based diesel norms expressed in L/hr).
export const AVERAGE_SPEED_KMPH = 25;

function timeToHours(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const sMatch = start.split(":").map(Number);
  const eMatch = end.split(":").map(Number);
  if (sMatch.some(Number.isNaN) || eMatch.some(Number.isNaN)) return null;
  const [sh, sm] = sMatch;
  const [eh, em] = eMatch;
  const diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
  return diffMinutes > 0 ? diffMinutes / 60 : null;
}

function meterDiff(opening?: number | null, closing?: number | null): number | null {
  if (opening == null || closing == null) return null;
  const diff = closing - opening;
  return diff >= 0 ? diff : null;
}

function tripKm(numberOfTrips?: number | null, tripDistance?: number | null): number | null {
  if (!numberOfTrips || !tripDistance) return null;
  const km = numberOfTrips * tripDistance * 2;
  return km > 0 ? km : null;
}

/**
 * Computes usage basis, hours/km worked, expected diesel and efficiency for
 * a single equipment usage entry, given the equipment's meter type.
 *   - Hour-meter equipment: closing - opening hour meter, falling back to
 *     end - start time. Diesel norm in L/hr.
 *   - KM/odometer equipment: closing - opening odometer, falling back to
 *     trips x one-way distance x 2, falling back to end - start time
 *     (converted at AVERAGE_SPEED_KMPH). Diesel norm in L/km.
 *   - Explicit trip-based entries (entryType === "trip_based" or
 *     tripBasedEntry) always use trips x distance x 2, regardless of meter
 *     type, converting an hour-based norm to L/km via AVERAGE_SPEED_KMPH.
 */
export function computeEquipmentUsage(
  equipment: EquipmentUsageEquipment | null | undefined,
  entry: EquipmentUsageEntry
): EquipmentUsageResult {
  const meterType: MeterType = equipment?.meterType === "odometer" ? "odometer" : "hour_meter";
  const norm = equipment?.consumptionNorm ?? null;
  const isExplicitTrip = entry.entryType === "trip_based" || !!entry.tripBasedEntry;

  const mDiff = meterDiff(entry.openingReading, entry.closingReading);
  const tHours = timeToHours(entry.startTime, entry.endTime);
  const tKm = tripKm(entry.numberOfTrips, entry.tripDistance);

  const efficiencyUnit: "L/hr" | "L/km" = meterType === "hour_meter" && !isExplicitTrip ? "L/hr" : "L/km";

  const build = (
    basis: UsageBasis,
    hoursWorked: number | null,
    totalKm: number | null,
    runtime: number,
    normPerUnit: number | null,
    unit: "L/hr" | "L/km",
    warning: string | null
  ): EquipmentUsageResult => {
    const expectedDiesel = normPerUnit != null && runtime > 0 ? runtime * normPerUnit : null;
    return {
      meterType,
      basis,
      hoursWorked,
      totalKm,
      runtime,
      expectedDiesel,
      efficiencyValue: normPerUnit,
      efficiencyLabel: normPerUnit != null ? `${normPerUnit} ${unit}` : null,
      efficiencyUnit: unit,
      warning,
    };
  };

  // Explicit trip-based entry: always drive off trips x distance, regardless
  // of the equipment's own meter type (used for water tankers, etc.).
  if (isExplicitTrip) {
    if (tKm != null) {
      const normPerKm = meterType === "hour_meter"
        ? (norm != null ? norm / AVERAGE_SPEED_KMPH : null)
        : norm;
      return build("trip_based", null, tKm, tKm, normPerKm, "L/km", null);
    }
    return build("none", null, null, 0, null, "L/km", "Trips / one-way distance not entered — cannot compute KM.");
  }

  if (meterType === "hour_meter") {
    if (mDiff != null) {
      return build("hour_meter", mDiff, null, mDiff, norm, "L/hr", null);
    }
    if (tHours != null) {
      return build("time_fallback", tHours, null, tHours, norm, "L/hr", "Hour meter not entered — using start/end time.");
    }
    return build("none", null, null, 0, null, "L/hr", "No hour meter reading or start/end time entered.");
  }

  // meterType === "odometer" (KM-based vehicles)
  if (mDiff != null) {
    return build("odometer", null, mDiff, mDiff, norm, "L/km", null);
  }
  if (tKm != null) {
    return build("trip_based", null, tKm, tKm, norm, "L/km", "Odometer not entered — using trips x one-way distance.");
  }
  if (tHours != null) {
    const estimatedKm = tHours * AVERAGE_SPEED_KMPH;
    return build("time_fallback", null, estimatedKm, estimatedKm, norm, "L/km", `KM not entered — using time fallback (assumed ${AVERAGE_SPEED_KMPH} km/hr).`);
  }
  return build("none", null, null, 0, null, "L/km", "No odometer reading, trips, or start/end time entered.");
}

export function meterTypeLabel(meterType?: string | null): string {
  return meterType === "odometer" ? "Odometer (km)" : "Hour Meter (hrs)";
}
