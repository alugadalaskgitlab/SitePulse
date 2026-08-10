/**
 * shared/progressReport.ts — Batch 06: RA-style Progress Report logic.
 *
 * READ-ONLY reporting helpers shared by the server report/export endpoints
 * and the Progress Report page, so screen and Excel always agree.
 *
 * Quantity semantics (Batch 04, unchanged):
 *  - progress_entries.quantity / dpr_structure_items.quantity store the
 *    PHYSICAL measurement in the field unit.
 *  - BOQ-credit qty = physical qty × dprConversionFactor (?? 1), applied
 *    exactly once — same rule as resolveDprConversionFactor / the existing
 *    cumulative SQL. Structure rows may carry a row-level factor override
 *    (COALESCE(row factor, item factor, 1) — same as getPlanVsActual).
 *
 * CRITICAL (§9): running cumulative is computed CHRONOLOGICALLY and attached
 * to rows BEFORE any display sort. Display sorting never recomputes it.
 */

import { resolveDprConversionFactor, geometryQtyForRow, quantitiesMatch, resolveBoqUomProfile } from "./dprGeometry";

// ── Types ────────────────────────────────────────────────────────────────────

export type ReportBoqItem = {
  id: number;
  itemCode?: string | null;
  description: string;
  displayName?: string | null;
  unit: string;
  /** Contract BOQ Qty — original contract quantity (boq_items.boq_qty). */
  boqQty: number | null;
  dprConversionFactor?: number | null;
  dprMeasurementMethod?: string | null;
  sortOrder?: number | null;
};

export type ReportEntry = {
  /** "progress" = progress_entries row, "structure" = dpr_structure_items row */
  kind: "progress" | "structure";
  entryId: number;
  dprId: number;
  /** DPR date, YYYY-MM-DD */
  dprDate: string;
  submittedAt?: string | null;
  site?: string | null;
  engineer?: string | null;
  boqItemId: number;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  chainageFromKm?: number | null;
  chainageToKm?: number | null;
  side?: string | null;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
  /** Physical measured quantity (stored value — never rewritten). */
  quantity: number | null;
  uom?: string | null;
  quantitySource?: string | null;
  quantitySourceNote?: string | null;
  /** Structure/manual location reference (structure name / item of work). */
  location?: string | null;
  remarks?: string | null;
  /** Structure rows may override the item conversion factor. */
  rowConversionFactor?: number | null;
};

export type ComputedEntry = ReportEntry & {
  /** BOQ-credit qty = physical × factor (exactly once). Null when quantity null. */
  boqCreditQty: number | null;
  /** Chronological running BOQ-credit cumulative INCLUDING this row. */
  runningCumulative: number;
  /** True when factor ≠ 1 (physical and BOQ qty genuinely differ). */
  converted: boolean;
  /** Historical/ambiguous row — surfaced, never silently corrected. */
  reviewFlag: string | null;
  /** Advisory possible-overlap notes (never changes quantities). */
  overlaps: OverlapNote[];
};

export type OverlapNote = {
  withDprId: number;
  withEntryId: number;
  side: string | null;
  fromKm: number;
  toKm: number;
};

export type ItemAbstract = {
  boqItemId: number;
  contractQty: number;
  previousQty: number;
  thisPeriodQty: number;
  cumulativeQty: number;
  balanceQty: number | null;
  /** null when contract qty is 0/absent (cannot divide). */
  pctComplete: number | null;
  dprCount: number;
  entryCount: number;
  reviewCount: number;
  overlapCount: number;
};

// ── Factor / credit (single rule, reused) ───────────────────────────────────

export function entryConversionFactor(entry: ReportEntry, item: ReportBoqItem | undefined): number {
  const rf = entry.rowConversionFactor;
  if (typeof rf === "number" && Number.isFinite(rf) && rf > 0) return rf;
  return resolveDprConversionFactor(item ?? null);
}

export function entryBoqCredit(entry: ReportEntry, item: ReportBoqItem | undefined): number | null {
  if (entry.quantity == null || !Number.isFinite(Number(entry.quantity))) return null;
  return Number(entry.quantity) * entryConversionFactor(entry, item);
}

