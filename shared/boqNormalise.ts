/**
 * boqNormalise.ts — Universal BOQ normalisation service
 * ───────────────────────────────────────────────────────
 * Single source of truth for BOQ unit canonicalization used by every module:
 *   - workTypeRecipes.ts  (classifyWorkType)
 *   - planningEngine.ts   (normaliseUnit / productivity matching)
 *   - resourceReview.ts   (unitNorm / anomaly detection)
 *   - storage.ts          (import + backfill)
 *   - routes.ts           (auto-sequence)
 *   - client pages        (display)
 *
 * IMPORTANT: This file has NO imports from other shared modules so that
 * workTypeRecipes.ts can import from here without creating a circular
 * dependency (boqWorkCategories → workTypeRecipes → boqNormalise → ✓).
 */

// ─── Canonical Unit Map ───────────────────────────────────────────────────────
// Keys   : all-uppercase, punctuation+spaces stripped
// Values : canonical display form stored in DB and shown in the UI
// The goal is one unambiguous string per physical unit, in a readable form.
const CANONICAL_UNIT_MAP: Record<string, string> = {
  // ── Cubic metre ──────────────────────────────────────────────────────────
  CUM:          "Cum",   M3:           "Cum",   CBM:          "Cum",
  CUBM:         "Cum",   CUB:          "Cum",
  CUBICMETER:   "Cum",   CUBICMETRE:   "Cum",   CUBICMTR:     "Cum",
  CUBICMTRS:    "Cum",   CUBICMETRES:  "Cum",   CUBICMETERS:  "Cum",
  CUBM3:        "Cum",   CM3:          "Cum",

  // ── Square metre ─────────────────────────────────────────────────────────
  SQM:          "Sqm",   M2:           "Sqm",
  SQMT:         "Sqm",   SQMTR:        "Sqm",   SQMTRS:       "Sqm",
  SQUAREMETER:  "Sqm",   SQUAREMETRE:  "Sqm",
  SQUAREMTR:    "Sqm",   SQUAREMTRS:   "Sqm",   SQUAREMETERS: "Sqm",

  // ── Hectare ──────────────────────────────────────────────────────────────
  HA:           "Ha",    HECT:         "Ha",    HEC:          "Ha",
  HECTARE:      "Ha",    HECTARES:     "Ha",

  // ── Running / linear metre ────────────────────────────────────────────────
  RMT:          "Rmt",   RM:           "Rmt",   LM:           "Rmt",
  LMT:          "Rmt",   MTR:          "Rmt",
  RUNNINGMETER: "Rmt",   RUNNINGMETRE: "Rmt",
  LINEARMETER:  "Rmt",   LINEARMETRE:  "Rmt",
  RUNNIGMETER:  "Rmt",   // common import typo

  // ── Metric tonne ─────────────────────────────────────────────────────────
  MT:           "MT",    TON:          "MT",    TONNE:        "MT",
  TONNES:       "MT",    TONS:         "MT",
  METRICTONNE:  "MT",    METRICTON:    "MT",    METRICTNS:    "MT",
  // NOTE: bare "T" intentionally omitted — too ambiguous (could be "tonne" or "time")

  // ── Kilogram ─────────────────────────────────────────────────────────────
  KG:           "Kg",    KGS:          "Kg",    KGM:          "Kg",
  KILOGRAM:     "Kg",    KILOGRAMS:    "Kg",

  // ── Cubic feet ───────────────────────────────────────────────────────────
  CFT:          "CFT",   CUFT:         "CFT",
  CUBICFOOT:    "CFT",   CUBICFEET:    "CFT",

  // ── Litre ────────────────────────────────────────────────────────────────
  LTR:          "Ltr",   LIT:          "Ltr",
  LITRE:        "Ltr",   LITER:        "Ltr",
  LITRES:       "Ltr",   LITERS:       "Ltr",
  // NOTE: bare "L" and "LT" omitted — too ambiguous in Indian BOQ context

  // ── Kilolitre ────────────────────────────────────────────────────────────
  KL:           "KL",    KILOLITRE:    "KL",    KILOLITER:    "KL",
  KILOLITRES:   "KL",    KILOLITERS:   "KL",

  // ── Each / Number ────────────────────────────────────────────────────────
  NOS:          "Nos",   NO:           "Nos",   EA:           "Nos",
  EACH:         "Nos",   NUMBER:       "Nos",   NBR:          "Nos",
  NUM:          "Nos",
  PCS:          "Nos",   PC:           "Nos",   PIECE:        "Nos",
  PIECES:       "Nos",

  // ── Job / Lump sum ────────────────────────────────────────────────────────
  JOB:          "Job",
  LS:           "LS",    LUMPSUM:      "LS",    LOT:          "LS",
  LUMP:         "LS",

  // ── Percentage ───────────────────────────────────────────────────────────
  PERCENT:      "%",     PCT:          "%",
};

