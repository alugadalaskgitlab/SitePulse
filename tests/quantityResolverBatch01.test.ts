/**
 * Batch 01 — Central quantity resolver foundation.
 *
 * Locks: (1) the shared resolver reproduces the exact Auto Sequence formulas;
 * (2) the sequencer still produces identical numbers after migrating to it;
 * (3) the documented consumer disagreement (Execution Arrangement eligible-
 *     denominator vs Auto Sequence contractual-denominator) is recorded, not fixed;
 * (4) the Gantt Under/Over badge basis was NOT changed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  allocationRuleForItem,
  aggregateStretchCoverages,
  allocateStretchQuantity,
  getItemScopeQuantity,
  isMtUnit,
} from "../shared/quantityResolver";
import { generateSequencedProgramme } from "../shared/programmeSequencer";
import { resolveEligibleScope, coverageForStretch } from "../shared/projectScope";

// ─── Shared fixture: 10 km road, LHS no-scope 2–3, full block 6–7, item-4 withdrawal 9–10 ──
const segs: any[] = [
  { id: 1, segmentType: "working_reach", status: "confirmed", chainageFrom: 0, chainageTo: 10, side: "full_width", applicability: "all_linear", categoryIds: null, itemIds: null },
  { id: 2, segmentType: "no_scope", status: "confirmed", chainageFrom: 2, chainageTo: 3, side: "lhs", applicability: "all_linear", categoryIds: null, itemIds: null },
  { id: 3, segmentType: "temporary_block", status: "confirmed", chainageFrom: 6, chainageTo: 7, side: "full_width", applicability: "all_linear", categoryIds: null, itemIds: null },
  { id: 4, segmentType: "withdrawn", status: "confirmed", chainageFrom: 9, chainageTo: 10, side: "full_width", applicability: "items", categoryIds: null, itemIds: [4] },
];
const scopeFor = (boqItemId: number) =>
  resolveEligibleScope(segs, { boqItemId, categoryId: null, isLinear: true, onDate: null });

describe("Batch 01 — allocation rule labels", () => {
  it("classifies exactly as the sequencer did (labels only)", () => {
    expect(allocationRuleForItem({ layerType: "earthwork", unit: "CUM" })).toBe("earthwork-estimate");
    expect(allocationRuleForItem({ layerType: "bituminous", unit: "MT" })).toBe("mt-proportional");
    expect(allocationRuleForItem({ layerType: "bituminous", unit: "Tonnes" })).toBe("mt-proportional");
    expect(allocationRuleForItem({ layerType: "bituminous", unit: "CUM" })).toBe("pavement");
    expect(allocationRuleForItem({ layerType: "gsb", unit: "CUM" })).toBe("pavement");
    expect(allocationRuleForItem({ layerType: null, unit: "SQM" })).toBe("pavement");
    expect(isMtUnit("MT")).toBe(true);
    expect(isMtUnit("Cum")).toBe(false);
  });
});

describe("Batch 01 — allocateStretchQuantity reproduces sequencer math", () => {
  it("legacy path: totalQty × fallbackShare over the full stretch", () => {
    const t = allocateStretchQuantity({
      totalQty: 12000,
      stretch: { chainageFrom: 0, chainageTo: 4, manualQtyFraction: null },
      fallbackShare: (4 / 10) * 0.5, // lengthShare × lhs side fraction
      scope: null,
    });
    expect(t).toEqual([{ chF: 0, chT: 4, qty: 2400, lenKm: 4, scopeClipped: false }]);
  });

  it("scoped path: qty ∝ eligible side-length / contractual total (blocked in denominator)", () => {
    const scope = scopeFor(1);
    const stretches = [
      { chainageFrom: 0, chainageTo: 4, side: "lhs" },
      { chainageFrom: 4, chainageTo: 8, side: "full_width" },
      { chainageFrom: 8, chainageTo: 10, side: "rhs" },
    ];
    const covs = stretches.map(st => coverageForStretch(scope, st));
    const aggregate = aggregateStretchCoverages(covs);
    // Denominator INCLUDES the temporary block (6–7) but EXCLUDES no-scope (LHS 2–3).
    expect(aggregate.contractualTotal).toBeCloseTo(0.5 * 4 - 0.5 * 1 + 4 + 0.5 * 2, 6); // 6.5
    expect(aggregate.eligibleTotal).toBeCloseTo(6.5 - 1, 6); // block removes 1.0 km-eq
    const t = allocateStretchQuantity({
      totalQty: 12000,
      stretch: { chainageFrom: 0, chainageTo: 4, manualQtyFraction: null },
      fallbackShare: 0, // unused on the scope path
      scope: { aggregate, cov: covs[0] },
    });
    // LHS stretch 0–4 minus LHS no-scope 2–3 → 1.5 km-eq eligible of 6.5 contractual
    const total = t.reduce((s, x) => s + x.qty, 0);
    expect(total).toBeCloseTo(12000 * (1.5 / 6.5), 3);
    expect(t.every(x => x.scopeClipped)).toBe(true);
  });

  it("manualQtyFraction fixes the stretch total and distributes by eligible length", () => {
    const scope = scopeFor(1);
    const cov = coverageForStretch(scope, { chainageFrom: 4, chainageTo: 8, side: "full_width" });
    const aggregate = aggregateStretchCoverages([cov]);
    const t = allocateStretchQuantity({
      totalQty: 12000,
      stretch: { chainageFrom: 4, chainageTo: 8, manualQtyFraction: 0.35 },
      fallbackShare: 0.999, // must be ignored
      scope: { aggregate, cov },
    });
    expect(t.reduce((s, x) => s + x.qty, 0)).toBeCloseTo(12000 * 0.35, 3);
  });
});

describe("Batch 01 — sequencer regression (before = after)", () => {
  const items: any[] = [
    { boqItemId: 1, description: "Construction of Granular sub-base", planningWorkType: "road", totalQty: 12000, unit: "CUM", layerType: "gsb", fullDurationMonths: 3 },
    { boqItemId: 2, description: "Construction of embankment with borrow earth", planningWorkType: "road", totalQty: 50000, unit: "CUM", layerType: "earthwork", fullDurationMonths: 4 },
    { boqItemId: 3, description: "Dense Bituminous Macadam 50mm", planningWorkType: "road", totalQty: 9000, unit: "MT", layerType: "bituminous", fullDurationMonths: 2 },
    { boqItemId: 4, description: "Wet Mix Macadam", planningWorkType: "road", totalQty: 8000, unit: "CUM", layerType: "wmm", fullDurationMonths: 2 },
  ];
  const stretches: any[] = [
    { label: "R1", chainageFrom: 0, chainageTo: 4, priority: 1, manualQtyFraction: null, side: "lhs" },
    { label: "R2", chainageFrom: 4, chainageTo: 8, priority: 2, manualQtyFraction: 0.35, side: "full_width" },
    { label: "R3", chainageFrom: 8, chainageTo: 10, priority: 3, manualQtyFraction: null, side: "rhs" },
  ];
  const base: any = { fronts: 2, totalMonths: 12, roadLengthKm: 10, staggerMonths: 1, lagMonths: 0.25, chainageStartKm: 0, disableStructureFronts: true, stretches };
  const qtyOf = (res: any, item: number, reach: string) =>
    res.bars.filter((b: any) => b.boqItemId === item && b.reachLabel === reach).reduce((s: number, b: any) => s + b.plannedQty, 0);

  it("legacy (no scope): exact pre-refactor values", () => {
    const res = generateSequencedProgramme(items, base);
    expect(qtyOf(res, 1, "R1")).toBeCloseTo(2400, 3);     // 12000 × 4/10 × 0.5 (lhs)
    expect(qtyOf(res, 1, "R2")).toBeCloseTo(4200, 3);     // manual 0.35
    expect(qtyOf(res, 1, "R3")).toBeCloseTo(1200, 3);     // 12000 × 2/10 × 0.5 (rhs)
    expect(qtyOf(res, 2, "R1")).toBeCloseTo(10000, 3);
    expect(qtyOf(res, 3, "R3")).toBeCloseTo(900, 3);
  });

  it("scoped: exact pre-refactor values (incl. manual + withdrawal)", () => {
    const res = generateSequencedProgramme(items, {
      ...base,
      scopeCoverage: (id: number, st: any) => {
        const s = scopeFor(id);
        if (!s.hasWorkingReaches) return null;
        return coverageForStretch(s, st);
      },
    });
    expect(qtyOf(res, 1, "R1")).toBeCloseTo(12000 * (1.5 / 6.5), 2); // 2769.23
    expect(qtyOf(res, 1, "R2")).toBeCloseTo(4200, 2);                 // manual 0.35 preserved
    expect(qtyOf(res, 1, "R3")).toBeCloseTo(12000 * (1 / 6.5), 2);    // 1846.15
    // Item 4 has a withdrawal 9–10 → R3 rhs eligible 0.5 km-eq of contractual 6.0
    expect(qtyOf(res, 4, "R3")).toBeCloseTo(8000 * (0.5 / 6.0), 2);   // 666.67
    const bar = res.bars.find((b: any) => b.boqItemId === 4 && b.reachLabel === "R3");
    expect(bar?.chainageTo).toBeCloseTo(9, 3); // clipped at the withdrawal
  });
});

describe("Batch 01 — getItemScopeQuantity item-level resolution", () => {
  it("scope inactive → contract-full basis, resolvedQty = contract qty", () => {
    const r = getItemScopeQuantity({
      item: { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" },
      scopeSegments: [],
    });
    expect(r.calculationBasis).toBe("contract-full");
    expect(r.scopeActive).toBe(false);
    expect(r.resolvedQty).toBe(12000);
  });

  it("scope active → Auto Sequence basis (contractual denominator, block stays in denominator)", () => {
    const r = getItemScopeQuantity({
      item: { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" },
      scopeSegments: segs,
    });
    expect(r.calculationBasis).toBe("scope-proportional");
    // whole item: base 10 km full width = 10 km-eq; minus lhs no-scope 0.5 → contractual 9.5; block 6–7 = 1.0
    expect(r.contractualSideLenKm).toBeCloseTo(9.5, 6);
    expect(r.eligibleSideLenKm).toBeCloseTo(8.5, 6);
    expect(r.resolvedQty).toBeCloseTo(12000 * (8.5 / 9.5), 3);
    expect(r.blockedQty).toBeCloseTo(12000 * (1.0 / 9.5), 3);
  });

  it("stretchDomain with a GAP reproduces the exact Auto Sequence denominator (smaller than whole-scope)", () => {
    // Stretches cover only 0–4 (lhs) and 8–10 (rhs): the 4–8 gap is NOT programmed.
    const domain = [
      { chainageFrom: 0, chainageTo: 4, side: "lhs" },
      { chainageFrom: 8, chainageTo: 10, side: "rhs" },
    ];
    const r = getItemScopeQuantity({
      item: { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" },
      scopeSegments: segs,
      range: domain[0],
      stretchDomain: domain,
    });
    // Denominator = Σ per-stretch contractual: lhs(0–4)−no-scope(2–3) = 1.5 + rhs(8–10) = 1.0 → 2.5
    expect(r.denominatorBasis).toBe("stretch-domain");
    expect(r.contractualSideLenKm).toBeCloseTo(2.5, 6);
    expect(r.resolvedQty).toBeCloseTo(12000 * (1.5 / 2.5), 3);
    // Whole-scope basis would have used 9.5 — verify they differ (gap semantics locked).
    const whole = getItemScopeQuantity({
      item: { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" },
      scopeSegments: segs,
      range: domain[0],
    });
    expect(whole.denominatorBasis).toBe("whole-scope");
    expect(whole.contractualSideLenKm).toBeCloseTo(9.5, 6);
    expect(whole.resolvedQty).not.toBeCloseTo(r.resolvedQty, 0);
  });

  it("range query clips numerator but keeps the whole-item denominator", () => {
    const r = getItemScopeQuantity({
      item: { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" },
      scopeSegments: segs,
      range: { chainageFrom: 0, chainageTo: 4, side: "lhs" },
    });
    expect(r.resolvedQty).toBeCloseTo(12000 * (1.5 / 9.5), 3);
    expect(r.rangeCoverage).not.toBeNull();
  });
});

describe("Batch 01 — documented consumer disagreements (NOT fixed)", () => {
  it("Execution Arrangement (eligible denominator) ≠ Auto Sequence (contractual denominator) when blocks exist", () => {
    const scope = scopeFor(1);
    // Arrangement dialog formula: qty × min(1, selectedEligible / WHOLE eligible)
    const reachCov = coverageForStretch(scope, { chainageFrom: 0, chainageTo: 4, side: "lhs" });
    const arrangementSuggested = Math.round(12000 * Math.min(1, reachCov.eligibleSideLenKm / scope.eligibleSideLenKm) * 100) / 100;
    // Auto Sequence / resolver basis: qty × eligible / CONTRACTUAL
    const autoSeq = getItemScopeQuantity({
      item: { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" },
      scopeSegments: segs,
      range: { chainageFrom: 0, chainageTo: 4, side: "lhs" },
    }).resolvedQty;
    expect(arrangementSuggested).toBeCloseTo(12000 * (1.5 / 8.5), 1); // 2117.65
    expect(autoSeq).toBeCloseTo(12000 * (1.5 / 9.5), 2);              // 1894.74
    expect(arrangementSuggested).not.toBeCloseTo(autoSeq, 0);          // they DISAGREE — business decision pending
  });

  it("Arrangement dialog migrated to the shared resolver in Batch 02 (old formula retired)", () => {
    const src = readFileSync("client/src/components/EarthworkArrangementDialog.tsx", "utf8");
    expect(src).not.toContain("selectedEligibleLen / wholeEligibleLen");
    expect(src).toContain("resolveArrangementApplicableQty");
  });

  it("Gantt Under/Over badge still compares programmed total vs raw contract qty (unchanged)", () => {
    const src = readFileSync("client/src/pages/WorkProgramme.tsx", "utf8");
    expect(src).toMatch(/CoverageBadge/);
    expect(src).toMatch(/planned\s*-\s*boqQty/); // raw contract-qty basis, NOT eligible qty
  });
});