// ── Chronological ordering (§9) ─────────────────────────────────────────────

/**
 * Execution chronology: DPR date, then DPR id (stable proxy for creation
 * order within a day), then row id. Independent of any display sort.
 */
export function chronologicalCompare(a: ReportEntry, b: ReportEntry): number {
  if (a.dprDate !== b.dprDate) return a.dprDate < b.dprDate ? -1 : 1;
  if (a.dprId !== b.dprId) return a.dprId - b.dprId;
  if (a.kind !== b.kind) return a.kind === "progress" ? -1 : 1;
  return a.entryId - b.entryId;
}

// ── Historical honesty (§5) ─────────────────────────────────────────────────

const MANUAL_SOURCES = new Set(["measured", "survey", "weighment_mt", "other"]);

/**
 * Flag ambiguous historical rows. Never rewrites anything.
 *  - missing quantity → review
 *  - geometry item whose stored qty disagrees with its own recorded
 *    dimensions AND carries no manual source explaining the difference
 *    (pre-Batch-04 rows) → review
 */
export function entryReviewFlag(entry: ReportEntry, item: ReportBoqItem | undefined): string | null {
  if (entry.quantity == null) return "Review quantity — no quantity recorded";
  if (entry.kind === "structure") return null; // manual by definition
  if (entry.quantitySource && MANUAL_SOURCES.has(entry.quantitySource)) return null;
  const prof = resolveBoqUomProfile(item ?? null);
  if (prof.dims.length === 0) return null; // manual-method item — nothing to recompute
  const calc = geometryQtyForRow(entry, item ?? null);
  if (calc == null) return null; // dimensions insufficient — cannot judge
  if (!quantitiesMatch(Number(entry.quantity), calc)) {
    return `Review quantity — stored ${Number(entry.quantity)} differs from recorded dimensions (${calc.toFixed(3)})`;
  }
  return null;
}

// ── Possible-overlap detection (§14) — advisory only ────────────────────────

const KM_EPS = 1e-6;

type SideNorm = string; // normalised bar-side token or raw lowercase

export function normaliseReportSide(raw: string | null | undefined): SideNorm | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "lhs" || s === "left" || s === "l") return "lhs";
  if (s === "rhs" || s === "right" || s === "r") return "rhs";
  if (s.includes("both")) return "both_sides";
  if (s.includes("full")) return "full_width";
  if (s.includes("median")) return "median";
  return s.replace(/\s+/g, "_");
}

/** Sides can spatially overlap unless they are distinct specific corridors. */
export function sidesMayOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliseReportSide(a);
  const nb = normaliseReportSide(b);
  // Unknown side = conservative: could be anywhere on the corridor.
  if (na == null || nb == null) return true;
  if (na === nb) return true;
  if (na === "both_sides" || na === "full_width" || nb === "both_sides" || nb === "full_width") return true;
  return false; // distinct specific corridors (lhs vs rhs, median vs lhs, …)
}

function kmRange(e: ReportEntry): { from: number; to: number } | null {
  const f = e.chainageFromKm;
  const t = e.chainageToKm;
  if (f == null || t == null || !Number.isFinite(f) || !Number.isFinite(t)) return null;
  return { from: Math.min(f, t), to: Math.max(f, t) };
}

/**
 * Detect possible overlaps among entries of ONE BOQ item. Touching/adjacent
 * ranges do not warn. Returns a map entry-key → advisory notes.
 * O(n log n + k) sweep; never mutates entries or quantities.
 */
