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
