/**
 * dprCalculations.ts
 *
 * Pure calculation functions shared between the DPR entry form (SiteEntry.tsx)
 * and Tomorrow's Plan form (SiteRequirementNew.tsx).
 *
 * Both forms import and call these functions directly, so the same chainage,
 * width, thickness, and BOQ item always produce identical length and quantity
 * values in both places. There is no separate reimplementation in either form.
 */

import { resolveBoqUomProfile, computeDprQty, BoqUomProfile } from "./dprUom";
export type { BoqUomProfile };

/**
 * Parse a chainage string to metres.
 *
 * Supports two formats:
 *   "km+m"    e.g. "5+600"  → 5600 m
 *   decimal km e.g. "5.600" → 5600 m
 *
 * Returns null when the string is empty or unparseable.
 */
export function parseChainageToMeters(chainage: string): number | null {
  if (!chainage) return null;
  const match = chainage.match(/^(\d+)\+(\d+)$/);
  if (match) {
    return parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
  }
  const num = parseFloat(chainage);
  return isNaN(num) ? null : num * 1000;
}

/**
 * Calculate the distance in metres between two chainage values.
 * Accepts both "km+m" (e.g. "5+600") and decimal-km (e.g. "5.600") formats.
 * Returns null when either value cannot be parsed.
 */
export function calculateLengthFromChainage(from: string, to: string): number | null {
  const fromM = parseChainageToMeters(from);
  const toM = parseChainageToMeters(to);
  if (fromM !== null && toM !== null) return Math.abs(toM - fromM);
  return null;
}

/**
 * Effective length used for DPR / Tomorrow's Plan quantity calculations.
 * A manually-entered length takes priority; falls back to deriving from chainage.
 */
export function getEffectiveLength(
  manualLength: number | null | undefined,
  chainageFrom: string,
  chainageTo: string,
): number | null {
  if (manualLength != null && manualLength > 0) return manualLength;
  return calculateLengthFromChainage(chainageFrom, chainageTo);
}

/**
 * Return the resolved BOQ UOM profile for a BOQ item, or null when no item is linked.
 * null → no item selected; both W and T fields shown; quantity is manual.
 */
export function entryBoqProfile(
  boqItem: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
): BoqUomProfile | null {
  return boqItem ? resolveBoqUomProfile(boqItem) : null;
}

/**
 * Single source of truth for DPR / Tomorrow's Plan quantity calculation.
 *
 * When a BOQ item is provided, the item's measurement profile (dprMeasurementMethod
 * or unit-derived) determines the formula:
 *   volume  (CUM) → L × W × T
 *   area    (SQM) → L × W
 *   length  (RMT) → L
 *   count/weight/lump-sum → null (manual quantity required)
 *
 * When no BOQ item is provided, quantity is derived purely from whichever
 * dimensions are present (L→RMT, L+W→SQM, L+W+T→CUM).
 *
 * Returns null when there are not enough dimensions for the formula, or when
 * the item requires a manually-entered quantity.
 */
export function calculateDprQuantity(
  length: number | null | undefined,
  width: number | null | undefined,
  thickness: number | null | undefined,
  boqItem: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
): number | null {
  if (boqItem) {
    const prof = resolveBoqUomProfile(boqItem);
    if (prof.dimClass === "volume")
      return length && width && thickness ? length * width * thickness : null;
    if (prof.dimClass === "area")
      return length && width ? length * width : null;
    if (prof.dimClass === "length")
      return length ?? null;
    return null; // count / weight / lump-sum → manual
  }
  // No BOQ item: derive from raw dimensions (L→RMT, L+W→SQM, L+W+T→CUM)
  return computeDprQty(length, width, thickness);
}
