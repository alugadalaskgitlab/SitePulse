/**
 * shared/dprGeometry.ts — single source of truth for DPR geometry-derived
 * quantities AND the calculated-vs-manual quantity-source distinction.
 *
 * Used by:
 *  - client/src/lib/dprUom.ts + dprCalculations.ts (re-export, so SiteEntry,
 *    SiteEdit, SiteRequirementNew keep their existing imports)
 *  - GuidedDpr / SiteEntry / SiteEdit for source resolution
 *  - server/routes.ts, which NEVER trusts a client-supplied "calculated" flag:
 *    it recomputes the geometry quantity from the submitted dimensions and
 *    compares within tolerance (same recompute-not-trust pattern as chainage
 *    containment and side compatibility).
 */

// ── UOM derivation (moved verbatim from client/src/lib/dprUom.ts) ───────────

export function deriveDprUom(
  length?: number | null,
  width?: number | null,
  thickness?: number | null,
): string | null {
  const L = !!length && length > 0;
  const W = !!width && width > 0;
  const T = !!thickness && thickness > 0;
  if (L && W && T) return "CUM";
  if (L && W) return "SQM";
  if (L) return "RMT";
  return null;
}

export function computeDprQty(
  length?: number | null,
  width?: number | null,
  thickness?: number | null,
): number | null {
  const uom = deriveDprUom(length, width, thickness);
  if (uom === "CUM") return (length as number) * (width as number) * (thickness as number);
  if (uom === "SQM") return (length as number) * (width as number);
  if (uom === "RMT") return length as number;
  return null;
}

export type BoqUomProfile = { dimClass: "volume" | "area" | "length" | "count"; uom: string; dims: ("L" | "W" | "T")[] };

export function boqUomProfile(unit?: string | null): BoqUomProfile {
  const u = (unit || "").toLowerCase().replace(/[\s().]/g, "");
  if (/^(cum|cmt|m3|brass)$/.test(u) || /cubic|cum|m3|m³/.test(u)) return { dimClass: "volume", uom: "CUM", dims: ["L", "W", "T"] };
  if (/^(sqm|sm|m2|ha|hect|hectare|acre|are)$/.test(u) || /sqm|sq\.?m|squarem|m2|m²|hectare|^ha$/.test(u)) return { dimClass: "area", uom: "SQM", dims: ["L", "W"] };
  if (/^(rmt|rm|rmtr|m|mtr|meter|metre|km|lm)$/.test(u) || /^r\.?m\.?t?$|runningm|rmeter|rmetre|^lm$|^km$/.test(u)) return { dimClass: "length", uom: "RMT", dims: ["L"] };
  return { dimClass: "count", uom: (unit || "NOS").toUpperCase().replace(/\.$/, ""), dims: [] };
}

export function resolveBoqUomProfile(
  item: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
): BoqUomProfile {
  if (!item) return { dimClass: "count", uom: "NOS", dims: [] };
  const m = item.dprMeasurementMethod;
  if (m === "CUM_LWT") return { dimClass: "volume", uom: "CUM", dims: ["L", "W", "T"] };
  if (m === "SQM_LW") return { dimClass: "area", uom: "SQM", dims: ["L", "W"] };
  if (m === "RMT_L") return { dimClass: "length", uom: "RMT", dims: ["L"] };
  if (m === "MT_manual") return { dimClass: "count", uom: "MT", dims: [] };
  if (m === "NOS_manual") return { dimClass: "count", uom: "NOS", dims: [] };
  if (m === "LS_manual") return { dimClass: "count", uom: "LS", dims: [] };
  return boqUomProfile(item.unit);
}

// ── Chainage → length (moved from client/src/lib/dprCalculations.ts) ────────

export function parseChainageToMeters(chainage: string): number | null {
  if (!chainage) return null;
  const match = chainage.match(/^(\d+)\+(\d+)$/);
  if (match) return parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
  const num = parseFloat(chainage);
  return isNaN(num) ? null : num * 1000;
}

export function calculateLengthFromChainage(from: string, to: string): number | null {
  const fromM = parseChainageToMeters(from);
  const toM = parseChainageToMeters(to);
  if (fromM !== null && toM !== null) return Math.abs(toM - fromM);
  return null;
}

export function getEffectiveLength(
  manualLength: number | null | undefined,
  chainageFrom: string,
  chainageTo: string,
): number | null {
  if (manualLength != null && manualLength > 0) return manualLength;
  return calculateLengthFromChainage(chainageFrom, chainageTo);
}

