/**
 * Guided DPR entry geometry/quantity behaviour (pure — unit-tested).
 *
 * Rules (pre-deployment Guided DPR correction):
 *  - Items whose BOQ UOM implies geometry (CUM = L×W×T, SQM = L×W, RMT = L)
 *    auto-calculate Quantity the moment every required dimension is present
 *    and valid; the source becomes "calculated" implicitly (resolved by
 *    shared/dprGeometry.resolveQuantitySource — never guessed from UOM).
 *  - Count/weight items (MT, Nos, LS…) never auto-calculate — direct entry.
 *  - A manual edit that differs from the geometry value marks the entry
 *    OVERRIDDEN. Later geometry edits must NOT silently replace an overridden
 *    quantity — the caller shows a mismatch flag instead.
 *  - Restoring the quantity to the calculated value clears the override.
 */
import {
  geometryQtyForRow,
  quantitiesMatch,
  resolveBoqUomProfile,
  type GeometryRowInput,
} from "@shared/dprGeometry";

export type GeomEntry = {
  chainageFrom: string;
  chainageTo: string;
  width: number | null;
  thickness: number | null;
  quantity: number | null;
  qtyOverridden: boolean;
};

export type GeomItem = { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined;

/** Which geometry inputs this item's UOM needs (empty = direct/manual qty). */
export function requiredDims(item: GeomItem): ("L" | "W" | "T")[] {
  return resolveBoqUomProfile(item ?? null).dims;
}

/** True when quantity for this item is derived from geometry at all. */
export function geometryApplies(item: GeomItem): boolean {
  return requiredDims(item).length > 0;
}

function rowInput(e: GeomEntry): GeometryRowInput {
  return {
    length: null,
    chainageFrom: e.chainageFrom,
    chainageTo: e.chainageTo,
    width: e.width,
    thickness: e.thickness,
    quantity: e.quantity,
  };
}

/** The geometry-computed quantity for the entry, or null when incomplete/not applicable. */
export function computedQty(e: GeomEntry, item: GeomItem): number | null {
  return geometryQtyForRow(rowInput(e), item ?? null);
}

/**
 * Apply a geometry-field change (chainage/width/thickness) and return the
 * quantity fields that should change with it.
 *
 * - not overridden + geometry item → quantity follows the computed value
 *   (including back to blank when a required dimension goes missing — we
 *   never leave a stale "calculated" number behind, and never guess).
 * - overridden → quantity is preserved untouched (caller flags the mismatch).
 * - non-geometry item → quantity untouched.
 */
export function applyGeometryChange(
  after: GeomEntry,
  item: GeomItem,
): Pick<GeomEntry, "quantity" | "qtyOverridden"> {
  if (!geometryApplies(item) || after.qtyOverridden) {
    return { quantity: after.quantity, qtyOverridden: after.qtyOverridden };
  }
  return { quantity: computedQty(after, item), qtyOverridden: false };
}

/**
 * Apply a manual Quantity edit. Marks the entry overridden when the value
 * differs from the geometry computation; restores automatic mode when the
 * user returns exactly (within tolerance) to the calculated value.
 */
export function applyQuantityEdit(
  after: GeomEntry,
  item: GeomItem,
): Pick<GeomEntry, "quantity" | "qtyOverridden"> {
  if (!geometryApplies(item)) return { quantity: after.quantity, qtyOverridden: false };
  const calc = computedQty(after, item);
  if (after.quantity == null) {
    // Cleared — go back to automatic (will refill on next geometry change).
    return { quantity: calc, qtyOverridden: false };
  }
  const overridden = !(calc != null && quantitiesMatch(after.quantity, calc));
  return { quantity: after.quantity, qtyOverridden: overridden };
}

/**
 * True when an overridden quantity no longer matches what the current
 * geometry computes — the UI must flag this rather than silently recalculate.
 */
export function overrideMismatch(e: GeomEntry, item: GeomItem): number | null {
  if (!e.qtyOverridden || e.quantity == null) return null;
  const calc = computedQty(e, item);
  if (calc == null) return null;
  return quantitiesMatch(e.quantity, calc) ? null : calc;
}

/** Derive the override flag when hydrating an entry from a saved draft. */
export function deriveOverridden(e: Omit<GeomEntry, "qtyOverridden">, item: GeomItem): boolean {
  if (!geometryApplies(item) || e.quantity == null) return false;
  const calc = computedQty({ ...e, qtyOverridden: false }, item);
  return !(calc != null && quantitiesMatch(e.quantity, calc));
}
