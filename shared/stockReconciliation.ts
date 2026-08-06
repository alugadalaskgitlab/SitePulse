// ─────────────────────────────────────────────────────────────────────────────
// Physical Stock Reconciliation — pure shared logic (no DB, no HTTP).
//
// Used by both the server (server/storage.ts postStockReconciliation) and the
// client (PlantStockReconciliation page) so conversion and adjustment maths
// are identical on both sides. The SERVER recomputes everything at post time —
// the client's figures are preview-only.
//
// Rules (Task #1385 spec):
//  • Adjustment = physical balance − current system balance.
//  • UOM conversion must use the material's configured conversion factor;
//    never invent or silently apply a factor. Missing conversion BLOCKS posting.
//  • Zero physical quantity is valid (e.g. exhausted & cash-settled stock).
//  • |adjustment| below tolerance ⇒ "Verified — no adjustment" (no ledger row).
// ─────────────────────────────────────────────────────────────────────────────

export const RECONCILIATION_REASONS = [
  "Physical verification",
  "Correction of provisional/test opening balance",
  "Material exhausted and financially settled",
  "Missed receipt/issue identified",
  "Measurement/UOM reconciliation",
  "Other",
] as const;
export type ReconciliationReason = (typeof RECONCILIATION_REASONS)[number];

// Quantities are stored numeric(20,6); anything below half of the last kept
// decimal place is "no change".
export const ADJUSTMENT_TOLERANCE = 1e-6;

// ── UOM-aware rounding tolerance ─────────────────────────────────────────────
// Variances within tolerance are "Verified — no adjustment": no ledger row is
// created for rounding dust (e.g. −0.000009). Configurable constants — NOT
// tied to material names. Countable units (barrels/bags/nos) get effectively
// zero tolerance because fractional units are not valid there.
export const UOM_TOLERANCES: Record<string, number> = {
  ton: 0.005,     // aggregates/tonnage — 5 kg
  kg: 0.05,
  cft: 0.05,
  cum: 0.005,
  l: 0.5,         // litres — half a litre of rounding dust
  barrel: ADJUSTMENT_TOLERANCE,
  bag: ADJUSTMENT_TOLERANCE,
  unit: ADJUSTMENT_TOLERANCE,
};

export function toleranceForUom(uom: string | null | undefined): number {
  return UOM_TOLERANCES[normalizeUom(uom)] ?? ADJUSTMENT_TOLERANCE;
}

// ── Variance sanity warnings (non-blocking; poster must acknowledge) ────────
export const VARIANCE_RATIO_HIGH = 5;    // physical > 5× positive book balance
export const VARIANCE_RATIO_LOW = 0.2;   // physical < 1/5 of positive book balance
export const SWAP_RATIO_UP = 3;          // paired swap detection thresholds
export const SWAP_RATIO_DOWN = 1 / 3;

export interface VarianceCheckRow {
  key: string;            // stable row id (e.g. "materialId:partyId")
  label: string;          // display name, e.g. "6MM Down (High Lane)"
  oldBalance: number;
  physicalBase: number;
  adjustment: number;
  uom: string;
  category?: string | null;  // material category — used to pair "similar" materials
}

export interface VarianceWarning {
  code: "LARGE_INCREASE" | "LARGE_DECREASE" | "POSSIBLE_SWAP";
  rowKeys: string[];
  message: string;
}

/**
 * Non-blocking sanity warnings on a prepared session.
 * Ratio rules only apply when the current balance is meaningfully positive
 * (> its UOM tolerance) — ratios are meaningless at zero/negative balances.
 * Never swaps values automatically; only reports what looks suspicious.
 */