export function detectOverlaps(entries: ReportEntry[]): Map<string, OverlapNote[]> {
  const out = new Map<string, OverlapNote[]>();
  const ranged = entries
    .map((e) => ({ e, r: kmRange(e) }))
    .filter((x): x is { e: ReportEntry; r: { from: number; to: number } } => x.r !== null && x.r.to - x.r.from > KM_EPS)
    .sort((a, b) => a.r.from - b.r.from);
  const key = (e: ReportEntry) => `${e.kind}:${e.entryId}`;
  for (let i = 0; i < ranged.length; i++) {
    for (let j = i + 1; j < ranged.length; j++) {
      const A = ranged[i], B = ranged[j];
      if (B.r.from >= A.r.to - KM_EPS) break; // sorted — no further intersections
      if (!sidesMayOverlap(A.e.side, B.e.side)) continue;
      const from = Math.max(A.r.from, B.r.from);
      const to = Math.min(A.r.to, B.r.to);
      if (to - from <= KM_EPS) continue; // adjacent, not overlapping
      const noteA: OverlapNote = { withDprId: B.e.dprId, withEntryId: B.e.entryId, side: B.e.side ?? null, fromKm: from, toKm: to };
      const noteB: OverlapNote = { withDprId: A.e.dprId, withEntryId: A.e.entryId, side: A.e.side ?? null, fromKm: from, toKm: to };
      (out.get(key(A.e)) ?? out.set(key(A.e), []).get(key(A.e))!).push(noteA);
      (out.get(key(B.e)) ?? out.set(key(B.e), []).get(key(B.e))!).push(noteB);
    }
  }
  return out;
}

// ── Per-item computation (§8–§12) ───────────────────────────────────────────

/**
 * Compute BOQ-credit, chronological running cumulative, review flags and
 * overlap notes for one item's entries. Result is in CHRONOLOGICAL order —
 * display sorting must reorder a copy WITHOUT touching runningCumulative.
 */
export function computeItemEntries(entries: ReportEntry[], item: ReportBoqItem | undefined): ComputedEntry[] {
  const chron = [...entries].sort(chronologicalCompare);
  const overlaps = detectOverlaps(entries);
  let running = 0;
  return chron.map((e) => {
    const credit = entryBoqCredit(e, item);
    if (credit != null) running += credit;
    return {
      ...e,
      boqCreditQty: credit,
      runningCumulative: running,
      converted: entryConversionFactor(e, item) !== 1,
      reviewFlag: entryReviewFlag(e, item),
      overlaps: overlaps.get(`${e.kind}:${e.entryId}`) ?? [],
    };
  });
}

/** RA abstract for one item over a From–To reporting period (§12). */
export function computeItemAbstract(
  computed: ComputedEntry[],
  item: ReportBoqItem,
  fromDate: string,
  toDate: string,
): ItemAbstract {
  let previous = 0;
  let period = 0;
  const dprIds = new Set<number>();
  let reviewCount = 0;
  let overlapCount = 0;
  for (const e of computed) {
    if (e.reviewFlag) reviewCount++;
    if (e.overlaps.length) overlapCount++;
    if (e.boqCreditQty == null) continue;
    if (e.dprDate < fromDate) previous += e.boqCreditQty;
    else if (e.dprDate <= toDate) { period += e.boqCreditQty; dprIds.add(e.dprId); }
  }
  const cumulative = previous + period;
  const contractQty = item.boqQty != null && Number.isFinite(item.boqQty) ? Number(item.boqQty) : 0;
  const hasContract = contractQty > 0;
  return {
    boqItemId: item.id,
    contractQty,
    previousQty: previous,
    thisPeriodQty: period,
    cumulativeQty: cumulative,
    balanceQty: hasContract ? contractQty - cumulative : null,
    pctComplete: hasContract ? (cumulative / contractQty) * 100 : null,
    dprCount: dprIds.size,
    entryCount: computed.filter((e) => e.dprDate >= fromDate && e.dprDate <= toDate).length,
    reviewCount,
    overlapCount,
  };
}

// ── Display sorting (§10) — never touches runningCumulative ─────────────────

export type MeasurementSort = "chainage_date" | "date_chainage";

