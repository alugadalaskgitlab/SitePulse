/**
 * shared/dprPlantLink.ts — Batch 05: Guided DPR reuse of the EXISTING
 * Detailed-DPR ↔ Equipment & Fleet linking mechanism.
 *
 * The mechanism itself is unchanged (Detailed DPR "Batch 6" behaviour):
 *  - `equipment_usage` rows with status='open' for a date are discoverable via
 *    GET /api/plant-module/equipment-usage/open-today;
 *  - a DPR equipment row carries `plantUsageId` referencing that usage;
 *  - the opening reading imported from the usage is locked;
 *  - on Final Submit the server closes the usage (`closePlantUsage` →
 *    status='closed', closedByDprId, closure audit fields).
 *
 * This module only holds the pure helpers Guided DPR needs to present the
 * same mechanism: which open usages are not yet linked, how a usage becomes a
 * Guided equipment row, and the duplicate-entry advisory (spec §14: advisory,
 * never a hard block, no fuzzy merging).
 */

import { newGuidedEquipmentRow, type GuidedEquipmentRow } from "./guidedEquipment";

export type OpenUsageLike = {
  id: number;
  equipmentId: number;
  entryType?: string | null;
  openingReading?: number | null;
  closingReading?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  numberOfTrips?: number | null;
  tripDistance?: number | null;
  totalKm?: number | null;
  diesel?: number | null;
  dieselIssued?: number | null;
  dieselSource?: string | null;
  dieselIncluded?: boolean | null;
  fuelStation?: string | null;
  billNumber?: string | null;
  amountPaid?: number | null;
  operator?: string | null;
  task?: string | null;
  siteName?: string | null;
  /** Optional Site → Site successor context returned by open-today. */
  handoffFromSite?: string | null;
  handoffAt?: string | null;
  inheritedOpeningReading?: number | null;
};

/**
 * A successor usage is still an ordinary open usage (and is linked by its
 * exact usage id).  Keep its optional handoff facts display-only: they help
 * the engineer understand why an opening was inherited without inventing a
 * second DPR or movement client-side.
 */
export function openUsageHandoffContext(usage: OpenUsageLike): string | null {
  const from = usage.handoffFromSite?.trim();
  const at = usage.handoffAt?.trim();
  const inherited = usage.inheritedOpeningReading;
  if (!from && !at && inherited == null) return null;
  const parts = [
    from ? `Handoff from ${from}` : "Inherited handoff",
    at ? at : null,
    inherited != null ? `Opening ${inherited}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export type EquipmentRowLike = {
  machine?: string;
  vehicleNo?: string;
  equipmentId?: unknown;
  plantUsageId?: unknown;
  passthrough?: Record<string, unknown>;
};

type RowLike = EquipmentRowLike;

function validPositiveId(value: unknown): number | null {
  const id = Number(value);
  return value != null && Number.isInteger(id) && id > 0 ? id : null;
}

function rowUsageId(row: RowLike): number | null {
  return validPositiveId(row?.plantUsageId ?? row?.passthrough?.["plantUsageId"]);
}

function rowEquipmentId(row: RowLike): number | null {
  return validPositiveId(row?.equipmentId ?? row?.passthrough?.["equipmentId"]);
}

function normaliseRegistration(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** plantUsageIds already linked into the given equipment rows */
export function linkedUsageIds(rows: RowLike[]): Set<number> {
  const ids = new Set<number>();
  for (const r of rows ?? []) {
    const id = rowUsageId(r);
    if (id != null) ids.add(id);
  }
  return ids;
}

/** open usages not yet linked into any equipment row */
export function unlinkedOpenUsages<T extends OpenUsageLike>(usages: T[], rows: RowLike[]): T[] {
  const linked = linkedUsageIds(rows);
  return (usages ?? []).filter((u) => !linked.has(u.id));
}

function linkedUsagePassthrough(usage: OpenUsageLike): Record<string, unknown> {
  const pt: Record<string, unknown> = {
    equipmentId: usage.equipmentId,
    plantUsageId: usage.id,
  };
  const copy: Array<keyof OpenUsageLike> = [
    "entryType", "openingReading", "closingReading", "startTime", "endTime",
    "numberOfTrips", "tripDistance", "totalKm", "dieselSource",
    "fuelStation", "billNumber", "amountPaid",
  ];
  for (const k of copy) {
    const v = usage[k];
    if (v != null && v !== "") pt[k as string] = v;
  }
  const diesel = usage.diesel ?? usage.dieselIssued;
  if (diesel != null) pt.diesel = diesel;
  if (!pt.dieselSource && usage.dieselIncluded) pt.dieselSource = "contractor";
  return pt;
}

export type DprEquipmentUsageRow = {
  machine: string;
  vehicleNo: string;
  operator: string;
  task: string;
  entryType: string;
  startTime: string;
  endTime: string;
  openingReading: number | null;
  closingReading: number | null;
  diesel: number | null;
  equipmentId: number;
  plantUsageId: number;
  dieselSource: string | null;
  fuelStation: string;
  billNumber: string;
  amountPaid: number | null;
  numberOfTrips: number | null;
  tripDistance: number | null;
  totalKm: number | null;
  waterQuantity: number | null;
};

/** Convert the shared open-usage shape into a Detailed/Edit DPR equipment row. */
export function usageToDprEquipmentRow(
  usage: OpenUsageLike,
  equipment?: { name?: string | null; registrationNumber?: string | null },
): DprEquipmentUsageRow {
  const pt = linkedUsagePassthrough(usage);
  return {
    machine: equipment?.name || `Equipment #${usage.equipmentId}`,
    vehicleNo: equipment?.registrationNumber ?? "",
    operator: usage.operator ?? "",
    task: usage.task ?? "",
    entryType: String(pt.entryType ?? "time_meter"),
    startTime: String(pt.startTime ?? ""),
    endTime: String(pt.endTime ?? ""),
    openingReading: pt.openingReading != null ? Number(pt.openingReading) : null,
    closingReading: pt.closingReading != null ? Number(pt.closingReading) : null,
    diesel: pt.diesel != null ? Number(pt.diesel) : null,
    equipmentId: usage.equipmentId,
    plantUsageId: usage.id,
    dieselSource: pt.dieselSource != null ? String(pt.dieselSource) : null,
    fuelStation: String(pt.fuelStation ?? ""),
    billNumber: String(pt.billNumber ?? ""),
    amountPaid: pt.amountPaid != null ? Number(pt.amountPaid) : null,
    numberOfTrips: pt.numberOfTrips != null ? Number(pt.numberOfTrips) : null,
    tripDistance: pt.tripDistance != null ? Number(pt.tripDistance) : null,
    totalKm: pt.totalKm != null ? Number(pt.totalKm) : null,
    waterQuantity: null,
  };
}

