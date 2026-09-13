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
export interface EquipmentFuelSummaryInput {
  openingTank?: number | null;
  dieselIssued?: number | null;
  closingTank?: number | null;
  expectedDiesel?: number | null;
}
export interface EquipmentFuelSummary {
  actualConsumed: number | null;
  expectedDiesel: number | null;
  variance: number | null;
  actualRate: number | null;
  actualRateUnit: "L/hr" | "L/km";
}

/**
 * Equipment rows are replace-written with a DPR.  This deliberately narrow
 * predicate is the one boundary between an untouched form placeholder and a
 * record that must survive.  In particular, it does not mistake the UI's
 * time-meter / Operating defaults, a zero diesel default, or an operator
 * prompt for an operating machine-day.
 *
 * Numeric readings use nullability rather than truthiness: an explicitly
 * recorded zero is evidence. Start/end times are always meaningful evidence;
 * creation surfaces must therefore leave start blank until equipment is
 * deliberately selected. Linked children are evidence even when a compact
 * editor did not include their fields in a later patch.
 */
export type MeaningfulEquipmentRow = {
  machine?: unknown;
  vehicleNo?: unknown;
  operator?: unknown;
  task?: unknown;
  equipmentId?: unknown;
  plantUsageId?: unknown;
  activityAllocations?: unknown;
  activitySegments?: unknown;
  breakdowns?: unknown;
  [key: string]: unknown;
};

const meaningfulText = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized !== "" && ![
    "operator", "operator name", "select operator", "not assigned",
    "n/a", "na", "-", "operating", "time meter", "time_meter",
  ].includes(normalized);
};

const explicitFiniteNumber = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const positiveIdentifier = (value: unknown): boolean =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const hasLinkedChildren = (value: unknown): boolean =>
  Array.isArray(value) ? value.length > 0 : false;

const defaultText = (value: unknown, accepted: string[]): boolean =>
  accepted.includes(String(value ?? "").trim().toLowerCase());

export function isMeaningfulEquipmentRow(row: MeaningfulEquipmentRow | null | undefined): boolean {
  if (!row) return false;
  if (positiveIdentifier(row.equipmentId) || positiveIdentifier(row.plantUsageId)) return true;
  // Server-only marker added while replacing a persisted row whose linked
  // children were omitted from a compact patch. It never reaches storage.
  if (row._preserveLinkedChildren === true) return true;
  if (hasLinkedChildren(row.activityAllocations) || hasLinkedChildren(row.activitySegments) || hasLinkedChildren(row.breakdowns)) return true;

  if (meaningfulText(row.machine) || meaningfulText(row.vehicleNo) || meaningfulText(row.operator) || meaningfulText(row.task)) return true;
  // `time_meter` is the blank-row default; an explicitly selected operational
  // outcome such as idle, breakdown, daily hire, or trip-based work is not.
  if (meaningfulText(row.entryType) || meaningfulText(row.status) || meaningfulText(row.activityStatus)) return true;
  if (meaningfulText(row.dieselSource) || meaningfulText(row.fuelStation) || meaningfulText(row.billNumber)
    || meaningfulText(row.structureId) || meaningfulText(row.remarks) || meaningfulText(row.notes)) return true;
  if (positiveIdentifier(row.boqItemId)) return true;

  // Meter and physical tank observations retain an explicit zero.  Derived
  // values (norm/expected/hours/KM) are intentionally excluded: old clients
  // could manufacture zeroes for them without the user recording an event.
  if ([
    row.openingReading, row.closingReading, row.openingDiesel,
    row.dieselBalanceInTank,
  ].some(explicitFiniteNumber)) return true;

  // Fuel issued is evidence only when non-zero; diesel: 0 is a legacy/UI
  // default and must not resurrect an empty placeholder.
  if (explicitFiniteNumber(row.diesel) && Number(row.diesel) !== 0) return true;
  if ([row.numberOfTrips, row.tripDistance, row.waterQuantity].some((value) =>
    explicitFiniteNumber(value) && Number(value) !== 0,
  )) return true;

  return meaningfulText(row.startTime) || meaningfulText(row.endTime);
}

/**
 * Read-side visibility is intentionally stricter than write-side retention.
 * Early SiteEntry versions auto-filled a start time on an otherwise untouched
 * default row.  Retaining that ambiguous history lets an editor correct it;
 * showing it as an Operating machine-day does not.  Only that narrow, known
 * auto-prefill shape is hidden. Any identity, child, reading/tank observation
 * (including zero), fuel/detail, non-default outcome, or non-zero usage value
 * remains visible.
 */
