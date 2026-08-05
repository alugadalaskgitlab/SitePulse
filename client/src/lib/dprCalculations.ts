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

import { resolveBoqUomProfile, BoqUomProfile } from "./dprUom";
export type { BoqUomProfile };

// Chainage parsing, effective length, and the quantity formula moved to
// shared/dprGeometry.ts (server-side recompute needs them). Re-exported here
// so SiteEntry / SiteEdit / SiteRequirementNew keep their imports unchanged.
export {
  parseChainageToMeters,
  calculateLengthFromChainage,
  getEffectiveLength,
  calculateDprQuantity,
} from "@shared/dprGeometry";

/**
 * Return the resolved BOQ UOM profile for a BOQ item, or null when no item is linked.
 */
export function entryBoqProfile(
  boqItem: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
): BoqUomProfile | null {
  return boqItem ? resolveBoqUomProfile(boqItem) : null;
}