export type OpenUsageRowMatch =
  | { kind: "already_linked"; rowIndex: number }
  | { kind: "adopt"; rowIndex: number; matchedBy: "equipment_id" | "registration" }
  | { kind: "ambiguous"; rowIndexes: number[]; matchedBy: "equipment_id" | "registration" }
  | { kind: "add" };

/**
 * Resolve a pending dispatch against DPR equipment rows without fuzzy names.
 * Canonical equipmentId wins. Registration is only a fallback for legacy rows
 * that do not carry an equipmentId; conflicting IDs are never overridden.
 */
export function resolveOpenUsageRowMatch(
  usage: OpenUsageLike,
  rows: EquipmentRowLike[],
  equipment?: { registrationNumber?: string | null },
): OpenUsageRowMatch {
  const alreadyLinkedIndex = (rows ?? []).findIndex((row) => rowUsageId(row) === usage.id);
  if (alreadyLinkedIndex >= 0) return { kind: "already_linked", rowIndex: alreadyLinkedIndex };

  const available = (rows ?? [])
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => rowUsageId(row) == null);
  const idMatches = available
    .filter(({ row }) => rowEquipmentId(row) === usage.equipmentId)
    .map(({ rowIndex }) => rowIndex);
  if (idMatches.length === 1) {
    return { kind: "adopt", rowIndex: idMatches[0], matchedBy: "equipment_id" };
  }
  if (idMatches.length > 1) {
    return { kind: "ambiguous", rowIndexes: idMatches, matchedBy: "equipment_id" };
  }

  const registration = normaliseRegistration(equipment?.registrationNumber);
  if (!registration) return { kind: "add" };
  const registrationMatches = available
    .filter(({ row }) => rowEquipmentId(row) == null)
    .filter(({ row }) => normaliseRegistration(row.vehicleNo) === registration)
    .map(({ rowIndex }) => rowIndex);
  if (registrationMatches.length === 1) {
    return { kind: "adopt", rowIndex: registrationMatches[0], matchedBy: "registration" };
  }
  if (registrationMatches.length > 1) {
    return { kind: "ambiguous", rowIndexes: registrationMatches, matchedBy: "registration" };
  }
  return { kind: "add" };
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Link dispatch facts into one existing DPR row. Opening-side dispatch facts
 * are authoritative when present. Existing DPR-side completion facts (closing
 * reading/time, task/operator, trips and water) are preserved.
 */