/** Single formula for DPR / Tomorrow's Plan quantity from geometry. */
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
  return computeDprQty(length, width, thickness);
}

// ── Quantity source: calculated vs manual (this instruction) ────────────────

export type GeometryRowInput = {
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  quantity?: number | null;
  quantitySource?: string | null;
  quantitySourceNote?: string | null;
};

/**
 * Recompute the geometry-implied quantity for a submitted row.
 * Effective length = explicit length, else chainage span. Returns null when
 * geometry cannot produce a quantity (manual-only items / missing dims).
 */
export function geometryQtyForRow(
  row: GeometryRowInput,
  boqItem: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
): number | null {
  const length = getEffectiveLength(row.length, row.chainageFrom ?? "", row.chainageTo ?? "");
  return calculateDprQuantity(length, row.width, row.thickness, boqItem);
}

/** Tolerance for "is this the system-calculated value?" (rounding-safe). */
export function quantitiesMatch(entered: number, calc: number): boolean {
  return Math.abs(entered - calc) <= Math.max(0.005, Math.abs(calc) * 0.001);
}

/**
 * Resolve what the source SHOULD be for a row, from geometry alone:
 *  - "calculated" when the quantity matches the recomputed geometry value
 *  - null when a real (manual) source is needed or no quantity present
 */
export function resolveQuantitySource(
  row: GeometryRowInput,
  boqItem: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
): "calculated" | null {
  if (row.quantity == null) return null;
  const calc = geometryQtyForRow(row, boqItem);
  return calc != null && quantitiesMatch(Number(row.quantity), calc) ? "calculated" : null;
}

/**
 * Validate a row's quantity source. Used identically by both DPR screens and
 * the server. Returns an error message or null.
 *
 * Rules:
 *  - quantity absent → nothing to validate.
 *  - claimed "calculated" is verified by recomputation; a mismatch is ALWAYS
 *    an error (even on drafts — it's wrong data, not incomplete data).
 *  - quantity matching the recomputed geometry never requires a source
 *    (the system already knows it's calculated).
 *  - genuinely manual quantity: a real source is required on submit
 *    (draft-lenient), and "other" requires a note.
 */
export function checkQuantitySourceRow(
  row: GeometryRowInput,
  boqItem: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined,
  opts: { draft?: boolean } = {},
): string | null {
  const label = "quantity";
  if (row.quantity == null) return null;
  const calc = geometryQtyForRow(row, boqItem);
  const isCalc = calc != null && quantitiesMatch(Number(row.quantity), calc);
  if (row.quantitySource === "calculated" && !isCalc) {
    return calc == null
      ? `the ${label} is marked "Calculated from geometry" but no geometry calculation applies to this row — pick the real source (measured, weighment, survey…)`
      : `the ${label} (${Number(row.quantity)}) is marked "Calculated from geometry" but the geometry recomputes to ${calc.toFixed(3)} — it was changed manually, so pick the real source`;
  }
  if (isCalc) return null; // system knows the source; never block
  if (!row.quantitySource) {
    if (opts.draft) return null;
    return `the ${label} was entered manually — pick how it was determined (measured, weighment, survey…)`;
  }
  if (row.quantitySource === "other" && !(row.quantitySourceNote ?? "").trim()) {
    if (opts.draft) return null;
    return `quantity source "Other" needs a short note describing how the ${label} was determined`;
  }
  return null;
}

/** Manual source options (excludes "calculated" — only the system may set that). */
export const MANUAL_QUANTITY_SOURCES = ["measured", "survey", "weighment_mt", "other"] as const;

// ── Batch 04: physical measurement vs BOQ progress ──────────────────────────
//
// A DPR row stores the PHYSICAL measurement (e.g. 150 m × 1.5 m = 225 SQM).
// BOQ progress is that quantity converted into the BOQ item's own unit via
// dprConversionFactor (e.g. × 0.0001 → 0.0225 Ha). The server-side cumulative
// aggregation already applies COALESCE(dpr_conversion_factor, 1) — these
// helpers are the SAME rule for every display surface, so the factor is
// applied exactly once and Summary/Detail never disagree.

/** The one factor rule (identical to the SQL aggregation): factor ?? 1. */
export function resolveDprConversionFactor(
  boqItem?: { dprConversionFactor?: number | null } | null,
): number {
  const f = boqItem?.dprConversionFactor;
  return typeof f === "number" && Number.isFinite(f) && f > 0 ? f : 1;
}

