// ─── Instruction 031: shared DPR ↔ programme-bar linking logic ───────────────
// Single source of truth used by BOTH DPR entry screens (SiteEntry "Detailed"
// and GuidedDpr "Guided") AND the server-side validator, so the rules can never
// drift apart between separately-maintained copies (the Work Programme overlap
// check already suffered that fate once — see workTypeRecipes/programmeSequencer).
//
// Covers: DPR-side normalisation, chainage containment, auto-match candidate
// selection (Part C), bar-scoped balance figures (Part D), and the per-row
// validation used by validateProgressProgrammeLinks (Parts B/F/G), including
// draft-lenient mode so drafts keep their programmeBarId (Part B) while final
// submission stays strict.

import {
  isBarSide,
  isDprSideCompatible,
  barSideLabel,
  parseChainageKm,
  type BarSide,
} from "./barSide";

/** Minimal bar shape the link logic needs (subset of work_program_bars / PickerBar). */
export type LinkableBar = {
  id: number;
  boqItemId?: number;
  side: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  startDate?: string | null;
  endDate?: string | null;
  planningMode?: string | null;
  plannedQty?: number;
  reportedQty?: number;
  remainingQty?: number;
  unit?: string | null;
};

/**
 * Normalise a DPR side value (display label "LHS" / "Full Width", or key
 * "lhs") to the canonical BarSide key. Returns null for empty input.
 * Mirrors — and now replaces — the inline normalisation previously embedded
 * in server/routes.ts validateProgressProgrammeLinks.
 */
export function normalizeDprSideKey(raw: string | null | undefined): BarSide | string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  if (isBarSide(s)) return s;
  const lower = s.toLowerCase();
  if (lower === "lhs") return "lhs";
  if (lower === "rhs") return "rhs";
  if (/full/i.test(s)) return "full_width";
  if (/both/i.test(s)) return "both_sides";
  return lower.replace(/\s+/g, "_");
}

/** True when the entered km range falls (even partly) outside the bar's planned range. */
export function chainageOutsideBar(
  fromKm: number | null | undefined,
  toKm: number | null | undefined,
  bar: Pick<LinkableBar, "chainageFrom" | "chainageTo">,
  epsilon = 1e-6,
): boolean {
  if (fromKm == null || toKm == null) return false; // incomplete ≠ outside
  if (bar.chainageFrom == null || bar.chainageTo == null) return false;
  return fromKm < bar.chainageFrom - epsilon || toKm > bar.chainageTo + epsilon;
}

// ─── Guided DPR "Today's likely activities" (role-independent by design) ─────

/**
 * Compute the suggested programme bars for a Guided DPR date/site.
 *
 * Deliberately depends ONLY on:
 *  - the site's programme bars (road bars — no structureId),
 *  - the report date vs each bar's start/end window (inclusive),
 *  - bars already reported today (any DPR) or already added to the open form.
 *
 * There is intentionally NO role/user/engineer parameter: Admin, PM and Site
 * Engineer viewing the same site/date always get identical suggestions
 * (subject only to which sites they can access at all).
 */
export function suggestGuidedBars<T extends { id: number; structureId?: string | null; startDate?: string | null; endDate?: string | null }>(
  bars: T[],
  date: string,
  reportedBarIds: ReadonlySet<number>,
  formLinkedBarIds: ReadonlySet<number>,
): T[] {
  return bars
    .filter((b) => !b.structureId) // road bars only on this screen
    .filter((b) => !!b.startDate && !!b.endDate && date >= b.startDate! && date <= b.endDate!)
    .filter((b) => !reportedBarIds.has(b.id))
    .filter((b) => !formLinkedBarIds.has(b.id));
}

/**
 * Classify why the suggestion list is empty, so the UI never claims
 * "everything planned is already reported" unless the data supports it.
 */
export function emptySuggestionsReason(
  bars: Array<{ id: number; structureId?: string | null; startDate?: string | null; endDate?: string | null }>,
  date: string,
): "no_programme" | "no_date_coverage" | "all_reported" {
  const roadBars = bars.filter((b) => !b.structureId);
  if (roadBars.length === 0) return "no_programme";
  const covering = roadBars.filter((b) => !!b.startDate && !!b.endDate && date >= b.startDate! && date <= b.endDate!);
  if (covering.length === 0) return "no_date_coverage";
  return "all_reported";
}

// ─── Part C: automatic programme-bar matching (build once, use in both) ──────

export type AutoMatchInput = {
  dprDate?: string | null;      // yyyy-MM-dd; bars not active on this date are de-prioritised
  sideKey?: string | null;      // normalised DPR side key (or null if not yet chosen)
  fromKm?: number | null;
  toKm?: number | null;
};