export function computeVarianceWarnings(rows: VarianceCheckRow[]): VarianceWarning[] {
  const warnings: VarianceWarning[] = [];
  const fmtQ = (n: number) => Number(n.toFixed(3)).toLocaleString("en-IN");

  for (const r of rows) {
    const tol = toleranceForUom(r.uom);
    if (r.oldBalance <= tol) continue; // zero/negative balance — ratios not meaningful
    if (r.physicalBase > r.oldBalance * VARIANCE_RATIO_HIGH) {
      warnings.push({
        code: "LARGE_INCREASE",
        rowKeys: [r.key],
        message: `Large variance detected on ${r.label}: physical ${fmtQ(r.physicalBase)} ${r.uom} is more than ${VARIANCE_RATIO_HIGH}× the book balance of ${fmtQ(r.oldBalance)} ${r.uom}. Please recheck the physical count and material selection.`,
      });
    } else if (r.physicalBase < r.oldBalance * VARIANCE_RATIO_LOW) {
      warnings.push({
        code: "LARGE_DECREASE",
        rowKeys: [r.key],
        message: `Large variance detected on ${r.label}: physical ${fmtQ(r.physicalBase)} ${r.uom} is less than one-fifth of the book balance of ${fmtQ(r.oldBalance)} ${r.uom}. Please recheck the physical count and material selection.`,
      });
    }
  }

  // Possible swap: two similar materials (same category, or same UOM when
  // category is unknown) moving sharply in opposite directions.
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const tolA = toleranceForUom(a.uom), tolB = toleranceForUom(b.uom);
      if (a.oldBalance <= tolA || b.oldBalance <= tolB) continue;
      const similar = (a.category && b.category)
        ? a.category === b.category
        : uomEquivalent(a.uom, b.uom);
      if (!similar) continue;
      const ra = a.physicalBase / a.oldBalance;
      const rb = b.physicalBase / b.oldBalance;
      const opposite =
        (ra >= SWAP_RATIO_UP && rb <= SWAP_RATIO_DOWN) ||
        (rb >= SWAP_RATIO_UP && ra <= SWAP_RATIO_DOWN);
      if (opposite) {
        warnings.push({
          code: "POSSIBLE_SWAP",
          rowKeys: [a.key, b.key],
          message: `Large variance detected. Please recheck the physical count and material selection. The entered figures for ${a.label} (${fmtQ(a.oldBalance)} → ${fmtQ(a.physicalBase)} ${a.uom}) and ${b.label} (${fmtQ(b.oldBalance)} → ${fmtQ(b.physicalBase)} ${b.uom}) may have been interchanged.`,
        });
      }
    }
  }
  return warnings;
}

// ── Draft / approval statuses ────────────────────────────────────────────────
export const RECONCILIATION_STATUSES = ["draft", "submitted", "posted", "rejected"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];
export const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted for Approval",
  posted: "Posted",
  rejected: "Rejected/Returned",
};

// ── UOM normalisation ────────────────────────────────────────────────────────
// Small, conservative alias groups. Anything not listed compares by
// case-insensitive trimmed string only.
const UOM_ALIASES: Record<string, string> = {
  mt: "ton", ton: "ton", tons: "ton", tonne: "ton", tonnes: "ton", "m.t": "ton", "m.t.": "ton",
  l: "l", ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  cft: "cft", "cu.ft": "cft", "cu ft": "cft",
  cum: "cum", "m3": "cum", "m³": "cum", "cu.m": "cum",
  barrel: "barrel", barrels: "barrel", drum: "barrel", drums: "barrel",
  bag: "bag", bags: "bag",
  kg: "kg", kgs: "kg",
  unit: "unit", units: "unit", nos: "unit", no: "unit",
};

// ── Numeric normalisation (single source for display AND arithmetic) ────────
//
// PostgreSQL returns NUMERIC/DECIMAL columns as strings (deliberately, to
// avoid float precision loss), so any API-sourced stock value may be a string
// like "12.500" — calling .toFixed() on it crashes. These two helpers are the
// only sanctioned way to consume such values:
//
//  • toFiniteNumber — CALCULATION-safe: returns a finite number, or null for
//    missing/invalid input. It never substitutes zero for bad data; callers
//    must check for null and block the calculation. Valid zero ("0", "0.000",
//    0) IS zero — the zero-vs-missing distinction is preserved.
//  • formatQty — DISPLAY-safe: renders invalid/missing values as "—" and
//    valid numbers via toFixed + en-IN locale. Never use it to feed arithmetic.

/** Calculation-safe: number | numeric string → finite number; anything else → null. */
export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Display-safe: invalid/missing → "—"; valid → localized fixed-decimal string. */
export function formatQty(v: unknown, decimals = 3): string {
  const n = toFiniteNumber(v);
  if (n === null) return "—";
  return Number(n.toFixed(decimals)).toLocaleString("en-IN");
}