export function isVisibleEquipmentRow(row: MeaningfulEquipmentRow | null | undefined): boolean {
  if (!isMeaningfulEquipmentRow(row) || !row) return false;
  const noIdentity = !positiveIdentifier(row.equipmentId)
    && !positiveIdentifier(row.plantUsageId)
    && defaultText(row.machine, ["", "operating"])
    && defaultText(row.vehicleNo, [""]);
  const defaultOperator = defaultText(row.operator, [
    "", "operator", "operator name", "select operator", "not assigned", "n/a", "na", "-",
  ]);
  const defaultOutcome = defaultText(row.entryType, ["", "time meter", "time_meter"])
    && defaultText(row.status, ["", "operating"])
    && defaultText(row.activityStatus, ["", "operating"]);
  const noChildren = !hasLinkedChildren(row.activityAllocations)
    && !hasLinkedChildren(row.activitySegments)
    && !hasLinkedChildren(row.breakdowns);
  const noObservation = ![
    row.openingReading, row.closingReading, row.openingDiesel, row.dieselBalanceInTank,
  ].some(explicitFiniteNumber);
  const noFuelOrRuntime = ![
    row.diesel, row.numberOfTrips, row.tripDistance, row.waterQuantity,
    row.hoursWorked, row.totalKm, row.expectedDiesel,
  ].some((value) => explicitFiniteNumber(value) && Number(value) !== 0);
  const noOtherDetail = ![
    row.task, row.dieselSource, row.fuelStation, row.billNumber, row.amountPaid,
    row.structureId, row.boqItemId, row.remarks, row.notes,
  ].some((value) => {
    if (explicitFiniteNumber(value)) return Number(value) !== 0;
    return meaningfulText(value);
  });
  return !(noIdentity
    && defaultOperator
    && defaultOutcome
    && noChildren
    && noObservation
    && noFuelOrRuntime
    && noOtherDetail
    && !meaningfulText(row.endTime));
}

export function meaningfulEquipmentRows<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((row) => isMeaningfulEquipmentRow({ ...(row as object) }));
}

/** Read-side counterpart to meaningfulEquipmentRows. */
export function visibleEquipmentRows<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((row) => isVisibleEquipmentRow({ ...(row as object) }));
}
export const AVERAGE_SPEED_KMPH = 25;

export function calculateEquipmentClockDuration(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = start.split(":").map(Number), e = end.split(":").map(Number);
  if (s.length < 2 || e.length < 2 || s.some(Number.isNaN) || e.some(Number.isNaN)) return null;
  const minutes = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
  return minutes > 0 ? minutes / 60 : null;
}

/** Formats decimal hours for field users without changing the stored value. */
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

export function computeEquipmentUsage(equipment: EquipmentUsageEquipment | null | undefined, entry: EquipmentUsageEntry): EquipmentUsageResult {
  const meterType: MeterType = equipment?.meterType === "odometer" ? "odometer" : "hour_meter";
  const norm = equipment?.consumptionNorm ?? null;
  const explicitTrip = entry.entryType === "trip_based" || !!entry.tripBasedEntry;
  const meters = meterDiff(entry.openingReading, entry.closingReading);
  const time = calculateEquipmentClockDuration(entry.startTime, entry.endTime);
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

function finiteValue(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * One physical-fuel contract for Site DPR, Plant Usage and reports.
 * Diesel issued alone is not actual consumption: both tank readings are
 * required before the physical balance can be calculated.
 */
export function computeEquipmentFuelSummary(
  usage: Pick<EquipmentUsageResult, "runtime" | "expectedDiesel" | "efficiencyUnit">,
  input: EquipmentFuelSummaryInput,
): EquipmentFuelSummary {
  const openingTank = finiteValue(input.openingTank);
  const dieselIssued = finiteValue(input.dieselIssued);
  const closingTank = finiteValue(input.closingTank);
  const expectedDiesel = finiteValue(input.expectedDiesel) ?? finiteValue(usage.expectedDiesel);
  const actualConsumed = openingTank != null && dieselIssued != null && closingTank != null
    ? openingTank + dieselIssued - closingTank
    : null;
  return {
    actualConsumed,
    expectedDiesel,
    variance: actualConsumed != null && expectedDiesel != null ? actualConsumed - expectedDiesel : null,
    actualRate: actualConsumed != null && usage.runtime > 0 ? actualConsumed / usage.runtime : null,
    actualRateUnit: usage.efficiencyUnit,
  };
}

export function currentLocalEquipmentTime(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Creation-only convenience. Callers must not apply this during hydration. */
export function withEquipmentCreationStartTime<T extends { startTime?: string | null }>(
  row: T,
  now = new Date(),
): T {
  if (row.startTime) return row;
  return { ...row, startTime: currentLocalEquipmentTime(now) };
}

export function meterTypeLabel(meterType?: string | null): string {
  return meterType === "odometer" ? "Odometer (km)" : "Hour Meter (hrs)";
}