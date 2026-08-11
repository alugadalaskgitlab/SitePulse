/**
 * shared/guidedEquipment.ts — Batch 04 save-fidelity fix for Guided DPR
 * equipment rows.
 *
 * The Guided screen edits only four fields (machine / vehicleNo / operator /
 * task) but a draft loaded from the server may carry many more (times,
 * readings, diesel, trips, links…). Previously the Guided payload builder
 * hard-coded every other field to ""/null, silently WIPING values entered in
 * the Detailed editor or prefilled from the plant module.
 *
 * Rule: whatever the Guided UI does not edit must round-trip untouched.
 *  - splitGuidedEquipmentRow(dbRow)  → { edited 4 fields, passthrough rest }
 *  - buildGuidedEquipmentPayload(row) → passthrough spread first, then the
 *    edited fields on top. New rows have an empty passthrough, so no fake
 *    ""/null values are fabricated for fields the user never saw.
 */

export type GuidedEquipmentRow = {
  machine: string;
  vehicleNo: string;
  operator: string;
  task: string;
  /** every other equipment field, preserved verbatim for round-trip */
  passthrough: Record<string, unknown>;
};

const EDITED_FIELDS = ["machine", "vehicleNo", "operator", "task"] as const;
/** never echo row identity back into a create/update payload */
const STRIPPED_FIELDS = new Set(["id", "dprId"]);

export function splitGuidedEquipmentRow(dbRow: Record<string, unknown> | null | undefined): GuidedEquipmentRow {
  const row = dbRow ?? {};
  const passthrough: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if ((EDITED_FIELDS as readonly string[]).includes(k) || STRIPPED_FIELDS.has(k)) continue;
    passthrough[k] = v;
  }
  return {
    machine: typeof row.machine === "string" ? row.machine : "",
    vehicleNo: typeof row.vehicleNo === "string" ? row.vehicleNo : "",
    operator: typeof row.operator === "string" ? row.operator : "",
    task: typeof row.task === "string" ? row.task : "",
    passthrough,
  };
}

export function newGuidedEquipmentRow(): GuidedEquipmentRow {
  return { machine: "", vehicleNo: "", operator: "", task: "", passthrough: {} };
}

export function buildGuidedEquipmentPayload(row: GuidedEquipmentRow): Record<string, unknown> {
  return {
    ...row.passthrough,
    machine: row.machine,
    vehicleNo: row.vehicleNo,
    operator: row.operator,
    task: row.task,
  };
}

/* ------------------------------------------------------------------ *
 * Batch 06C-Q — shared equipment calculation semantics.
 * These mirror the Detailed DPR rules exactly; both screens must call
 * these instead of re-implementing the arithmetic.
 * ------------------------------------------------------------------ */

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Total Diesel across DPR equipment rows — same semantics as Detailed's sum. */
export function computeTotalDiesel(rows: Array<{ diesel?: unknown } | Record<string, unknown>>): number {
  return (rows ?? []).reduce((sum, r) => sum + num((r as Record<string, unknown>)?.diesel), 0);
}

/** Trip-based round-trip kilometres: trips × one-way distance × 2 (Detailed rule). */
export function computeTripTotalKm(numberOfTrips: unknown, tripDistance: unknown): number {
  const trips = num(numberOfTrips);
  const dist = num(tripDistance);
  return trips > 0 && dist > 0 ? trips * dist * 2 : 0;
}

/** Water-tanker detection — the existing Detailed name rule. */
export function isWaterTankerName(machine: unknown): boolean {
  const m = String(machine ?? "").toUpperCase();
  return m.includes("WATER") || m.includes("TANKER");
}
