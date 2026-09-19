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

import { canonicalizeUnit } from "./boqNormalise";

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

export type BoqUnitFields = {
  /** Imported BOQ unit (the saved contract/source unit). */
  unit?: string | null;
  /** Legacy derived alias; accepted for metadata shape but not display authority. */
  canonicalUnit?: string | null;
};

export type DprConversionItem = BoqUnitFields & {
  dprMeasurementMethod?: string | null;
  dprConversionFactor?: number | null;
};

export type DprUnitConversionResolution = {
  sourceUom: string | null;
  targetUom: string | null;
  factor: number | null;
  valid: boolean;
  mode: "identity" | "dimensional" | "custom" | "unresolved";
  warnings: string[];
};

type DprConversionRow = Pick<
  DprRowLike,
  "uom" | "length" | "width" | "thickness" | "chainageFrom" | "chainageTo" | "quantitySource" | "quantitySourceNote"
> & { kind?: "progress" | "structure" };

/**
 * Resolve the unit owned by the BOQ item for display.
 *
 * `unit` is the saved BOQ contract/source unit and is authoritative. The
 * persisted `canonicalUnit` is a derived alias and may be stale after an item
 * edit, so it is deliberately not used to infer a destination unit. A factor
 * such as 0.0001 must never manufacture "Ha" from a physical "Sqm" source.
 */
export function resolveBoqDisplayUnit(item?: BoqUnitFields | null): string | null {
  const actual = typeof item?.unit === "string" ? item.unit.trim() : "";
  return actual ? canonicalizeUnit(actual) : null;
}

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
// BOQ progress is resolved from the physical source and authoritative BOQ UOM:
// identity for same-unit rows, standard factors for known dimensional pairs,
// and a provenance-backed custom factor otherwise. Invalid or ambiguous rows
// remain unresolved; physical evidence is never rewritten here.

const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Known, dimensionally safe conversions. Values convert one source unit to target units. */
const KNOWN_DPR_FACTORS: Record<string, number> = {
  "Sqm>Ha": 0.0001, "Ha>Sqm": 10000,
  "Sqm>Acre": 1 / 4046.8564224, "Acre>Sqm": 4046.8564224,
  "Sqm>Are": 0.01, "Are>Sqm": 100,
  "Cum>CFT": 35.3146667215, "CFT>Cum": 1 / 35.3146667215,
  "Rmt>Km": 0.001, "Km>Rmt": 1000,
  "MT>Kg": 1000, "Kg>MT": 0.001,
  "Ltr>KL": 0.001, "KL>Ltr": 1000,
};

function inferredPhysicalUnit(
  row: DprConversionRow | null | undefined,
  item: DprConversionItem | null | undefined,
): { unit: string | null; warnings: string[]; uncertain: boolean; explicitMethod: boolean } {
  const warnings: string[] = [];
  const method = item?.dprMeasurementMethod;
  const explicitMethod = !!method;
  let methodUnit: string | null = null;
  if (method === "CUM_LWT") methodUnit = "Cum";
  else if (method === "SQM_LW") methodUnit = "Sqm";
  else if (method === "RMT_L") methodUnit = "Rmt";
  else if (method === "MT_manual") methodUnit = "MT";
  else if (method === "NOS_manual") methodUnit = "Nos";
  else if (method === "LS_manual") methodUnit = "LS";
  const rowUnit = row?.uom ? canonicalizeUnit(row.uom) : null;
  const hasGeometryEvidence = !!row && (
    Number(row.length) > 0 || Number(row.width) > 0 || Number(row.thickness) > 0 ||
    !!row.chainageFrom || !!row.chainageTo
  );
  const rowUnitIsAuthoritative = row?.kind === "structure" ||
    (!!row?.quantitySource && row.quantitySource !== "calculated") ||
    !hasGeometryEvidence;
  if (rowUnit && rowUnitIsAuthoritative) methodUnit = rowUnit;
  if (!methodUnit && item) {
    const profile = resolveBoqUomProfile(item);
    // Area/volume/length BOQ items are captured in geometry's SI field unit.
    // This is what lets a method-null Ha item correctly identify SQM→Ha while
    // an Sqm item remains same-unit identity.
    if (profile.dims.length > 0) methodUnit = canonicalizeUnit(profile.uom);
  }
  if (methodUnit && rowUnit && rowUnit !== methodUnit) {
    // An explicit method is authoritative for geometry rows. Without one,
    // conflicting legacy UOM/geometry evidence is ambiguous: do not guess
    // whether the stored quantity was already transformed.
    const uncertain = !explicitMethod && hasGeometryEvidence && !rowUnitIsAuthoritative;
    warnings.push(`Legacy row UOM ${rowUnit} conflicts with physical measurement profile ${methodUnit}; the override is uncertain and physical evidence was not relabelled`);
    return { unit: methodUnit, warnings, uncertain, explicitMethod };
  }
  return { unit: methodUnit ?? rowUnit ?? resolveBoqDisplayUnit(item), warnings, uncertain: false, explicitMethod };
}