/**
 * Convert any raw imported BOQ unit string into its canonical operational form.
 *
 * Normalisation steps:
 *   1. Strip leading numeric quantity prefix: "1 Cum" → "Cum",  "1.00 Sqm" → "Sqm"
 *   2. Strip internal punctuation & spaces for map lookup: "Cu.m" → "Cum"
 *   3. Look up in CANONICAL_UNIT_MAP (case-insensitive key)
 *   4. Fall back to the step-1 de-prefixed string (trim only) when unknown
 *
 * Examples:
 *   "1 Cum"       → "Cum"
 *   "1.00 Cum"    → "Cum"
 *   "1CUM"        → "Cum"
 *   "Cu.m"        → "Cum"
 *   "cu.m"        → "Cum"
 *   "m3"          → "Cum"
 *   "M3"          → "Cum"
 *   "Cubic Metre" → "Cum"
 *   "1 Sqm"       → "Sqm"
 *   "Sq.m"        → "Sqm"
 *   "m2"          → "Sqm"
 *   "1 Hect"      → "Ha"
 *   "Hectare"     → "Ha"
 *   "Ha"          → "Ha"
 *   "MTR"         → "Rmt"
 *   "MT"          → "MT"
 *   "CUM"         → "Cum"
 *   "NOS"         → "Nos"
 *   "LS"          → "LS"
 *   "UNIT"        → "UNIT"  (unknown — returned as-is)
 */
export function canonicalizeUnit(raw: string): string {
  if (!raw || !raw.trim()) return raw ?? "";
  // Step 0: strip leading "Per" / "per" prefix (e.g. "Per 1 Sqm" → "1 Sqm", "Per Sqm" → "Sqm")
  let s = raw.trim().replace(/^[Pp][Ee][Rr]\s+/i, "").trim();
  // Step 1: strip leading numeric quantity prefix (e.g. "1 Cum" → "Cum", "1.00 " → "")
  const dePrefix = s.replace(/^\d+(\.\d+)?\s*/i, "").trim();
  if (!dePrefix) return raw.trim();
  // Step 2: collapse punctuation and spaces for map key lookup
  const key = dePrefix.replace(/[\s.]/g, "").toUpperCase();
  // Step 3: canonical lookup, step 4: fall back to de-prefixed original
  return CANONICAL_UNIT_MAP[key] ?? dePrefix;
}

/**
 * Same as canonicalizeUnit but returns uppercase output.
 * Used internally by classifyWorkType and other regex-based classifiers
 * that expect upper-case unit strings.
 *
 * @deprecated Prefer canonicalizeUnit for new code.
 *             The canonical form is mixed case ("Cum", "Sqm" …);
 *             all-uppercase is only needed for backwards-compat regexes.
 */
export function normaliseBoqUnit(raw: string): string {
  return canonicalizeUnit(raw).toUpperCase();
}

// ─── Material Label Normalization ─────────────────────────────────────────────

/**
 * Normalize a BOM material label for exact-match alias lookup.
 * Centralised here so Work Demand mapping, stock matching, and receipt flows
 * all use the same normalization.
 *
 * Steps:
 *   1. Lowercase + trim
 *   2. Collapse internal whitespace
 *   3. Normalize spacing around "/" and "-"
 *   4. Remove spaces between digits and immediately following unit suffixes
 *      so "10 mm" and "10mm" resolve to the same token.
 */
export function normalizeMaterialLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")                         // collapse whitespace
    .replace(/\s*\/\s*/g, "/")                    // "A / B" → "A/B"
    .replace(/\s*-\s*/g, "-")                     // "A - B" → "A-B"
    .replace(/(\d)\s+(mm|cm|m)\b/gi, "$1$2");     // "10 mm" → "10mm"
}

// ─── UOM Compatibility Check ──────────────────────────────────────────────────

/** Physical-unit groups used for mass↔volume conversion eligibility. */
const MASS_UNITS = new Set(["MT", "Kg"]);
const VOLUME_UNITS = new Set(["Cum", "CFT"]);

/**
 * Returns true when two canonical UOM strings represent the same physical unit,
 * covering the single case where canonicalizeUnit() produces different outputs
 * for genuine synonyms: "L" (sometimes used in material master entries) ↔ "Ltr".
 *
 * "L" is deliberately excluded from CANONICAL_UNIT_MAP to avoid ambiguity when
 * parsing raw BOQ text, but it is a legitimate litre abbreviation in a material's
 * defaultUom field.  All other standard-equivalence pairs (MT/Ton/Tonne, Cum/m3,
 * Nos/Number, …) already canonicalize to the same output and are handled by the
 * plain equality check (canA === canB).
 *
 * 021A: used ONLY for the direct factor-1 compatibility check — not in BOQ import.
 */
