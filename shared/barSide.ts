// ─── Instruction 030A: Programme-bar side vocabulary + compatibility ─────────
// Single shared source of truth for side values, display labels, and the
// planned-side ↔ DPR-side compatibility matrix (used by client AND server —
// never rely on UI-only validation).

export const BAR_SIDES = [
  "full_width",
  "lhs",
  "rhs",
  "both_sides",
  "median",
  "shoulder_lhs",
  "shoulder_rhs",
  "service_road_lhs",
  "service_road_rhs",
  "other",
] as const;

export type BarSide = (typeof BAR_SIDES)[number];

export const BAR_SIDE_LABELS: Record<BarSide, string> = {
  full_width: "Full Width",
  lhs: "LHS",
  rhs: "RHS",
  both_sides: "Both Sides",
  median: "Median",
  shoulder_lhs: "LHS Shoulder",
  shoulder_rhs: "RHS Shoulder",
  service_road_lhs: "LHS Service Road",
  service_road_rhs: "RHS Service Road",
  other: "Other",
};

export function isBarSide(v: unknown): v is BarSide {
  return typeof v === "string" && (BAR_SIDES as readonly string[]).includes(v);
}

/** Label for display; null/undefined → "Unspecified" (Side Review Required). */
export function barSideLabel(side: string | null | undefined): string {
  if (!side) return "Unspecified";
  return isBarSide(side) ? BAR_SIDE_LABELS[side] : side;
}

/**
 * DPR sides a progress entry may report against a bar planned on `plannedSide`
 * (030A Part C point 17):
 *  - Planned LHS accepts only LHS (RHS needs authorised reassignment).
 *  - Planned RHS accepts only RHS.
 *  - Planned Full Width may be executed Full Width, LHS or RHS.
 *  - Planned Both Sides requires the DPR to identify LHS / RHS / full-width.
 *  - null planned side (legacy, "Side Review Required"): any side allowed —
 *    the bar remains fully operational while unspecified.
 * DPR must never default silently to Both/Full Width on a side-specific bar.
 */
export function allowedDprSides(plannedSide: string | null | undefined): BarSide[] | null {
  if (!plannedSide || !isBarSide(plannedSide)) return null; // null = unrestricted
  switch (plannedSide) {
    case "lhs": return ["lhs"];
    case "rhs": return ["rhs"];
    case "full_width": return ["full_width", "lhs", "rhs"];
    case "both_sides": return ["lhs", "rhs", "full_width"];
    case "median": return ["median"];
    case "shoulder_lhs": return ["shoulder_lhs"];
    case "shoulder_rhs": return ["shoulder_rhs"];
    case "service_road_lhs": return ["service_road_lhs"];
    case "service_road_rhs": return ["service_road_rhs"];
    case "other": return null; // "other" carries no geometric restriction
  }
}

/**
 * Instruction 029B Part D — do two bar/stretch side values represent
 * physically distinct, non-overlapping corridors? When true, matching
 * chainage between the two is NOT an overlap (LHS vs RHS is the normal
 * road-planning case). Rules:
 *  - full_width or both_sides against anything → NOT distinct (chainage check applies)
 *  - the same side value against itself → NOT distinct
 *  - any two DIFFERENT non-full_width/non-both_sides values → distinct corridors
 *  - null/unspecified on either → NOT distinct here; callers must surface a
 *    "Side must be confirmed" validation instead of silently deciding.
 */
export function areSidesDistinctCorridors(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!isBarSide(a as any) || !isBarSide(b as any)) return false;
  if (a === b) return false;
  if (a === "full_width" || a === "both_sides" || b === "full_width" || b === "both_sides") return false;
  return true;
}

export function isDprSideCompatible(
  plannedSide: string | null | undefined,
  dprSide: string | null | undefined,
): boolean {
  const allowed = allowedDprSides(plannedSide);
  if (allowed === null) return true;
  if (!dprSide || !isBarSide(dprSide)) return false; // side-specific bar demands an explicit side
  return allowed.includes(dprSide);
}

// ─── Chainage parsing (030A Part C point 14) ────────────────────────────────
// Accepts "1.900", "1+900", "Km 1+900", "km 1.900", "1900" (metres if > 100?
// no — never guess units; a bare integer above 1000 with no separator is
// treated as metres only when written with "+"). Returns km, or null when
// unparseable. Formatted display text is kept separately; all sorting and
// range math uses the numeric value.
export function parseChainageKm(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/^km\.?\s*/i, "");
  if (s === "") return null;
  // "1+900" → 1 km + 900 m
  const plus = s.match(/^(\d+)\s*\+\s*(\d{1,3}(?:\.\d+)?)$/);
  if (plus) {
    const km = parseInt(plus[1], 10);
    const m = parseFloat(plus[2]);
    if (Number.isFinite(km) && Number.isFinite(m) && m < 1000) return +(km + m / 1000).toFixed(6);
    return null;
  }
  // plain decimal km: "1.9", "12.345", "0.500"
  const dec = s.match(/^(\d+(?:\.\d+)?)$/);
  if (dec) {
    const v = parseFloat(dec[1]);
    return Number.isFinite(v) ? +v.toFixed(6) : null;
  }
  return null;
}

/** Format a numeric km chainage as the familiar "1+900" engineering style. */
export function formatChainageKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  const whole = Math.floor(km);
  const metres = Math.round((km - whole) * 1000);
  return `${whole}+${String(metres).padStart(3, "0")}`;
}

export const QUANTITY_SOURCES = [
  "calculated",
  "measured",
  "weighment_mt",
  "survey",
  "other",
] as const;
export type QuantitySource = (typeof QUANTITY_SOURCES)[number];
export const QUANTITY_SOURCE_LABELS: Record<QuantitySource, string> = {
  calculated: "Calculated from geometry",
  measured: "Direct measured",
  weighment_mt: "Weighment (MT)",
  survey: "Survey",
  other: "Other",
};

/**
 * Which geometry fields apply to a bar, from the item's layerConfig.layerType
 * (030A Part A point 3). Structures use location identity, not road geometry.
 */
export function geometryApplicability(layerType: string | null | undefined): {
  side: boolean; width: boolean; thickness: boolean; suggestQty: boolean;
} {
  switch (layerType) {
    case "bituminous":
    case "granular":
      return { side: true, width: true, thickness: true, suggestQty: true };
    case "spray_coat":
      return { side: true, width: true, thickness: false, suggestQty: true };
    case "earthwork":
      // Earthwork: side only — a flat L×W×H figure has no real geometric basis.
      return { side: true, width: false, thickness: false, suggestQty: false };
    case "concrete":
      return { side: true, width: true, thickness: true, suggestQty: false };
    default:
      return { side: false, width: false, thickness: false, suggestQty: false };
  }
}
