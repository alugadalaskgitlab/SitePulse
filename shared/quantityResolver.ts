/**
 * Batch 01 — Central Eligible-Quantity Resolver (foundation only).
 *
 * ONE reusable place for resolving a BOQ item's contractual quantity, scope
 * eligibility and quantity-allocation basis. Batch 01 implements ONLY the
 * calculation bases that already shipped — it changes no numbers anywhere.
 *
 * Existing bases centralised here (behaviour-preserving extraction from
 * shared/programmeSequencer.ts):
 *
 *  1. LEGACY LENGTH SHARE (no scope restriction for the item):
 *       qty = totalQty × (stretchLen / roadLengthKm) × sideFraction
 *     manualQtyFraction (stretch-level, 0..1) bypasses the whole formula:
 *       qty = totalQty × manualQtyFraction
 *
 *  2. SCOPE-PROPORTIONAL (Instruction 032 — item has scope restrictions):
 *       qty(sub-range) = totalQty × eligibleSideLen(sub-range) / contractualTotal
 *     where contractualTotal = Σ over stretches of coverage.contractualSideLenKm
 *     (contractual = eligible + temporarily-blocked; excludes no_scope and
 *     withdrawn). manualQtyFraction instead fixes the stretch total at
 *     totalQty × fraction and distributes it across eligible sub-ranges by
 *     eligible side-length.
 *
 * Allocation rules (pavement / earthwork-estimate / mt-proportional) are
 * LABELS ONLY today — all three use the same formulas above. That fact is
 * deliberate and preserved; do not add per-rule math here without an explicit
 * business decision.
 *
 * KNOWN CONSUMER DISAGREEMENTS (documented, NOT unified in Batch 01):
 *  - Gantt Under/Over badge (client/src/pages/WorkProgramme.tsx CoverageBadge)
 *    compares programmed total against RAW contract qty (item.currentQty),
 *    never eligible qty.
 *  - Execution Arrangement suggested qty (EarthworkArrangementDialog) uses
 *    qty × selectedEligibleLen / WHOLE-ELIGIBLE len — an ELIGIBLE denominator,
 *    while Auto Sequence uses the CONTRACTUAL denominator (eligible+blocked).
 *    They disagree whenever temporary blocks exist.
 */

import {
  resolveEligibleScope,
  coverageForStretch,
  SCOPE_CH_EPS,
  type EligibleScopeResult,
  type StretchCoverage,
  type ScopeSegmentLike,
} from "./projectScope";

// ─── Allocation rule (moved verbatim from programmeSequencer 029C) ──────────

export type QuantityAllocationRule = "pavement" | "earthwork-estimate" | "mt-proportional";

/** 029C #12: MT-UOM detection for bituminous items — proportional only, never density/geometry. */
export function isMtUnit(unit: string): boolean {
  return /^\s*(mt|ton(ne)?s?)\b/i.test(unit ?? "");
}

/** 029C: automatic allocation rule for an item (no user selector). */
export function allocationRuleForItem(it: { layerType?: string | null; unit: string }): QuantityAllocationRule {
  if (it.layerType === "earthwork") return "earthwork-estimate";
  if (it.layerType === "bituminous" && isMtUnit(it.unit)) return "mt-proportional";
  return "pavement";
}

// ─── Per-item scope aggregation (extracted from sequencer scopeByItem) ──────

/** Minimal coverage shape the resolver needs (matches SeqStretchCoverage / StretchCoverage). */
export interface CoverageLike {
  subRanges: Array<{ from: number; to: number; eligibleSideLenKm: number }>;
  eligibleSideLenKm: number;
  blockedSideLenKm: number;
  excludedSideLenKm: number;
  withdrawnSideLenKm: number;
  contractualSideLenKm: number;
}

export interface ItemScopeAggregate {
  contractualTotal: number;
  eligibleTotal: number;
  blockedTotal: number;
  excludedTotal: number;
  withdrawnTotal: number;
}

/** Sum stretch coverages into the item-level denominator basis (raw, unrounded — identical to the sequencer's accumulation). */
export function aggregateStretchCoverages(covs: Iterable<CoverageLike>): ItemScopeAggregate {
  let contractualTotal = 0, eligibleTotal = 0, blockedTotal = 0, excludedTotal = 0, withdrawnTotal = 0;
  for (const cov of Array.from(covs)) {
    contractualTotal += cov.contractualSideLenKm;
    eligibleTotal += cov.eligibleSideLenKm;
    blockedTotal += cov.blockedSideLenKm;
    excludedTotal += cov.excludedSideLenKm;
    withdrawnTotal += cov.withdrawnSideLenKm;
  }
  return { contractualTotal, eligibleTotal, blockedTotal, excludedTotal, withdrawnTotal };
}

// ─── Per-stretch quantity targets (extracted from sequencer bar loop) ────────

export interface StretchQuantityTarget {
  chF: number;
  chT: number;
  qty: number;
  lenKm: number;
  scopeClipped: boolean;
}