function areSameUomGroup(canA: string, canB: string): boolean {
  if (canA === canB) return true;
  if ((canA === "L" || canB === "L") && (canA === "Ltr" || canB === "Ltr")) return true;
  return false;
}

/** Minimal profile shape passed from the server — avoids importing the full Drizzle type. */
export interface UomConversionProfile {
  id: number;
  fromUom: string;
  toUom: string;
  conversionFactor: number;
  conversionBasis?: string | null;
  conversionType: string;
  isActive: number;
}

export interface MappingUomCheck {
  /** True when the source UOM can be used with the target material. */
  compatible: boolean;
  /**
   * How compatibility is achieved:
   *   "conversion_profile" — explicit profile from material_uom_conversions table (highest)
   *   "direct"             — UOM is directly in the material's allowedUoms
   *   "configured_factor"  — explicit conversionFactor on the material (legacy)
   *   "bulk_density"       — mass↔volume via configured bulkDensity
   *   "incompatible"       — no compatible path found
   */
  mode: "conversion_profile" | "direct" | "bulk_density" | "configured_factor" | "incompatible";
  /** Conversion factor from sourceUom to the material's defaultUom (1 if direct). */
  conversionFactor: number | null;
  /** ID of the matched explicit conversion profile, if used. */
  conversionProfileId?: number | null;
  /** Human-readable explanation of the conversion basis shown in UI. */
  basis: string | null;
  /** Machine-readable error code returned to the client when incompatible. */
  errorCode: "MATERIAL_UOM_MISMATCH" | "MATERIAL_CONVERSION_REQUIRED" | "MATERIAL_CONVERSION_AMBIGUOUS" | null;
}

/**
 * Check whether a BOM source UOM is compatible with a target plant material.
 * Returns the conversion mode and factor when a conversion is available.
 *
 * Blocked pairs (without configured density):
 *   MT ↔ CFT, MT ↔ Cum, Litre ↔ MT, Bag ↔ MT — all require explicit density.
 */
