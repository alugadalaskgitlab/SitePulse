/**
 * Batch 02 — Execution Arrangement "Applicable Qty" resolution.
 *
 * Thin, arrangement-facing wrapper around the shared Batch-01 quantity
 * resolver (shared/quantityResolver.ts). It contains NO quantity math of its
 * own — it only translates the Arrangement dialog's scope-mode selection
 * (whole scope / confirmed working reaches / custom chainage) into resolver
 * queries and combines the results.
 *
 * Denominator basis: ALWAYS "whole-scope" (no stretchDomain is ever passed).
 * Execution Arrangements may be created before programme bars exist, or while
 * bars cover only part of the project, so arrangement quantities must not
 * silently depend on current Gantt/programme-bar coverage.
 *
 * NOTE — deliberate semantics change vs the pre-Batch-02 dialog:
 * The old dialog-local `suggestedQty` used an ELIGIBLE denominator
 * (qty × selectedEligibleLen / wholeEligibleLen). The resolver uses the
 * CONTRACTUAL denominator (eligible + temporarily-blocked, excluding
 * no-scope/withdrawn) — the same model as Auto Sequence. The two differ
 * whenever Temporary Blocks exist anywhere in the item's scope.
 */

import {
  getItemScopeQuantity,
  type ItemScopeQuantityQuery,
  type ItemScopeQuantityResult,
} from "./quantityResolver";

export type ArrangementScopeMode = "whole" | "reaches" | "custom";

export interface ArrangementQtyRange {
  chainageFrom: number;
  chainageTo: number;
  side?: string | null;
}

export interface ArrangementApplicableQtyInput {
  scopeMode: ArrangementScopeMode;
  /** BOQ item facts. totalQty MUST be the contract BOQ quantity. */
  item: ItemScopeQuantityQuery["item"];
  /** All project scope segments (any status). */
  scopeSegments: ItemScopeQuantityQuery["scopeSegments"];
  /** Selected confirmed Working Reaches (reaches mode). */
  selectedReaches?: ArrangementQtyRange[];
  /** Parsed custom From/To (custom mode). Null/invalid → not resolvable yet. */
  customRange?: ArrangementQtyRange | null;
}

export interface ArrangementApplicableQtyResult {
  /** "ok" = applicableQty is meaningful; "incomplete" = scope selection not
   *  yet resolvable (no reach ticked / custom range not entered or invalid). */
  status: "ok" | "incomplete";
  contractQty: number;
  unit: string;
  /** Resolver-derived applicable quantity for the selected scope (null while incomplete). */
  applicableQty: number | null;
  /** Quantity attributable to temporarily-blocked coverage inside the selection. */
  blockedQty: number;
  /** False when the project has no confirmed working reaches — applicable = contract qty. */
  scopeActive: boolean;
  /** Always "whole-scope" when scope is active; "none" otherwise. Never "stretch-domain". */
  denominatorBasis: "whole-scope" | "none";
  calculationBasis: "contract-full" | "scope-proportional";
  /** Underlying resolver results (one per queried range; single entry for whole/custom). */
  parts: ItemScopeQuantityResult[];
}

const round3 = (n: number) => +n.toFixed(3);

/**
 * Overlap-safe normalisation of the selected reach ranges.
 *
 * Project Scope allows confirmed working reaches to overlap (it flags the
 * conflict rather than forbidding it), and the dialog lets the user tick both.
 * Summing per-reach resolver results would count the overlap once per reach,
 * so decompose every selection into per-side intervals (full-width/both = LHS
 * + RHS), union the intervals per side, and query each merged interval once.
 */
export function normaliseReachSelection(ranges: ArrangementQtyRange[]): ArrangementQtyRange[] {
  const perSide: Record<"lhs" | "rhs", Array<[number, number]>> = { lhs: [], rhs: [] };
  for (const r of ranges) {
    if (!(Number.isFinite(r.chainageFrom) && Number.isFinite(r.chainageTo) && r.chainageTo > r.chainageFrom)) continue;
    const s = String(r.side ?? "").toLowerCase();
    const sides: Array<"lhs" | "rhs"> = s === "lhs" ? ["lhs"] : s === "rhs" ? ["rhs"] : ["lhs", "rhs"];
    for (const side of sides) perSide[side].push([r.chainageFrom, r.chainageTo]);
  }
  const out: ArrangementQtyRange[] = [];
  for (const side of ["lhs", "rhs"] as const) {
    const sorted = perSide[side].sort((a, b) => a[0] - b[0]);
    let cur: [number, number] | null = null;
    for (const [f, t] of sorted) {
      if (cur && f <= cur[1]) cur[1] = Math.max(cur[1], t);
      else { if (cur) out.push({ chainageFrom: cur[0], chainageTo: cur[1], side }); cur = [f, t]; }
    }
    if (cur) out.push({ chainageFrom: cur[0], chainageTo: cur[1], side });
  }
  return out;
}

export function resolveArrangementApplicableQty(
  input: ArrangementApplicableQtyInput,
): ArrangementApplicableQtyResult {
  const { scopeMode, item, scopeSegments } = input;
  const base = { item, scopeSegments, stretchDomain: null, onDate: null } as const;

  const incomplete = (probe: ItemScopeQuantityResult): ArrangementApplicableQtyResult => ({
    status: "incomplete",
    contractQty: item.totalQty,
    unit: item.unit,
    applicableQty: null,
    blockedQty: 0,
    scopeActive: probe.scopeActive,
    denominatorBasis: probe.scopeActive ? "whole-scope" : "none",
    calculationBasis: probe.calculationBasis,
    parts: [],
  });

  const finish = (parts: ItemScopeQuantityResult[]): ArrangementApplicableQtyResult => {
    const first = parts[0];
    return {
      status: "ok",
      contractQty: item.totalQty,
      unit: item.unit,
      applicableQty: round3(parts.reduce((s, p) => s + p.resolvedQty, 0)),
      blockedQty: round3(parts.reduce((s, p) => s + p.blockedQty, 0)),
      scopeActive: first.scopeActive,
      denominatorBasis: first.scopeActive ? "whole-scope" : "none",
      calculationBasis: first.calculationBasis,
      parts,
    };
  };

  if (scopeMode === "whole") {
    // Whole eligible scope: item-level resolver query, no range.
    return finish([getItemScopeQuantity({ ...base })]);
  }

  if (scopeMode === "reaches") {
    // Union the selection per side first (reaches may overlap), then query
    // each disjoint interval against the same whole-scope denominator — the
    // sum then equals a single combined-range query.
    const reaches = normaliseReachSelection(input.selectedReaches ?? []);
    if (reaches.length === 0) return incomplete(getItemScopeQuantity({ ...base }));
    return finish(reaches.map(r => getItemScopeQuantity({ ...base, range: r })));
  }

  // custom
  const r = input.customRange;
  const valid = r != null && Number.isFinite(r.chainageFrom) && Number.isFinite(r.chainageTo)
    && r.chainageTo > r.chainageFrom;
  if (!valid) return incomplete(getItemScopeQuantity({ ...base }));
  return finish([getItemScopeQuantity({ ...base, range: r! })]);
}