export function normalizeUom(uom: string | null | undefined): string {
  const key = (uom ?? "").trim().toLowerCase();
  return UOM_ALIASES[key] ?? key;
}

export function uomEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeUom(a);
  const nb = normalizeUom(b);
  return na !== "" && na === nb;
}

// ── Conversion resolution ────────────────────────────────────────────────────
export interface MaterialConversionConfig {
  conversionFactor: number | null;
  conversionFromUom: string | null; // e.g. "CFT"
  conversionToUom: string | null;   // e.g. "Ton"
}

export type ResolvedConversion =
  | { kind: "same"; factor: 1 }
  | { kind: "multiply"; factor: number }  // base = source × factor
  | { kind: "divide"; factor: number }    // base = source ÷ factor
  | null;                                  // no valid conversion — BLOCKS posting

/**
 * Resolve how to convert a physical count in `sourceUom` into the stock's
 * base `stockUom`, using ONLY the material's configured conversion.
 * Returns null when no valid configured conversion exists.
 */
export function resolveConversion(
  material: MaterialConversionConfig,
  sourceUom: string,
  stockUom: string,
): ResolvedConversion {
  if (uomEquivalent(sourceUom, stockUom)) return { kind: "same", factor: 1 };

  // Calculation-safe normalisation: a numeric-string factor from the DB is
  // accepted; missing/invalid factors resolve to null (blocks posting) —
  // never silently to zero.
  const factor = toFiniteNumber(material.conversionFactor as unknown);
  if (factor === null || !(factor > 0) || !material.conversionFromUom || !material.conversionToUom) {
    return null;
  }
  // Configured as from → to (multiply by factor).
  if (uomEquivalent(material.conversionFromUom, sourceUom) && uomEquivalent(material.conversionToUom, stockUom)) {
    return { kind: "multiply", factor };
  }
  // Configured the other way round (divide by factor).
  if (uomEquivalent(material.conversionFromUom, stockUom) && uomEquivalent(material.conversionToUom, sourceUom)) {
    return { kind: "divide", factor };
  }
  return null;
}

export function convertToBase(sourceQty: number, conv: Exclude<ResolvedConversion, null>): number {
  const raw = conv.kind === "divide" ? sourceQty / conv.factor : sourceQty * conv.factor;
  return round6(raw);
}

export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

// ── Adjustment maths ─────────────────────────────────────────────────────────
export function computeAdjustment(systemBalance: number, physicalBase: number): number {
  return round6(physicalBase - systemBalance);
}

/**
 * "Verified — no adjustment" test. When a UOM is given, its configured
 * rounding tolerance applies (e.g. 5 kg on tonnage, 0.5 L on litres); the
 * tolerance only absorbs rounding dust, never a meaningful variance.
 */
export function isNoChange(adjustment: number, uom?: string | null): boolean {
  return Math.abs(adjustment) < (uom !== undefined ? toleranceForUom(uom) : ADJUSTMENT_TOLERANCE);
}

// ── Session summary ──────────────────────────────────────────────────────────
export interface SummaryInputItem {
  adjustment: number;
  physicalBase: number;
  conversionMissing?: boolean;
}

export interface ReconciliationSummary {
  reviewed: number;
  unchanged: number;
  increased: number;
  decreased: number;
  zeroed: number;              // physical count entered as zero
  conversionWarnings: number;  // rows blocked by missing conversion
}

export function summarizeSession(items: SummaryInputItem[]): ReconciliationSummary {
  const s: ReconciliationSummary = {
    reviewed: items.length, unchanged: 0, increased: 0, decreased: 0, zeroed: 0, conversionWarnings: 0,
  };
  for (const it of items) {
    if (it.conversionMissing) { s.conversionWarnings++; continue; }
    if (isNoChange(it.adjustment)) s.unchanged++;
    else if (it.adjustment > 0) s.increased++;
    else s.decreased++;
    if (Math.abs(it.physicalBase) < ADJUSTMENT_TOLERANCE) s.zeroed++;
  }
  return s;
}