export function checkMappingUomCompatibility(
  sourceUom: string,
  target: {
    defaultUom?: string | null;
    allowedUoms?: string | null;   // JSON array stored in DB
    bulkDensity?: number | null;
    conversionFactor?: number | null;
    conversionFromUom?: string | null;
    conversionToUom?: string | null;
  },
  /** Instruction 021: explicit conversion profiles (highest-precedence tier). */
  profiles?: UomConversionProfile[],
): MappingUomCheck {
  const srcCanonical = canonicalizeUnit(sourceUom);
  // Compute defaultCanonical early so Step 0 profile matching can use it.
  const defaultCanonical = target.defaultUom ? canonicalizeUnit(target.defaultUom) : null;

  // ── Step 0: Explicit conversion profiles (highest precedence, Instruction 021) ─
  // 021A fix: require BOTH fromUom → srcCanonical AND toUom → defaultCanonical.
  // A profile for "CUM → CFT" must NOT be selected when the material's defaultUom is "MT".
  if (profiles && profiles.length > 0) {
    const activeProfiles = profiles.filter(p => p.isActive === 1);
    const applicable = activeProfiles.filter(p =>
      canonicalizeUnit(p.fromUom) === srcCanonical &&
      (defaultCanonical == null || canonicalizeUnit(p.toUom) === defaultCanonical)
    );
    if (applicable.length === 1) {
      const p = applicable[0];
      return {
        compatible: true,
        mode: "conversion_profile",
        conversionFactor: p.conversionFactor,
        conversionProfileId: p.id,
        basis: p.conversionBasis ?? `1 ${p.fromUom} = ${p.conversionFactor} ${p.toUom}`,
        errorCode: null,
      };
    } else if (applicable.length > 1) {
      // Multiple active profiles for the same from→to pair — user must disambiguate.
      // Profiles for different target UOMs (e.g. CUM→CFT alongside CUM→MT) are NOT
      // ambiguous — only profiles with the same (from, to) pair cause ambiguity.
      return {
        compatible: false,
        mode: "incompatible",
        conversionFactor: null,
        conversionProfileId: null,
        basis: null,
        errorCode: "MATERIAL_CONVERSION_AMBIGUOUS",
      };
    }
    // No applicable from→to profile → fall through to legacy checks.
  }

  // Parse allowedUoms JSON array (stored as text in DB)
  let allowedRaw: string[] = [];
  try { allowedRaw = JSON.parse(target.allowedUoms ?? "[]"); } catch { /* ignore */ }
  const allowedCanonical = allowedRaw.map(u => canonicalizeUnit(u));

  // ── Step 1: Direct UOM match (standard-equivalence only) ────────────────────
  // 021A fix: allowedUoms DOES NOT grant factor-1 equivalence between dimensionally
  // different UOMs.  "MT" in allowedUoms of a CUM-defaulted material must NOT
  // allow CUM→MT at factor 1.  Factor-1 is valid only when:
  //   (a) srcCanonical equals defaultCanonical (handled by areSameUomGroup), or
  //   (b) they are a known standard-equivalent pair (e.g. "L" ↔ "Ltr").
  // allowedUoms is still used in Step 3 to determine bulk-density eligibility.
  if (defaultCanonical && areSameUomGroup(srcCanonical, defaultCanonical)) {
    return { compatible: true, mode: "direct", conversionFactor: 1, basis: null, errorCode: null };
  }

  // ── Step 2: Explicit conversionFactor for this source UOM ──────────────────
  if (target.conversionFactor && target.conversionFromUom) {
    const fromCanonical = canonicalizeUnit(target.conversionFromUom);
    if (fromCanonical === srcCanonical) {
      return {
        compatible: true,
        mode: "configured_factor",
        conversionFactor: target.conversionFactor,
        basis: `Configured: 1 ${srcCanonical} = ${target.conversionFactor} ${defaultCanonical ?? "unit"}`,
        errorCode: null,
      };
    }
  }

  // ── Step 3: Mass↔Volume via bulkDensity ────────────────────────────────────
  const srcIsMass = MASS_UNITS.has(srcCanonical);
  const srcIsVol = VOLUME_UNITS.has(srcCanonical);
  const bd = target.bulkDensity ?? 0;

  if ((srcIsMass || srcIsVol) && bd > 0) {
    // 021C: include defaultCanonical in mass/volume target detection.
    // A material with defaultUom=MT and empty allowedUoms MUST qualify here
    // (allowedUoms alone was insufficient — it is optional on the material).
    const targetHasMass = (defaultCanonical != null && MASS_UNITS.has(defaultCanonical))
      || allowedCanonical.some(u => MASS_UNITS.has(u));
    const targetHasVol = (defaultCanonical != null && VOLUME_UNITS.has(defaultCanonical))
      || allowedCanonical.some(u => VOLUME_UNITS.has(u));
    if ((srcIsMass && targetHasVol) || (srcIsVol && targetHasMass)) {
      // 021C: compute factor based on defaultCanonical (the target stock UOM), not the
      // legacy conversionFromUom field which is only relevant to the old CFT-specific setup.
      let factor: number;
      if (srcCanonical === "Cum") {
        factor = bd;                         // Cum → MT: × bulkDensity
      } else if (srcCanonical === "CFT") {
        factor = bd / 35.3147;               // CFT → MT
      } else if (srcIsMass && defaultCanonical === "Cum") {
        factor = 1 / bd;                     // MT → Cum
      } else if (srcIsMass && defaultCanonical === "CFT") {
        factor = 35.3147 / bd;               // MT → CFT
      } else {
        factor = bd;                         // generic fallback
      }
      const rounded = Math.round(factor * 10000) / 10000;
      return {
        compatible: true,
        mode: "bulk_density",
        conversionFactor: rounded,
        basis: `Bulk density ${bd} T/m³ — 1 ${srcCanonical} = ${Math.round(factor * 1000) / 1000} ${defaultCanonical ?? "MT"}`,
        errorCode: null,
      };
    }
  }

  // ── Incompatible ────────────────────────────────────────────────────────────
  // 021C: include defaultCanonical in the density-needed check so a material with
  // defaultUom=MT and empty allowedUoms correctly returns MATERIAL_CONVERSION_REQUIRED
  // (instead of the generic UOM_MISMATCH) when no density is configured.
  const needsDensity = (srcIsMass || srcIsVol) && (
    (defaultCanonical != null && (MASS_UNITS.has(defaultCanonical) || VOLUME_UNITS.has(defaultCanonical))) ||
    allowedCanonical.some(u => MASS_UNITS.has(u)) ||
    allowedCanonical.some(u => VOLUME_UNITS.has(u))
  );
  return {
    compatible: false,
    mode: "incompatible",
    conversionFactor: null,
    basis: null,
    errorCode: needsDensity ? "MATERIAL_CONVERSION_REQUIRED" : "MATERIAL_UOM_MISMATCH",
  };
}