export type AutoMatchResult =
  | { kind: "auto"; bar: LinkableBar; candidates: LinkableBar[] }
  | { kind: "choose"; candidates: LinkableBar[] }
  | { kind: "none"; candidates: LinkableBar[] };

function isBarActiveOn(bar: LinkableBar, date: string | null | undefined): boolean {
  if (!date || !bar.startDate || !bar.endDate) return true;
  return date >= bar.startDate && date <= bar.endDate;
}

/**
 * Compatibility for the PRIMARY candidate list: side-compatible AND (when a
 * chainage range is entered) containing that range. Incompatible-side bars are
 * excluded entirely (reachable only via an explicit "Show other reaches" UI).
 */
export function isBarCompatible(bar: LinkableBar, input: AutoMatchInput): boolean {
  if (input.sideKey && !isDprSideCompatible(bar.side, input.sideKey)) return false;
  // Reverse check: if the bar is side-specific and the user picked an
  // incompatible side, exclude. If user picked no side yet, side-specific bars
  // remain candidates (side gets prefilled from the bar on link).
  if (input.fromKm != null && input.toKm != null) {
    if (chainageOutsideBar(input.fromKm, input.toKm, bar)) return false;
  } else if (input.fromKm != null) {
    if (bar.chainageFrom != null && bar.chainageTo != null) {
      const eps = 1e-6;
      if (input.fromKm < bar.chainageFrom - eps || input.fromKm > bar.chainageTo + eps) return false;
    }
  }
  return true;
}

/**
 * Part C matching: exactly one compatible bar (preferring bars active on the
 * DPR date) → auto-link; several → user picks among them; none → unplanned.
 */
export function autoMatchBar(bars: LinkableBar[], input: AutoMatchInput): AutoMatchResult {
  const compatible = bars.filter((b) => isBarCompatible(b, input));
  const active = compatible.filter((b) => isBarActiveOn(b, input.dprDate));
  const pool = active.length > 0 ? active : compatible;
  if (pool.length === 1) return { kind: "auto", bar: pool[0], candidates: compatible };
  if (pool.length > 1) return { kind: "choose", candidates: pool };
  return { kind: "none", candidates: [] };
}

// ─── Part D: bar-scoped balance figures ──────────────────────────────────────

export type BalanceFigures = { currentQty: number; totalActual: number; balance: number; unit: string };

/** Balance figures scoped to ONE bar (from /api/dpr/programme-bars fields). */
export function barBalanceFigures(bar: LinkableBar): BalanceFigures | null {
  if (bar.plannedQty == null) return null;
  const reported = bar.reportedQty ?? 0;
  return {
    currentQty: Math.round(bar.plannedQty * 1000) / 1000,
    totalActual: Math.round(reported * 1000) / 1000,
    balance: Math.round((bar.remainingQty ?? Math.max(0, bar.plannedQty - reported)) * 1000) / 1000,
    unit: bar.unit ?? "",
  };
}

// ─── Parts B/F: per-row programme-link validation (client preview + server) ──

export type LinkRowInput = {
  activity?: string | null;
  side?: string | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  chainageFromKm?: number | null;
  chainageToKm?: number | null;
  chainageOverrideReason?: string | null;
  boqItemId?: number | null;
};

export type LinkRowOptions = {
  /**
   * Draft-lenient mode (Part B/F): a draft may be saved with incomplete
   * chainage or a still-missing out-of-range reason WITHOUT losing its
   * programmeBarId. Structural errors (wrong project/item, side conflict on an
   * explicitly-chosen side) still fail even for drafts.
   */
  draft?: boolean;
};

/**
 * Validates one progress row against its linked bar. Returns an error message
 * or null. This is the exact rule set the server enforces — run it client-side
 * first for friendly messaging, but never rely on UI-only validation.
 */
