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
  dieselSource?: string | null;
  operator?: string | null;
  task?: string | null;
  siteName?: string | null;
};

type RowLike = { machine?: string; passthrough?: Record<string, unknown> };

/** plantUsageIds already linked into the given equipment rows */
export function linkedUsageIds(rows: RowLike[]): Set<number> {
  const ids = new Set<number>();
  for (const r of rows ?? []) {
    const v = r?.passthrough?.["plantUsageId"];
    const n = Number(v);
    if (v != null && Number.isInteger(n) && n > 0) ids.add(n);
  }
  return ids;
}

/** open usages not yet linked into any equipment row */
export function unlinkedOpenUsages<T extends OpenUsageLike>(usages: T[], rows: RowLike[]): T[] {
  const linked = linkedUsageIds(rows);
  return (usages ?? []).filter((u) => !linked.has(u.id));
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
  const pt: Record<string, unknown> = { equipmentId: usage.equipmentId, plantUsageId: usage.id };
  const copy: Array<keyof OpenUsageLike> = [
    "entryType", "openingReading", "closingReading", "startTime", "endTime",
    "numberOfTrips", "tripDistance", "totalKm", "diesel", "dieselSource",
  ];
  for (const k of copy) {
    const v = usage[k];
    if (v != null && v !== "") pt[k as string] = v;
  }
  row.passthrough = pt;
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
  if (row.passthrough?.["plantUsageId"] != null) return null; // already linked
  const m = norm(row.machine);
  const match = (usages ?? []).find((u) => norm(nameOf(u.equipmentId)) === m && norm(nameOf(u.equipmentId)) !== "");
  if (!match) return null;
  return "Usage for this equipment is already recorded in Equipment & Fleet today — use \u201cUse in this DPR\u201d above to link it instead of entering it twice.";
}
