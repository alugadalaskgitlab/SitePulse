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
 *
 * Batch 06V additions:
 *  - isIncidental / incidentalDescription on ReportEntry
 *  - activity / chainageOverrideReason pass-through for Overlap Review display
 *  - entryBoqCredit returns 0 (not null) for incidental entries
 *  - detectOverlaps excludes incidental entries
 *  - buildCoverageStrips: incidental entries produce "incidental" state (third
 *    treatment, never green/orange); normal recorded segments always win
 *  - OverlapPair type + buildOverlapPairs helper for the Overlap Review panel
 */

import { resolveDprConversionFactor, geometryQtyForRow, quantitiesMatch, resolveBoqUomProfile } from "./dprGeometry";
import { KM_EPS, compareChainageRows, normaliseReportSide, sidesMayOverlap } from "./chainageOverlap";

// Batch 06B: the generic side/interval semantics now live in the neutral
// shared/chainageOverlap.ts module (used by DPR entry + server submit too).
// Re-exported here so existing Progress Report consumers are unchanged.
export { normaliseReportSide, sidesMayOverlap };

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
  /**
   * 06P: optional physical layer/lift number (progress rows only). Pure
   * pass-through for display grouping — NEVER used in any credit/cumulative
   * formula, and null is never coerced to 1.
   */
  layerNo?: number | null;
  /** No physical execution happened; retained for the DPR history only. */
  noSiteWork?: boolean | null;
  noSiteWorkDescription?: string | null;
  /**
   * 06V: when true this row is incidental work — physical quantity is
   * preserved for site records but earns ZERO BOQ credit. Excluded from
   * overlap guard and from normal recorded/overlap coverage depth.
   * Coverage strips show incidental spans as a third state "incidental".
   */
  isIncidental?: boolean | null;
  /** 06V: free-text reason stored with the incidental flag. */
  incidentalDescription?: string | null;
  /**
   * 06V: Activity label (e.g. "BC LAYING"). Pass-through from the DB for
   * Overlap Review display — never used in any quantity formula.
   */
  activity?: string | null;
  /**
   * 06V: Existing chainage-override reason stored on this row, if any
   * (set via SiteEdit when the overlap was accepted). Shown in Overlap Review
   * so reviewers know an entry is already annotated.
   */
  chainageOverrideReason?: string | null;
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

/**
 * 06V: A de-duplicated pair for the Overlap Review panel.
 * Each pair appears exactly once (A has the lower entryId).
 */