export function checkProgrammeLinkRow(
  row: LinkRowInput,
  bar: LinkableBar,
  opts: LinkRowOptions = {},
): string | null {
  const name = row.activity ?? "";
  const draft = opts.draft === true;

  // Side compatibility — an explicitly stated side must always be compatible,
  // draft or not (a wrong side is a structural error, not an incomplete field).
  const dprSideKey = normalizeDprSideKey(row.side);
  const plannedSide = bar.side ?? null;
  if (plannedSide) {
    if (!dprSideKey) {
      if (!draft) {
        return `Progress entry "${name}": the selected bar is planned ${barSideLabel(plannedSide)} — the DPR entry must state the executed side explicitly`;
      }
    } else if (!isDprSideCompatible(plannedSide, dprSideKey)) {
      return `Progress entry "${name}": executed side ${barSideLabel(dprSideKey)} is not compatible with the bar's planned side ${barSideLabel(plannedSide)}`;
    }
  } else if (!dprSideKey && !draft && bar.planningMode !== "structure_location") {
    // Batch 1: actual execution side is mandatory for road/linear progress on
    // final submission even when the bar's own planned side is unspecified
    // (legacy "Side Review Required" bars) — never infer or default a side.
    return `Progress entry "${name}": the actual execution side (LHS / RHS / Both Sides / Full Width) is required for programme-linked road work`;
  }

  // Chainage validity for linear work.
  const isPointWork = bar.planningMode === "structure_location";
  if (!isPointWork) {
    const fromKm = row.chainageFromKm != null ? Number(row.chainageFromKm) : parseChainageKm(row.chainageFrom);
    const toKm = row.chainageToKm != null ? Number(row.chainageToKm) : parseChainageKm(row.chainageTo);
    if (fromKm == null || toKm == null) {
      if (draft) return null; // incomplete draft rows keep their link (Part B)
      return `Progress entry "${name}": chainage From and To are required for linear work against a programme bar`;
    }
    if (!(toKm > fromKm)) {
      if (draft) return null;
      return `Progress entry "${name}": chainage To must be greater than From`;
    }
    if (chainageOutsideBar(fromKm, toKm, bar)) {
      const reason = (row.chainageOverrideReason ?? "").toString().trim();
      if (!reason && !draft) {
        return `Progress entry "${name}": actual range Km ${fromKm}–${toKm} lies outside the bar's planned range Km ${bar.chainageFrom}–${bar.chainageTo}. Enter an override reason to record a legitimate extension.`;
      }
    }
  }
  return null;
}

// ─── Part G: review-required derivation ──────────────────────────────────────

export const CHAINAGE_REVIEW_REQUIRED = "review_required";
export const CHAINAGE_REVIEW_APPROVED = "approved";

/**
 * A linked row whose complete chainage range falls outside the bar is marked
 * "Outside planned reach — review required": it is preserved with its reason
 * but does NOT count toward the bar's completed quantity until reviewed.
 */
export function deriveChainageReviewStatus(
  row: LinkRowInput,
  bar: LinkableBar | null | undefined,
): string | null {
  if (!bar) return null;
  if (bar.planningMode === "structure_location") return null;
  const fromKm = row.chainageFromKm != null ? Number(row.chainageFromKm) : parseChainageKm(row.chainageFrom);
  const toKm = row.chainageToKm != null ? Number(row.chainageToKm) : parseChainageKm(row.chainageTo);
  return chainageOutsideBar(fromKm, toKm, bar) ? CHAINAGE_REVIEW_REQUIRED : null;
}

// (The old suggestQuantitySource UOM-guessing helper was removed: quantity
// source is now real, verified state — see shared/dprGeometry.ts.)

// ─── Batch 1 Part E: per-side chainage coverage (shared qty, separate coverage) ──
// Quantity draw-down against a bar is SHARED across sides (one remainingQty),
// but chainage COVERAGE is side-specific: LHS progress must never mark RHS
// chainage covered. Coverage is derived purely from each progress entry's own
// side + chainage — no per-side planned-quantity schema exists or is wanted.

export type CoverageEntry = {
  side: string | null | undefined;       // label ("LHS") or key ("lhs")
  fromKm: number | null | undefined;
  toKm: number | null | undefined;
  layerNo?: number | null | undefined;
};

export type BarSideCoverageSummary = {
  /** Merged covered km intervals per carriageway side (clipped to the bar). */
  lhs: Array<[number, number]>;
  rhs: Array<[number, number]>;
  lhsCoveredKm: number;
  rhsCoveredKm: number;
  /** Fraction (0..1) of the bar's own range covered, per side. */
  lhsFraction: number;
  rhsFraction: number;
  /**
   * True only when the bar's planned range is fully accounted for under its
   * own side rule: LHS bar → LHS coverage; RHS bar → RHS; Both-Sides /
   * Full-Width bar → BOTH sides jointly (either via one-sided entries on each
   * side or explicit Both-Sides/Full-Width entries, which count on both).
   */
  fullyCovered: boolean;
};

export type LayerSideCoverage = BarSideCoverageSummary & {
  layerNo: number | null;
};

export type BarSideCoverage = BarSideCoverageSummary & {
  /**
   * Present only when at least one entry has an explicit layer/lift number.
   * With no planned layer count, each recorded layer is reported separately
   * and aggregate fullyCovered is deliberately suppressed.
   */
  byLayer?: LayerSideCoverage[];
};