/** Physical quantity → BOQ-unit progress quantity (applied exactly once). */
export function boqProgressQty(
  measuredQty: number | null | undefined,
  boqItem?: { dprConversionFactor?: number | null } | null,
): number | null {
  if (measuredQty == null || !Number.isFinite(Number(measuredQty))) return null;
  return Number(measuredQty) * resolveDprConversionFactor(boqItem);
}

const fmtNum = (n: number, dp = 3): string => {
  const s = n.toFixed(dp);
  return s.replace(/\.?0+$/, "");
};

export type DprRowLike = GeometryRowInput & { uom?: string | null };

/**
 * Dimension string that matches the row's measurement type — never fabricates
 * zero dimensions. Area rows show "150 × 1.5 m", volume rows "90 × 1 × 0.3 m",
 * linear rows "150 m"; count/weighment/manual rows show no dimensions at all.
 * Dimension class comes from the BOQ item's measurement profile when known,
 * else from the row's stored UOM.
 */
export function formatDprDimensions(
  row: DprRowLike,
  boqItem?: { unit?: string | null; dprMeasurementMethod?: string | null } | null,
): string | null {
  const prof = boqItem ? resolveBoqUomProfile(boqItem) : boqUomProfile(row.uom);
  if (prof.dims.length === 0) return null;
  const L = getEffectiveLength(row.length, row.chainageFrom ?? "", row.chainageTo ?? "");
  const vals: number[] = [];
  for (const d of prof.dims) {
    const v = d === "L" ? L : d === "W" ? row.width : row.thickness;
    if (v == null || !(Number(v) > 0)) return vals.length ? `${vals.map((x) => fmtNum(x)).join(" × ")} m` : null;
    vals.push(Number(v));
  }
  return `${vals.map((x) => fmtNum(x)).join(" × ")} m`;
}

export type DprMeasurementSummary = {
  /** e.g. "150 × 1.5 m" — null when the row has no geometric dimensions */
  dims: string | null;
  measuredQty: number | null;
  /** UOM of the physical measurement (stored row uom, else profile uom) */
  measuredUom: string | null;
  factor: number;
  /** measuredQty × factor — null when no BOQ item / no quantity */
  boqQty: number | null;
  boqUom: string | null;
  /** true when a real unit conversion applies (factor ≠ 1) */
  converted: boolean;
};

/** One shared measurement representation for Summary, Detail, and exports. */
export function dprMeasurementSummary(
  row: DprRowLike,
  boqItem?: { unit?: string | null; dprMeasurementMethod?: string | null; dprConversionFactor?: number | null } | null,
): DprMeasurementSummary {
  const prof = boqItem ? resolveBoqUomProfile(boqItem) : boqUomProfile(row.uom);
  const measuredQty = row.quantity != null && Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : null;
  // When a BOQ profile exists it is authoritative for the PHYSICAL DPR unit.
  // Legacy/new Guided rows may carry the BOQ unit in row.uom (for example Ha)
  // even though their geometry quantity is SQM. Never relabel that physical
  // number with the BOQ unit; the BOQ unit belongs only to boqQty below.
  const measuredUom = (boqItem ? prof.uom : (row.uom || (prof.dims.length ? prof.uom : null))) ?? null;
  const factor = resolveDprConversionFactor(boqItem);
  const converted = boqItem != null && factor !== 1;
  return {
    dims: formatDprDimensions(row, boqItem),
    measuredQty,
    measuredUom,
    factor,
    boqQty: boqItem != null && measuredQty != null ? measuredQty * factor : null,
    boqUom: boqItem?.unit ?? null,
    converted,
  };
}

/** "150 × 1.5 m = 225 SQM → 0.0225 Ha" (arrow only when a conversion applies). */
export function formatDprMeasurement(s: DprMeasurementSummary): string {
  const parts: string[] = [];
  if (s.dims) parts.push(s.dims);
  if (s.measuredQty != null) {
    const qty = `${fmtNum(s.measuredQty)}${s.measuredUom ? ` ${s.measuredUom}` : ""}`;
    parts.push(parts.length ? `= ${qty}` : qty);
    if (s.converted && s.boqQty != null && s.boqUom) parts.push(`→ ${fmtNum(s.boqQty, 4)} ${s.boqUom}`);
  }
  return parts.join(" ") || "-";
}