export function adoptOpenUsageIntoDprRow<T extends EquipmentRowLike>(
  existing: T,
  usage: OpenUsageLike,
  equipment?: { name?: string | null; registrationNumber?: string | null },
): T & DprEquipmentUsageRow {
  const dispatch = usageToDprEquipmentRow(usage, equipment);
  const usageDiesel = usage.diesel ?? usage.dieselIssued;
  const hasDispatchSource = hasText(usage.dieselSource) || usage.dieselIncluded === true;
  return {
    ...dispatch,
    ...existing,
    machine: hasText(existing.machine) ? String(existing.machine) : dispatch.machine,
    vehicleNo: hasText(existing.vehicleNo) ? String(existing.vehicleNo) : dispatch.vehicleNo,
    operator: hasText((existing as any).operator) ? String((existing as any).operator) : dispatch.operator,
    task: hasText((existing as any).task) ? String((existing as any).task) : dispatch.task,
    entryType: hasText(usage.entryType)
      ? dispatch.entryType
      : (hasText((existing as any).entryType) ? String((existing as any).entryType) : dispatch.entryType),
    startTime: hasText(usage.startTime)
      ? dispatch.startTime
      : (hasText((existing as any).startTime) ? String((existing as any).startTime) : ""),
    endTime: hasText((existing as any).endTime)
      ? String((existing as any).endTime)
      : dispatch.endTime,
    openingReading: usage.openingReading != null
      ? dispatch.openingReading
      : ((existing as any).openingReading ?? null),
    closingReading: (existing as any).closingReading ?? dispatch.closingReading,
    diesel: usageDiesel != null ? dispatch.diesel : ((existing as any).diesel ?? null),
    equipmentId: usage.equipmentId,
    plantUsageId: usage.id,
    dieselSource: hasDispatchSource
      ? dispatch.dieselSource
      : (hasText((existing as any).dieselSource) ? String((existing as any).dieselSource) : dispatch.dieselSource),
    fuelStation: hasText(usage.fuelStation)
      ? dispatch.fuelStation
      : (hasText((existing as any).fuelStation) ? String((existing as any).fuelStation) : ""),
    billNumber: hasText(usage.billNumber)
      ? dispatch.billNumber
      : (hasText((existing as any).billNumber) ? String((existing as any).billNumber) : ""),
    amountPaid: usage.amountPaid != null ? dispatch.amountPaid : ((existing as any).amountPaid ?? null),
    numberOfTrips: (existing as any).numberOfTrips ?? dispatch.numberOfTrips,
    tripDistance: (existing as any).tripDistance ?? dispatch.tripDistance,
    totalKm: (existing as any).totalKm ?? dispatch.totalKm,
    waterQuantity: (existing as any).waterQuantity ?? dispatch.waterQuantity,
  };
}

/** Linked dispatches already own their diesel issue/purchase ledger effects. */
export function shouldCreateDprEquipmentDieselLedger(row: {
  diesel?: number | null;
  dieselSource?: string | null;
  plantUsageId?: unknown;
}): boolean {
  const source = row.dieselSource;
  return rowUsageId(row) == null
    && Number(row.diesel ?? 0) > 0
    && (source === "direct_purchase" || source === "plant_stock");
}

/**
 * Convert an open usage into a Guided equipment row ("Use in this DPR").
 * Only fields the usage actually carries are copied — nothing is fabricated
 * (Batch 04 passthrough contract).
 */
export function usageToGuidedRow(usage: OpenUsageLike, machineName: string): GuidedEquipmentRow {
  const row = newGuidedEquipmentRow();
  row.machine = machineName || `Equipment #${usage.equipmentId}`;
  row.operator = usage.operator ?? "";
  row.task = usage.task ?? "";
  row.passthrough = linkedUsagePassthrough(usage);
  return row;
}

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

/**
 * Advisory (never blocking) when a manually-typed machine matches an open
 * usage that is NOT linked to this row: the engineer is probably about to
 * double-enter the same run. Returns null when the row is already linked or
 * no confident name match exists.
 */
export function duplicateUsageAdvisory(
  row: RowLike,
  usages: OpenUsageLike[],
  nameOf: (equipmentId: number) => string | undefined,
): string | null {
  if (!row?.machine || !norm(row.machine)) return null;
  if (row.plantUsageId != null || row.passthrough?.["plantUsageId"] != null) return null; // already linked
  const m = norm(row.machine);
  const match = (usages ?? []).find((u) => norm(nameOf(u.equipmentId)) === m && norm(nameOf(u.equipmentId)) !== "");
  if (!match) return null;
  return "Usage for this equipment is already recorded in Equipment & Fleet today — use \u201cUse in this DPR\u201d above to link it instead of entering it twice.";
}