export interface AllocateStretchQuantityArgs {
  /** Item contract (BOQ) quantity. */
  totalQty: number;
  /** Stretch chainage bounds + optional manual override (normalised: null or (0,1]). */
  stretch: { chainageFrom: number; chainageTo: number; manualQtyFraction: number | null };
  /**
   * Legacy share for the no-scope path: lengthShare × sideFraction, exactly as
   * the caller computed it (the side-pairing logic stays with the caller).
   */
  fallbackShare: number;
  /** Scope basis — pass null/undefined when the item has no scope restriction. */
  scope?: { aggregate: ItemScopeAggregate; cov: CoverageLike } | null;
  /** Chainage epsilon for dropping zero-length targets (default SCOPE_CH_EPS). */
  chEps?: number;
}

/**
 * Compute the quantity targets for one item × stretch. Behaviour-identical
 * extraction of the Instruction 032 allocation block in
 * generateSequencedProgramme:
 *  - scope path: sub-range bars, qty ∝ eligible side-length / contractual total
 *    (manual override fixes the stretch total, distributed by eligible length);
 *  - legacy path: one full-stretch bar at totalQty × fallbackShare
 *    (manualQtyFraction already folded into fallbackShare by the caller — the
 *    sequencer substitutes the fraction for the automatic share before calling).
 */
export function allocateStretchQuantity(args: AllocateStretchQuantityArgs): StretchQuantityTarget[] {
  const { totalQty, stretch, fallbackShare } = args;
  const chEps = args.chEps ?? SCOPE_CH_EPS;
  const scope = args.scope ?? null;
  if (scope) {
    const denom = scope.aggregate.contractualTotal;
    const stretchEligible = scope.cov.eligibleSideLenKm;
    const manualQty = stretch.manualQtyFraction != null ? totalQty * stretch.manualQtyFraction : null;
    return scope.cov.subRanges
      .map(sr => ({
        chF: sr.from,
        chT: sr.to,
        qty:
          manualQty != null
            ? (stretchEligible > 0 ? manualQty * (sr.eligibleSideLenKm / stretchEligible) : 0)
            : (denom > 0 ? totalQty * (sr.eligibleSideLenKm / denom) : 0),
        lenKm: sr.to - sr.from,
        scopeClipped: true,
      }))
      .filter(t => t.qty > 0 || t.lenKm > chEps);
  }
  const stretchLen = Math.max(0, stretch.chainageTo - stretch.chainageFrom);
  return [{ chF: stretch.chainageFrom, chT: stretch.chainageTo, qty: totalQty * fallbackShare, lenKm: stretchLen, scopeClipped: false }];
}

// ─── Item-level resolution (spec §4: getItemScopeQuantity) ───────────────────

export interface ItemScopeQuantityQuery {
  /** BOQ item facts. totalQty = contract quantity from the BOQ. */
  item: {
    boqItemId: number;
    totalQty: number;
    unit: string;
    layerType?: string | null;
    categoryId?: number | null;
    /** Linear (spread by road length)? Defaults true — matches Auto Sequence's pavement track. */
    isLinear?: boolean;
  };
  /** All project scope segments (any status — resolver filters like existing consumers do). */
  scopeSegments: ScopeSegmentLike[];
  /** Optional chainage window (e.g. one stretch / reach). Omit for whole-item numbers. */
  range?: { chainageFrom: number; chainageTo: number; side?: string | null } | null;
  /**
   * The COMPLETE configured programme stretch set. When provided, the
   * contractual denominator is the sum of per-stretch coverage — the EXACT
   * Auto Sequence basis (stretches may leave gaps in working coverage, so
   * this can be smaller than the whole-scope figure). When omitted, the
   * denominator is the whole-scope contractual side-length
   * (denominatorBasis: "whole-scope") — equal to the sequencer's only when
   * the stretches tile all working coverage.
   */
  stretchDomain?: Array<{ chainageFrom: number; chainageTo: number; side?: string | null }> | null;
  /**
   * Query date. Default null = PLANNING semantics (conservative: every
   * withdrawal applies, unreleased blocks stay blocked) — identical to Auto
   * Sequence. Pass a date only for DPR-style checks.
   */
  onDate?: string | null;
}

