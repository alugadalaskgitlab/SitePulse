/**
 * Returns whether a DPR payload contains a real BOQ-item reference.
 *
 * This intentionally inspects the DPR's operational child rows rather than
 * the header's boqProjectId.  A project can be selected on a no-site-work
 * report even though no row in that report is actually linked to a BOQ item.
 *
 * Equipment has two historical assignment representations:
 *  - the legacy single-row boqItemId / activityAllocations shape;
 *  - normalized activitySegments with nested boqItems.
 *
 * Keep all of those paths here so project-mismatch guards cannot be bypassed
 * by changing representation or by relying on a UI-specific payload shape.
 */

function isRealBoqItemId(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;
  return Number.isInteger(numeric) && numeric > 0;
}

function rowHasBoqItemId(row: unknown): boolean {
  return !!row && typeof row === "object" && isRealBoqItemId((row as any).boqItemId);
}

function equipmentRowHasBoqReference(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const equipment = row as any;

  // Legacy single-activity equipment assignment.
  if (rowHasBoqItemId(equipment)) return true;

  // Legacy normalized allocation rows.
  if (
    Array.isArray(equipment.activityAllocations) &&
    equipment.activityAllocations.some(rowHasBoqItemId)
  ) {
    return true;
  }

  // Normalized physical segments can each be attributed to one or more BOQ
  // items.  Check the segment itself too for compatibility with older
  // read-side objects that carried the item directly on the segment.
  if (
    Array.isArray(equipment.activitySegments) &&
    equipment.activitySegments.some((segment: unknown) =>
      rowHasBoqItemId(segment) ||
      (!!segment &&
        typeof segment === "object" &&
        Array.isArray((segment as any).boqItems) &&
        (segment as any).boqItems.some(rowHasBoqItemId)),
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Check all known BOQ-link-bearing DPR sections.
 *
 * The route parses the request before calling this helper, so unknown fields
 * have already been removed by the request schema.  The explicit section
 * list mirrors persisted BOQ-link-bearing rows and also makes this helper safe
 * to use with stored DPR detail objects. Site purchases are intentionally
 * excluded because that table has no boq_item_id column.
 */
export function hasDprBoqReferences(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const dpr = payload as any;

  const rowSections = [
    dpr.progress,
    dpr.structureItems,
    dpr.labour,
    dpr.materials,
  ];
  if (rowSections.some((rows) => Array.isArray(rows) && rows.some(rowHasBoqItemId))) {
    return true;
  }

  return Array.isArray(dpr.equipment) && dpr.equipment.some(equipmentRowHasBoqReference);
}

/**
 * Replacement writes intentionally preserve an existing equipment row's
 * activity children when that row is addressed by persistedId and the caller
 * omits both child arrays.  Check only that retention path; ordinary progress,
 * labour, material, and structure children are wholesale replaced and should
 * be judged from the parsed replacement payload instead.
 */
export function hasPreservedDprBoqReferences(
  storedDpr: unknown,
  replacementPayload: unknown,
): boolean {
  if (!storedDpr || typeof storedDpr !== "object") return false;
  if (!replacementPayload || typeof replacementPayload !== "object") return false;

  const storedEquipment = Array.isArray((storedDpr as any).equipment)
    ? (storedDpr as any).equipment
    : [];
  const replacementEquipment = Array.isArray((replacementPayload as any).equipment)
    ? (replacementPayload as any).equipment
    : [];
  if (!storedEquipment.length || !replacementEquipment.length) return false;

  const storedById = new Map<number, unknown>();
  for (const row of storedEquipment) {
    const id = Number((row as any)?.id);
    if (Number.isInteger(id) && id > 0) storedById.set(id, row);
  }

  return replacementEquipment.some((row: any) => {
    const persistedId = Number(row?.persistedId);
    if (!Number.isInteger(persistedId) || persistedId <= 0) return false;
    const stored = storedById.get(persistedId);
    if (!stored) return false;

    // An explicit [] means "clear" and therefore does not retain the stored
    // assignment.  Omission means storage's preserve helper will reattach it.
    if (Array.isArray(row.activitySegments) || Array.isArray(row.activityAllocations)) {
      return false;
    }
    return equipmentRowHasBoqReference(stored);
  });
}