/**
 * Authoritative physical→BOQ unit resolver.
 *
 * Same-unit credit is always identity, even when a stale persisted factor says
 * otherwise. Known dimensional pairs use their standard factor. Other
 * cross-dimensional pairs require an explicit positive item/row factor.
 * Unresolved pairs return factor:null: callers must flag them, never guess 1.
 */
export function resolveDprUnitConversion(
  row: DprConversionRow | null | undefined,
  item: DprConversionItem | null | undefined,
  rowConversionFactor?: number | null,
): DprUnitConversionResolution {
  const physical = inferredPhysicalUnit(row, item);
  const sourceUom = physical.unit;
  const targetUom = resolveBoqDisplayUnit(item);
  const warnings = [...physical.warnings];
  const hasRowFactor = rowConversionFactor != null;
  const invalidRowFactor = hasRowFactor && !finitePositive(rowConversionFactor);
  const invalidItemFactor = item?.dprConversionFactor != null && !finitePositive(item.dprConversionFactor);
  if (invalidRowFactor) {
    warnings.push(`Invalid row conversion factor ${String(rowConversionFactor)}; a factor must be finite and positive`);
  }
  if (!hasRowFactor && invalidItemFactor) {
    warnings.push(`Invalid item conversion factor ${String(item?.dprConversionFactor)}; a factor must be finite and positive`);
  }
  // Presence of a row override is authoritative, including when invalid. An
  // invalid row value must never silently fall back to the item factor.
  const explicit = hasRowFactor
    ? (finitePositive(rowConversionFactor) ? rowConversionFactor : null)
    : (finitePositive(item?.dprConversionFactor) ? item!.dprConversionFactor! : null);

  const sourceNote = row?.quantitySourceNote ?? "";
  const hasLegacyUomOverride = /\bUOM override\s+.+?\s*->\s*.+?\s*\(x[^)]+\)\s*:/i.test(sourceNote)
    && !/\bPhysical input normalization\b/i.test(sourceNote);
  if (hasLegacyUomOverride) {
    warnings.push("Legacy UOM override note indicates the stored quantity may already have been transformed; BOQ credit requires review");
    return { sourceUom, targetUom, factor: null, valid: false, mode: "unresolved", warnings };
  }

  if (physical.uncertain) {
    warnings.push("BOQ credit is unresolved because legacy UOM and geometry evidence conflict");
    return { sourceUom, targetUom, factor: null, valid: false, mode: "unresolved", warnings };
  }
  if (!sourceUom || !targetUom) {
    warnings.push("BOQ credit unit conversion is unresolved because source or contractual target UOM is missing");
    return { sourceUom, targetUom, factor: null, valid: false, mode: "unresolved", warnings };
  }
  if (sourceUom === targetUom) {
    if (explicit != null && Math.abs(explicit - 1) > 1e-12) {
      warnings.push(`Ignored stale conversion factor ${explicit}: physical and contractual UOM are both ${targetUom}`);
    }
    return { sourceUom, targetUom, factor: 1, valid: true, mode: "identity", warnings };
  }
  const known = KNOWN_DPR_FACTORS[`${sourceUom}>${targetUom}`];
  if (known != null) {
    if (explicit != null && Math.abs(explicit - known) > Math.max(1e-12, Math.abs(known) * 1e-9)) {
      warnings.push(`Ignored conversion factor ${explicit}; authoritative ${sourceUom}→${targetUom} factor is ${known}`);
    }
    return { sourceUom, targetUom, factor: known, valid: true, mode: "dimensional", warnings };
  }
  // A custom cross-dimensional multiplier is valid only with provenance:
  // an explicit measurement method defining the physical source, or a
  // row-level override tied to this row. A positive legacy item factor alone
  // must not make an arbitrary Nos→MT pair valid.
  if (explicit != null && (physical.explicitMethod || finitePositive(rowConversionFactor))) {
    return { sourceUom, targetUom, factor: explicit, valid: true, mode: "custom", warnings };
  }
  warnings.push(`BOQ credit requires an explicit ${sourceUom}→${targetUom} conversion profile factor`);
  return { sourceUom, targetUom, factor: null, valid: false, mode: "unresolved", warnings };
}

