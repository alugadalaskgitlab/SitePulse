/** Canonical, side-effect-free rules for 06Y equipment movements. */
export type EquipmentDestinationType = "site" | "hmp" | "rmc";

export type ClosedUsageForMovement = {
  id: number;
  equipmentId: number;
  date: string;
  closingReading: number | null;
  status: string;
};

export type MovementRequest = {
  date: string;
  destinationType: EquipmentDestinationType;
  destinationLabel: string;
  shiftFrom?: string | null;
  shiftTo?: string | null;
  openedByUserId?: number | null;
  openedByUserName?: string | null;
  openedAt?: Date | null;
};

export class EquipmentMovementError extends Error {}

const MATERIALIZED_LOG_FIELDS = [
  "equipmentId",
  "machine",
  "operator",
  "vehicleNo",
  "entryType",
  "startTime",
  "endTime",
  "openingReading",
  "closingReading",
  "hoursWorked",
  "numberOfTrips",
  "tripDistance",
  "totalKm",
  "diesel",
  "dieselNorm",
  "expectedDiesel",
  "task",
  "dieselSource",
  "fuelStation",
  "billNumber",
  "amountPaid",
] as const;

const NUMERIC_LOG_FIELDS = new Set([
  "equipmentId",
  "openingReading",
  "closingReading",
  "hoursWorked",
  "numberOfTrips",
  "tripDistance",
  "totalKm",
  "diesel",
  "dieselNorm",
  "expectedDiesel",
  "amountPaid",
]);

function comparableLogValue(field: string, value: unknown): unknown {
  if (field === "entryType" && (value == null || value === "")) return "TIME_METER";
  if (field === "dieselSource" && (value == null || value === "")) return "PLANT_STOCK";
  if (value == null || value === "") return null;
  if (NUMERIC_LOG_FIELDS.has(field)) return Number(value);
  return String(value).trim().toUpperCase();
}

/** A moved physical segment cannot be altered or removed by DPR versioning. */
export function materializedEquipmentLogChanged(
  original: Record<string, unknown>,
  edited: Record<string, unknown> | undefined,
): boolean {
  if (!edited) return true;
  return MATERIALIZED_LOG_FIELDS.some(
    (field) => comparableLogValue(field, original[field]) !== comparableLogValue(field, edited[field]),
  );
}

/** Validates continuity and returns only the fields permitted on a successor. */
export function buildMovementSuccessor(source: ClosedUsageForMovement, move: MovementRequest) {
  if (source.status !== "closed") throw new EquipmentMovementError("Source equipment usage must be closed");
  if (source.closingReading == null) throw new EquipmentMovementError("Source equipment usage requires a closing reading");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(move.date) || move.date < source.date) {
    throw new EquipmentMovementError("Movement date cannot be before the source usage date");
  }
  if (!move.destinationLabel.trim()) throw new EquipmentMovementError("A canonical destination is required");
  const plantName = move.destinationType === "hmp"
    ? "HMP PLANT"
    : move.destinationType === "rmc"
      ? "RMC PLANT"
      : "SITE";
  return {
    date: move.date,
    equipmentId: source.equipmentId,
    openingReading: source.closingReading,
    closingReading: null,
    endTime: null,
    status: "open" as const,
    destinationType: move.destinationType,
    destinationSite: move.destinationLabel,
    siteName: move.destinationLabel,
    plantName,
    sourceUsageId: source.id,
    shiftFrom: move.shiftFrom ?? null,
    shiftTo: move.shiftTo ?? move.destinationLabel,
    openedByUserId: move.openedByUserId ?? null,
    openedByUserName: move.openedByUserName ?? null,
    openedAt: move.openedAt ?? null,
    // This is the pending destination work segment, not a separate transport
    // charge row. Movement itself has no fuel effect; destination completion
    // may later add actual usage through the guarded close path.
    entryType: "time_meter",
    dieselIssued: 0,
    openingDiesel: 0,
    expectedDiesel: 0,
    closingDiesel: 0,
    variance: 0,
  };
}