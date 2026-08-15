/**
 * Batch 06N — multiple planned activities in a Tomorrow Plan.
 *
 * Persistence model (backward compatible, NO schema change):
 *   site_requirements.plannedWork stays a single JSONB object. Legacy plans
 *   are `{ activity, boqItemId, chainageFrom, ... }`. Multi-activity plans
 *   add an `activities: [...]` array of the SAME per-activity shape, and the
 *   FIRST activity is always mirrored onto the top-level fields.
 *
 * Why mirror instead of switching to an array: every existing consumer
 * (06J outcome/carry comparison, requirement fulfilment context, arrangement
 * warnings, server routes reading plannedWork.boqItemId/programmeBarId)
 * dereferences object properties. Mirroring activity #1 keeps all of them
 * working unchanged while views/forms use getPlannedActivities() to see all.
 *
 * This module is the ONLY place that knows this dual shape. Never read
 * plannedWork.activities directly elsewhere.
 */

export interface PlannedWorkActivity {
  activity?: string | null;
  boqItemId?: number | null;
  programmeBarId?: number | null;
  side?: string | null;
  chainageFrom?: number | null;
  chainageTo?: number | null;
  /** Legacy free-text chainage on very old plans. */
  chainage?: string | null;
  pwLength?: number | null;
  pwWidth?: number | null;
  pwThickness?: number | null;
  plannedQty?: number | string | null;
  plannedUom?: string | null;
  remarks?: string | null;
  carryForwardNote?: string | null;
}

/** True when the activity carries any meaningful planned-work content. */
export function isMeaningfulActivity(a: PlannedWorkActivity | null | undefined): boolean {
  if (!a || typeof a !== "object") return false;
  return Boolean(
    (a.activity && String(a.activity).trim() !== "") ||
    a.boqItemId != null ||
    a.chainageFrom != null ||
    a.chainageTo != null ||
    (a.chainage && String(a.chainage).trim() !== "") ||
    (a.plannedQty != null && String(a.plannedQty).trim?.() !== "" && a.plannedQty !== "") ||
    (a.remarks && String(a.remarks).trim() !== ""),
  );
}

/**
 * Canonical reader: returns ALL planned activities of a plan, in entry order.
 * - New shape: the `activities` array (already ordered).
 * - Legacy shape: the object itself as a single-element array when it has content.
 * - Empty/null plannedWork: [].
 */
export function getPlannedActivities(plannedWork: any): PlannedWorkActivity[] {
  if (!plannedWork || typeof plannedWork !== "object") return [];
  if (Array.isArray(plannedWork.activities)) {
    const list = plannedWork.activities.filter(isMeaningfulActivity);
    if (list.length > 0) return list;
  }
  return isMeaningfulActivity(plannedWork) ? [plannedWork] : [];
}

/**
 * Canonical writer: builds the persisted plannedWork value from activity rows.
 * Drops empty rows; returns null when nothing meaningful was entered.
 * Single activity → plain legacy object (keeps old plans and new
 * single-activity plans byte-compatible). Multiple → first mirrored on top
 * plus the full `activities` array.
 */
export function buildPlannedWork(activities: PlannedWorkActivity[] | null | undefined): any | null {
  const list = (activities ?? []).filter(isMeaningfulActivity);
  if (list.length === 0) return null;
  if (list.length === 1) {
    const only = { ...list[0] };
    delete (only as any).activities; // never nest
    return only;
  }
  const first = { ...list[0] };
  delete (first as any).activities;
  return { ...first, activities: list.map((a) => { const c = { ...a }; delete (c as any).activities; return c; }) };
}

/**
 * 06J carry-forward: returns a NEW plannedWork with the carry quantity and
 * note applied to the top-level mirror AND (when the activities array is
 * present) to activities[0], keeping the mirror invariant intact. Activities
 * 2+ are copied unchanged. Never mutates the input.
 */
export function applyCarryToPlannedWork(plannedWork: any, carryQty: number, note: string): any {
  if (!plannedWork || typeof plannedWork !== "object") return plannedWork;
  const next: any = { ...plannedWork, plannedQty: carryQty, carryForwardNote: note };
  if (Array.isArray(next.activities) && next.activities.length > 0) {
    next.activities = next.activities.map((a: any, i: number) =>
      i === 0 ? { ...a, plannedQty: carryQty, carryForwardNote: note } : { ...a });
  }
  return next;
}