export interface ItemScopeQuantityResult {
  contractQty: number;
  unit: string;
  /** Automatic allocation rule label — pavement | earthwork-estimate | mt-proportional. */
  allocationRule: QuantityAllocationRule;
  /**
   * Basis actually used:
   *  - "contract-full": scope not in use for this item → applicable qty is the raw contract qty.
   *  - "scope-proportional": qty × eligibleSideLen / contractualSideLen (Auto Sequence basis).
   */
  calculationBasis: "contract-full" | "scope-proportional";
  /** True when the project has confirmed working reaches (scope system active for this item). */
  scopeActive: boolean;
  /** Applicable/resolved quantity on the basis above (range-clipped when range given). */
  resolvedQty: number;
  /** Quantity attributable to temporarily-blocked coverage (unprogrammable now, still contractual). */
  blockedQty: number;
  /** Side-length figures (km-equivalents, 0.5/side) — whole item, or the range when given. */
  eligibleSideLenKm: number;
  blockedSideLenKm: number;
  excludedSideLenKm: number;
  withdrawnSideLenKm: number;
  /** Contractual denominator (eligible + blocked) actually used — see denominatorBasis. */
  contractualSideLenKm: number;
  /**
   * Which denominator produced resolvedQty:
   *  - "stretch-domain": Σ coverage over the supplied programme stretches — the exact Auto Sequence basis.
   *  - "whole-scope": whole-item contractual side-length (equals Auto Sequence only when stretches tile all working coverage).
   *  - "none": scope inactive.
   */
  denominatorBasis: "stretch-domain" | "whole-scope" | "none";
  /** Executable chainage sub-ranges (whole item: per corridor; range query: clipped union). */
  eligibleRanges: Array<{ from: number; to: number }>;
  /** Whether any manual override input (manualQtyFraction) was applied. Item-level queries never apply one. */
  manualOverrideApplied: boolean;
  /** Raw scope result for callers needing corridor detail. Null when scope inactive. */
  scope: EligibleScopeResult | null;
  /** Range coverage detail when a range was queried. */
  rangeCoverage: StretchCoverage | null;
}

/**
 * Resolve an item's contractual quantity + scope-eligible applicable quantity
 * on the EXISTING Auto Sequence basis (contractual denominator). Read-only,
 * derived — no schema. This is the seam future bases (geometry, manually
 * confirmed) will plug into; Batch 01 implements only the shipped behaviour.
 */
export function getItemScopeQuantity(q: ItemScopeQuantityQuery): ItemScopeQuantityResult {
  const { item, scopeSegments } = q;
  const allocationRule = allocationRuleForItem(item);
  const scope = resolveEligibleScope(scopeSegments, {
    boqItemId: item.boqItemId,
    categoryId: item.categoryId ?? null,
    isLinear: item.isLinear ?? true,
    onDate: q.onDate ?? null,
  });

  if (!scope.hasWorkingReaches) {
    // Scope system not in use → contract quantity applies in full (legacy behaviour).
    return {
      contractQty: item.totalQty,
      unit: item.unit,
      allocationRule,
      calculationBasis: "contract-full",
      scopeActive: false,
      resolvedQty: item.totalQty,
      blockedQty: 0,
      eligibleSideLenKm: 0,
      blockedSideLenKm: 0,
      excludedSideLenKm: 0,
      withdrawnSideLenKm: 0,
      contractualSideLenKm: 0,
      eligibleRanges: [],
      manualOverrideApplied: false,
      denominatorBasis: "none",
      scope: null,
      rangeCoverage: null,
    };
  }

  // Denominator: with a stretch domain, Σ per-stretch contractual coverage —
  // the EXACT Auto Sequence basis (stretches may leave gaps). Without one,
  // the whole-scope contractual side-length (equal to the sequencer's only
  // when stretches tile all working coverage).
  let denominatorBasis: "stretch-domain" | "whole-scope" = "whole-scope";
  let denom = scope.contractualSideLenKm;
  if (q.stretchDomain && q.stretchDomain.length > 0) {
    denominatorBasis = "stretch-domain";
    denom = aggregateStretchCoverages(q.stretchDomain.map(st => coverageForStretch(scope, st))).contractualTotal;
  }

  let eligibleLen = scope.eligibleSideLenKm;
  let blockedLen = scope.blockedSideLenKm;
  let excludedLen = scope.excludedSideLenKm;
  let withdrawnLen = scope.withdrawnSideLenKm;
  let eligibleRanges: Array<{ from: number; to: number }> = scope.executable.map(r => ({ from: r.from, to: r.to }));
  let rangeCoverage: StretchCoverage | null = null;

  if (q.range) {
    rangeCoverage = coverageForStretch(scope, q.range);
    eligibleLen = rangeCoverage.eligibleSideLenKm;
    blockedLen = rangeCoverage.blockedSideLenKm;
    excludedLen = rangeCoverage.excludedSideLenKm;
    withdrawnLen = rangeCoverage.withdrawnSideLenKm;
    eligibleRanges = rangeCoverage.subRanges.map(sr => ({ from: sr.from, to: sr.to }));
  }

  const resolvedQty = denom > 0 ? item.totalQty * (eligibleLen / denom) : 0;
  const blockedQty = denom > 0 ? item.totalQty * (blockedLen / denom) : 0;

  return {
    contractQty: item.totalQty,
    unit: item.unit,
    allocationRule,
    calculationBasis: "scope-proportional",
    scopeActive: true,
    resolvedQty: +resolvedQty.toFixed(3),
    blockedQty: +blockedQty.toFixed(3),
    eligibleSideLenKm: +eligibleLen.toFixed(6),
    blockedSideLenKm: +blockedLen.toFixed(6),
    excludedSideLenKm: +excludedLen.toFixed(6),
    withdrawnSideLenKm: +withdrawnLen.toFixed(6),
    contractualSideLenKm: +denom.toFixed(6),
    eligibleRanges,
    manualOverrideApplied: false,
    denominatorBasis,
    scope,
    rangeCoverage,
  };
}