/** Legacy factor-only API. Prefer resolveDprUnitConversion for row-aware credit. */
export function resolveDprConversionFactor(
  boqItem?: DprConversionItem | null,
): number {
  if (boqItem?.unit || boqItem?.dprMeasurementMethod) {
    return resolveDprUnitConversion(null, boqItem).factor ?? Number.NaN;
  }
  const f = boqItem?.dprConversionFactor;
  return typeof f === "number" && Number.isFinite(f) && f > 0 ? f : 1;
}

/** Physical quantity → BOQ-unit progress quantity (applied exactly once). */
export function boqProgressQty(
  measuredQty: number | null | undefined,
  boqItem?: DprConversionItem | null,
  row?: DprConversionRow | null,
): number | null {
  if (measuredQty == null || !Number.isFinite(Number(measuredQty))) return null;
  // Keep factor-only legacy callers compatible until they can supply unit
  // metadata; unit-aware callers never receive fabricated unresolved credit.
  const hasUnitContract = !!(boqItem?.unit || boqItem?.dprMeasurementMethod || row?.uom);
  if (!hasUnitContract) return Number(measuredQty) * resolveDprConversionFactor(boqItem);
  const resolved = resolveDprUnitConversion(row, boqItem);
  return resolved.factor == null ? null : Number(measuredQty) * resolved.factor;
}

const fmtNum = (n: number, dp = 3): string => {
  const s = n.toFixed(dp);
  return s.replace(/\.?0+$/, "");
};

/** Preserve established field-measurement labels without changing unit identity. */
const physicalDisplayUnit = (unit: string | null): string | null => {
  if (unit === "Sqm") return "SQM";
  if (unit === "Cum") return "CUM";
  if (unit === "Rmt") return "RMT";
  return unit;
};

export type DprRowLike = GeometryRowInput & {
  uom?: string | null;
  /** Structure rows treat their stored physical UOM as authoritative. */
  kind?: "progress" | "structure";
  /** Optional row-specific conversion provenance (primarily structure rows). */
  rowConversionFactor?: number | null;
};

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
  /** Resolved physical→BOQ factor; null when conversion is unresolved. */
  factor: number | null;
  /** measuredQty × factor — null when no BOQ item / no quantity */
  boqQty: number | null;
  boqUom: string | null;
  /** true when a real unit conversion applies (factor ≠ 1) */
  converted: boolean;
  /** Actionable unit/provenance warnings; empty for an ordinary valid row. */
  warnings: string[];
  conversionValid: boolean;
};

/** One shared measurement representation for Summary, Detail, and exports. */
export function dprMeasurementSummary(
  row: DprRowLike,
  boqItem?: BoqUnitFields & { dprMeasurementMethod?: string | null; dprConversionFactor?: number | null } | null,
): DprMeasurementSummary {
  const measuredQty = row.quantity != null && Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : null;
  const resolution = boqItem
    ? resolveDprUnitConversion(row, boqItem, row.rowConversionFactor)
    : { sourceUom: row.uom ? canonicalizeUnit(row.uom) : null, factor: 1, valid: true, warnings: [] as string[] };
  // The resolver owns physical-source semantics too. This is critical for
  // manual/structure evidence such as CFT against a Cum BOQ item: displaying
  // the BOQ profile's Cum here would falsely relabel the preserved evidence.
  const measuredUom = physicalDisplayUnit(resolution.sourceUom);
  const factor = resolution.factor;
  const converted = boqItem != null && factor != null && factor !== 1;
  return {
    dims: formatDprDimensions(row, boqItem),
    measuredQty,
    measuredUom,
    factor,
    boqQty: boqItem != null && measuredQty != null && factor != null ? measuredQty * factor : null,
    boqUom: resolveBoqDisplayUnit(boqItem),
    converted,
    warnings: resolution.warnings,
    conversionValid: resolution.valid,
  };
}

/** "150 × 1.5 m = 225 SQM → 0.0225 Ha" (or an explicit missing-unit marker). */
export function formatDprMeasurement(s: DprMeasurementSummary): string {
  const parts: string[] = [];
  if (s.dims) parts.push(s.dims);
  if (s.measuredQty != null) {
    const qty = `${fmtNum(s.measuredQty)}${s.measuredUom ? ` ${s.measuredUom}` : ""}`;
    parts.push(parts.length ? `= ${qty}` : qty);
    if (s.converted && s.boqQty != null) {
      parts.push(s.boqUom
        ? `→ ${fmtNum(s.boqQty, 4)} ${s.boqUom}`
        : `→ ${fmtNum(s.boqQty, 4)} (BOQ unit unavailable)`);
    } else if (!s.conversionValid) {
      parts.push(s.boqUom ? "→ (BOQ credit unresolved)" : "→ (BOQ unit unavailable)");
    }
  }
  return parts.join(" ") || "-";
}