export function sortForDisplay(computed: ComputedEntry[], sort: MeasurementSort): ComputedEntry[] {
  const byChainage = (a: ComputedEntry, b: ComputedEntry) => {
    const ra = kmRange(a); const rb = kmRange(b);
    if (ra && rb && ra.from !== rb.from) return ra.from - rb.from;
    if (ra && !rb) return -1;
    if (!ra && rb) return 1;
    return 0;
  };
  const copy = [...computed];
  if (sort === "chainage_date") {
    copy.sort((a, b) => byChainage(a, b) || chronologicalCompare(a, b));
  } else {
    copy.sort((a, b) => chronologicalCompare(a, b) || byChainage(a, b));
  }
  return copy;
}

// ── Coverage strip (§13) — "DPR recorded here", NOT "complete" ──────────────

export type CoverageSegment = { fromKm: number; toKm: number; state: "recorded" | "overlap" };
export type CoverageStrip = {
  /** normalised corridor label, e.g. "LHS", "RHS", "Both / Full Width", "Median" */
  label: string;
  extentFromKm: number;
  extentToKm: number;
  segments: CoverageSegment[];
};

const CORRIDOR_LABELS: Record<string, string> = {
  lhs: "LHS", rhs: "RHS", both_sides: "Both / Full Width", full_width: "Both / Full Width",
  median: "Median",
};

/**
 * Build per-corridor coverage strips from one item's entries. Segments with
 * ≥2 recorded layers become "overlap" (advisory). Gaps carry no segment.
 * Entries with both_sides/full_width contribute to LHS and RHS strips too.
 */
export function buildCoverageStrips(entries: ReportEntry[]): CoverageStrip[] {
  const ranged = entries
    .map((e) => ({ side: normaliseReportSide(e.side), r: kmRange(e) }))
    .filter((x): x is { side: string | null; r: { from: number; to: number } } => x.r !== null && x.r.to - x.r.from > KM_EPS);
  if (ranged.length === 0) return [];
  const groups = new Map<string, Array<{ from: number; to: number }>>();
  const push = (g: string, r: { from: number; to: number }) => {
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(r);
  };
  for (const { side, r } of ranged) {
    const s = side ?? "full_width";
    if (s === "both_sides" || s === "full_width") { push("lhs", r); push("rhs", r); }
    else push(s, r);
  }
  const extentFrom = Math.min(...ranged.map((x) => x.r.from));
  const extentTo = Math.max(...ranged.map((x) => x.r.to));
  const strips: CoverageStrip[] = [];
  const order = ["lhs", "rhs", "median"];
  const keys = Array.from(groups.keys()).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  for (const g of keys) {
    const ranges = groups.get(g)!;
    // Sweep: coverage count over boundaries
    const pts: Array<{ x: number; d: number }> = [];
    for (const r of ranges) { pts.push({ x: r.from, d: 1 }); pts.push({ x: r.to, d: -1 }); }
    pts.sort((a, b) => a.x - b.x || b.d - a.d);
    const segments: CoverageSegment[] = [];
    let depth = 0; let prevX = pts[0].x;
    for (const p of pts) {
      if (p.x - prevX > KM_EPS && depth > 0) {
        const state: CoverageSegment["state"] = depth >= 2 ? "overlap" : "recorded";
        const last = segments[segments.length - 1];
        if (last && last.state === state && Math.abs(last.toKm - prevX) <= KM_EPS) last.toKm = p.x;
        else segments.push({ fromKm: prevX, toKm: p.x, state });
      }
      depth += p.d;
      prevX = p.x;
    }
    strips.push({
      label: CORRIDOR_LABELS[g] ?? g.toUpperCase(),
      extentFromKm: extentFrom,
      extentToKm: extentTo,
      segments,
    });
  }
  return strips;
}

// ── Chainage-wise filtering (§16) ───────────────────────────────────────────

export function entryIntersectsRange(e: ReportEntry, fromKm: number, toKm: number, side?: string | null): boolean {
  const r = kmRange(e);
  if (!r) return false;
  const lo = Math.min(fromKm, toKm); const hi = Math.max(fromKm, toKm);
  if (r.to <= lo + KM_EPS || r.from >= hi - KM_EPS) return false;
  if (side != null && side !== "" && !sidesMayOverlap(e.side, side)) return false;
  return true;
}