export type OverlapPair = {
  /** Side A entry (lower entryId). */
  a: ComputedEntry;
  /** Side B entry (higher entryId). */
  b: ComputedEntry;
  /** The exact overlap segment (km). */
  segFromKm: number;
  segToKm: number;
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
  // Classification wins over any stale physical values on a legacy row.
  if (entry.isIncidental || entry.noSiteWork) return 0;
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
  if (entry.noSiteWork) return null;
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
 *
 * 06V: incidental entries are excluded from overlap detection entirely.
 */
export function detectOverlaps(entries: ReportEntry[]): Map<string, OverlapNote[]> {
  const out = new Map<string, OverlapNote[]>();
  const ranged = entries
    .map((e) => ({ e, r: kmRange(e) }))
    .filter((x): x is { e: ReportEntry; r: { from: number; to: number } } => x.r !== null && x.r.to - x.r.from > KM_EPS);
  const key = (e: ReportEntry) => `${e.kind}:${e.entryId}`;
  for (let i = 0; i < ranged.length; i++) {
    for (let j = i + 1; j < ranged.length; j++) {
      const A = ranged[i], B = ranged[j];
      const pair = compareChainageRows(
        { boqItemId: A.e.boqItemId, side: A.e.side, fromKm: A.r.from, toKm: A.r.to, layerNo: A.e.layerNo, noSiteWork: A.e.noSiteWork, isIncidental: A.e.isIncidental },
        { boqItemId: B.e.boqItemId, side: B.e.side, fromKm: B.r.from, toKm: B.r.to, layerNo: B.e.layerNo, noSiteWork: B.e.noSiteWork, isIncidental: B.e.isIncidental },
      );
      if (!pair) continue;
      const noteA: OverlapNote = { withDprId: B.e.dprId, withEntryId: B.e.entryId, side: B.e.side ?? null, fromKm: pair.segmentFromKm, toKm: pair.segmentToKm };
      const noteB: OverlapNote = { withDprId: A.e.dprId, withEntryId: A.e.entryId, side: A.e.side ?? null, fromKm: pair.segmentFromKm, toKm: pair.segmentToKm };
      (out.get(key(A.e)) ?? out.set(key(A.e), []).get(key(A.e))!).push(noteA);
      (out.get(key(B.e)) ?? out.set(key(B.e), []).get(key(B.e))!).push(noteB);
    }
  }
  return out;
}

/**
 * 06V: Build de-duplicated overlap pairs from computed entries of ONE item.
 * Each physical pair (A, B) appears exactly once (A has the lower entryId).
 * Uses the overlap notes already on each ComputedEntry — always consistent.
 * Returns [] when there are no overlaps.
 */
export function buildOverlapPairs(computed: ComputedEntry[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  const seen = new Set<string>();
  const byKey = new Map<string, ComputedEntry>(
    computed.map((e) => [`${e.kind}:${e.entryId}`, e]),
  );
  for (const e of computed) {
    for (const note of e.overlaps) {
      // Try both "progress" and "structure" key variants for the other entry
      const withKey = byKey.has(`progress:${note.withEntryId}`)
        ? `progress:${note.withEntryId}`
        : `structure:${note.withEntryId}`;
      // De-duplicate: emit the pair only once, with smaller entryId first.
      const [aKey, bKey] = e.entryId < note.withEntryId
        ? [`${e.kind}:${e.entryId}`, withKey]
        : [withKey, `${e.kind}:${e.entryId}`];
      const pairKey = `${aKey}::${bKey}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const aEntry = byKey.get(aKey);
      const bEntry = byKey.get(bKey);
      if (!aEntry || !bEntry) continue;
      pairs.push({ a: aEntry, b: bEntry, segFromKm: note.fromKm, segToKm: note.toKm });
    }
  }
  return pairs;
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

// ── Batch 06P: optional layer/lift breakdown (display grouping ONLY) ────────

export type LayerBreakdownRow = {
  /** null = entries with no layer recorded (never coerced to 1). */
  layerNo: number | null;
  /** Sum of BOQ-credit quantities — a split of the existing total, never a second quantity. */
  qty: number;
  entryCount: number;
};

/**
 * Per-layer split of an item's BOQ-credit quantities. Returns [] unless at
 * least TWO distinct non-null layerNo values were recorded — items that never
 * use layers (or use only one) render exactly as before. When null-layer
 * entries coexist with layered ones, they appear as a layerNo:null row so the
 * breakdown always sums to the existing total. Pure display grouping — no
 * credit/cumulative formula involved.
 */
export function layerBreakdown(computed: ComputedEntry[]): LayerBreakdownRow[] {
  const m = new Map<number | null, { qty: number; entryCount: number }>();
  for (const e of computed) {
    if (e.kind !== "progress" || e.boqCreditQty == null) continue;
    const key = e.layerNo ?? null;
    const cur = m.get(key) ?? { qty: 0, entryCount: 0 };
    cur.qty += e.boqCreditQty;
    cur.entryCount += 1;
    m.set(key, cur);
  }
  const distinctLayers = Array.from(m.keys()).filter((k): k is number => k != null);
  if (distinctLayers.length < 2) return [];
  return Array.from(m.entries())
    .map(([layerNo, v]) => ({ layerNo, qty: v.qty, entryCount: v.entryCount }))
    .sort((a, b) => (a.layerNo == null ? 1 : b.layerNo == null ? -1 : a.layerNo - b.layerNo));
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

/**
 * 06V: Three possible states:
 *  "recorded"   — normal work, in-scope, at least one non-incidental entry
 *  "overlap"    — ≥2 non-incidental entries at this chainage (advisory)
 *  "incidental" — only incidental entries here; no BOQ credit accrues
 *                 (never green or orange — distinct hatched treatment)
 */
export type CoverageSegment = { fromKm: number; toKm: number; state: "recorded" | "overlap" | "incidental" };
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
 *
 * 06V: incidental entries are tracked separately. Their physical span is shown
 * as a third state "incidental" in the strip, but does NOT count toward normal
 * recorded/overlap depth. Where a normal recorded span and an incidental span
 * coincide, the recorded state wins (the incidental segment is only emitted for
 * sub-ranges not covered by any normal entry).
 */
export function buildCoverageStrips(entries: ReportEntry[]): CoverageStrip[] {
  const normalEntries = entries.filter((e) => !e.isIncidental && !e.noSiteWork);
  const incidentalEntries = entries.filter((e) => !!e.isIncidental && !e.noSiteWork);

  // Helper: range mapper for one set of entries
  const toRanged = (es: ReportEntry[]) =>
    es
      .map((e) => ({ e, side: normaliseReportSide(e.side), r: kmRange(e) }))
      .filter((x): x is { e: ReportEntry; side: string | null; r: { from: number; to: number } } => x.r !== null && x.r.to - x.r.from > KM_EPS);

  const normalRanged = toRanged(normalEntries);
  const incidentalRanged = toRanged(incidentalEntries);
  const allRanged = [...normalRanged, ...incidentalRanged];

  if (allRanged.length === 0) return [];

  // Group normal and incidental ranges by corridor separately
  type GroupMap = Map<string, Array<{ from: number; to: number }>>;
  const normalGroups: GroupMap = new Map();
  const incidentalGroups: GroupMap = new Map();
  const overlapGroups: GroupMap = new Map();

  const pushTo = (map: GroupMap, g: string, r: { from: number; to: number }) => {
    (map.get(g) ?? map.set(g, []).get(g)!).push(r);
  };

  for (const { side, r } of normalRanged) {
    const s = side ?? "full_width";
    if (s === "both_sides" || s === "full_width") { pushTo(normalGroups, "lhs", r); pushTo(normalGroups, "rhs", r); }
    else pushTo(normalGroups, s, r);
  }
  for (const { side, r } of incidentalRanged) {
    const s = side ?? "full_width";
    if (s === "both_sides" || s === "full_width") { pushTo(incidentalGroups, "lhs", r); pushTo(incidentalGroups, "rhs", r); }
    else pushTo(incidentalGroups, s, r);
  }
  const corridors = (side: string | null): string[] => {
    const s = side ?? "full_width";
    return s === "both_sides" || s === "full_width" ? ["lhs", "rhs"] : [s];
  };
  for (let i = 0; i < normalRanged.length; i++) {
    for (let j = i + 1; j < normalRanged.length; j++) {
      const A = normalRanged[i], B = normalRanged[j];
      const pair = compareChainageRows(
        { boqItemId: A.e.boqItemId, side: A.e.side, fromKm: A.r.from, toKm: A.r.to, layerNo: A.e.layerNo },
        { boqItemId: B.e.boqItemId, side: B.e.side, fromKm: B.r.from, toKm: B.r.to, layerNo: B.e.layerNo },
      );
      if (!pair) continue;
      const commonCorridors = corridors(A.side).filter((g) => corridors(B.side).includes(g));
      for (const g of commonCorridors) {
        pushTo(overlapGroups, g, { from: pair.segmentFromKm, to: pair.segmentToKm });
      }
    }
  }

  // All corridor keys (union of normal and incidental)
  const allGroupKeys = new Set([
    ...Array.from(normalGroups.keys()),
    ...Array.from(incidentalGroups.keys()),
  ]);

  const extentFrom = Math.min(...allRanged.map((x) => x.r.from));
  const extentTo = Math.max(...allRanged.map((x) => x.r.to));
  const strips: CoverageStrip[] = [];
  const order = ["lhs", "rhs", "median"];
  const keys = Array.from(allGroupKeys).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });

  /** Sweep a set of ranges to produce boundary-event list. */
  const sweepPts = (ranges: Array<{ from: number; to: number }>): Array<{ x: number; d: number }> => {
    const pts: Array<{ x: number; d: number }> = [];
    for (const r of ranges) { pts.push({ x: r.from, d: 1 }); pts.push({ x: r.to, d: -1 }); }
    pts.sort((a, b) => a.x - b.x || b.d - a.d);
    return pts;
  };

  for (const g of keys) {
    const normalRanges = normalGroups.get(g) ?? [];
    const incRanges = incidentalGroups.get(g) ?? [];
    const overlapRanges = overlapGroups.get(g) ?? [];

    const normalPts = sweepPts(normalRanges);
    const incPts = sweepPts(incRanges);
    const overlapPts = sweepPts(overlapRanges);

    // Collect all boundary X values from both sweeps
    const allX = Array.from(new Set([...normalPts.map((p) => p.x), ...incPts.map((p) => p.x), ...overlapPts.map((p) => p.x)])).sort((a, b) => a - b);
    if (allX.length === 0) continue;

    let normalDepth = 0;
    let incDepth = 0;
    let overlapDepth = 0;
    let ni = 0; // index into normalPts
    let ii = 0; // index into incPts
    let oi = 0; // index into overlapPts

    const segments: CoverageSegment[] = [];

    for (let xi = 0; xi < allX.length - 1; xi++) {
      const x = allX[xi];
      const xNext = allX[xi + 1];

      // Apply all events at x to get depths for interval [x, xNext]
      while (ni < normalPts.length && normalPts[ni].x <= x) { normalDepth += normalPts[ni].d; ni++; }
      while (ii < incPts.length && incPts[ii].x <= x) { incDepth += incPts[ii].d; ii++; }
      while (oi < overlapPts.length && overlapPts[oi].x <= x) { overlapDepth += overlapPts[oi].d; oi++; }

      if (xNext - x <= KM_EPS) continue;

      let state: CoverageSegment["state"] | null = null;
      if (overlapDepth > 0) state = "overlap";
      else if (normalDepth > 0) state = "recorded";
      else if (incDepth > 0) state = "incidental";
      // else: gap — no segment

      if (state != null) {
        const last = segments[segments.length - 1];
        if (last && last.state === state && Math.abs(last.toKm - x) <= KM_EPS) last.toKm = xNext;
        else segments.push({ fromKm: x, toKm: xNext, state });
      }
    }

    if (segments.length > 0) {
      strips.push({
        label: CORRIDOR_LABELS[g] ?? g.toUpperCase(),
        extentFromKm: extentFrom,
        extentToKm: extentTo,
        segments,
      });
    }
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