const COVER_EPS = 1e-6;

function mergeIntervals(list: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + COVER_EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function intervalsLength(list: Array<[number, number]>): number {
  return list.reduce((s, [a, b]) => s + (b - a), 0);
}

function computeSideCoverage(
  bar: Pick<LinkableBar, "side" | "chainageFrom" | "chainageTo">,
  entries: CoverageEntry[],
): BarSideCoverageSummary {
  const barFrom = bar.chainageFrom;
  const barTo = bar.chainageTo;
  const lhsRaw: Array<[number, number]> = [];
  const rhsRaw: Array<[number, number]> = [];
  for (const e of entries) {
    if (e.fromKm == null || e.toKm == null) continue; // no chainage → no coverage claim
    let a = Math.min(Number(e.fromKm), Number(e.toKm));
    let b = Math.max(Number(e.fromKm), Number(e.toKm));
    if (!Number.isFinite(a) || !Number.isFinite(b) || b - a <= COVER_EPS) continue;
    // Clip to the bar's own planned range when known.
    if (barFrom != null && barTo != null) {
      a = Math.max(a, Math.min(barFrom, barTo));
      b = Math.min(b, Math.max(barFrom, barTo));
      if (b - a <= COVER_EPS) continue;
    }
    const key = normalizeDprSideKey(e.side as string | null | undefined);
    if (key === "lhs" || key === "shoulder_lhs" || key === "service_road_lhs") {
      lhsRaw.push([a, b]);
    } else if (key === "rhs" || key === "shoulder_rhs" || key === "service_road_rhs") {
      rhsRaw.push([a, b]);
    } else if (key === "both_sides" || key === "full_width" || key === "median") {
      // Explicit both/full (or single-corridor median) covers both tracks at once.
      lhsRaw.push([a, b]);
      rhsRaw.push([a, b]);
    }
    // Unknown/blank side: contributes NO coverage — never guess a side.
  }
  const lhs = mergeIntervals(lhsRaw);
  const rhs = mergeIntervals(rhsRaw);
  const span = barFrom != null && barTo != null ? Math.abs(barTo - barFrom) : null;
  const lhsCoveredKm = intervalsLength(lhs);
  const rhsCoveredKm = intervalsLength(rhs);
  const lhsFraction = span ? Math.min(1, lhsCoveredKm / span) : 0;
  const rhsFraction = span ? Math.min(1, rhsCoveredKm / span) : 0;
  const covers = (frac: number) => span != null && span > 0 && frac >= 1 - COVER_EPS;
  const plannedKey = isBarSide(bar.side as string) ? (bar.side as BarSide) : null;
  let fullyCovered: boolean;
  if (span == null || span <= 0) fullyCovered = false;
  else if (plannedKey === "lhs" || plannedKey === "shoulder_lhs" || plannedKey === "service_road_lhs") fullyCovered = covers(lhsFraction);
  else if (plannedKey === "rhs" || plannedKey === "shoulder_rhs" || plannedKey === "service_road_rhs") fullyCovered = covers(rhsFraction);
  else fullyCovered = covers(lhsFraction) && covers(rhsFraction); // both_sides / full_width / median / unknown
  return { lhs, rhs, lhsCoveredKm, rhsCoveredKm, lhsFraction, rhsFraction, fullyCovered };
}

export function barSideCoverage(
  bar: Pick<LinkableBar, "side" | "chainageFrom" | "chainageTo">,
  entries: CoverageEntry[],
): BarSideCoverage {
  const aggregate = computeSideCoverage(bar, entries);
  const hasExplicitLayers = entries.some((entry) => entry.layerNo != null);
  if (!hasExplicitLayers) return aggregate;

  const grouped = new Map<number | null, CoverageEntry[]>();
  for (const entry of entries) {
    const layerNo = entry.layerNo == null ? null : Number(entry.layerNo);
    const group = grouped.get(layerNo) ?? [];
    group.push(entry);
    grouped.set(layerNo, group);
  }
  const byLayer = Array.from(grouped.entries())
    .sort(([a], [b]) => a == null ? 1 : b == null ? -1 : a - b)
    .map(([layerNo, layerEntries]) => ({
      layerNo,
      ...computeSideCoverage(bar, layerEntries),
    }));

  return {
    ...aggregate,
    // No required-layer count exists, so an aggregate "fully covered" claim
    // would imply completion beyond the recorded layer evidence.
    fullyCovered: false,
    byLayer,
  };
}
