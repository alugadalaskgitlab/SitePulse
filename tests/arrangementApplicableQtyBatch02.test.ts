/**
 * Batch 02 — Execution Arrangement wired to the shared quantity resolver.
 *
 * Locks:
 *  (1) Contract BOQ Qty is never modified by resolution.
 *  (2) Whole Scope / Confirmed Reach / Custom Chainage all resolve through
 *      shared/quantityResolver with denominatorBasis "whole-scope" — never
 *      "stretch-domain" (arrangements must not depend on programme bars).
 *  (3) The old dialog-local eligible-denominator suggestedQty is GONE and the
 *      exact old-vs-new difference is documented here.
 *  (4) No-Scope / Withdrawn / Temporary Block / side handling follow existing
 *      Batch-01 resolver semantics unchanged.
 *  (5) Auto Sequence and the Gantt badge are untouched (regression assertions).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolveArrangementApplicableQty } from "../shared/arrangementApplicableQty";
import { getItemScopeQuantity } from "../shared/quantityResolver";
import { resolveEligibleScope, coverageForStretch } from "../shared/projectScope";

// Same fixture as Batch 01: 10 km road, LHS no-scope 2–3, full block 6–7, item-4 withdrawal 9–10.
const segs: any[] = [
  { id: 1, segmentType: "working_reach", status: "confirmed", chainageFrom: 0, chainageTo: 10, side: "full_width", applicability: "all_linear", categoryIds: null, itemIds: null },
  { id: 2, segmentType: "no_scope", status: "confirmed", chainageFrom: 2, chainageTo: 3, side: "lhs", applicability: "all_linear", categoryIds: null, itemIds: null },
  { id: 3, segmentType: "temporary_block", status: "confirmed", chainageFrom: 6, chainageTo: 7, side: "full_width", applicability: "all_linear", categoryIds: null, itemIds: null },
  { id: 4, segmentType: "withdrawn", status: "confirmed", chainageFrom: 9, chainageTo: 10, side: "full_width", applicability: "items", categoryIds: null, itemIds: [4] },
];
const item = { boqItemId: 1, totalQty: 12000, unit: "CUM", layerType: "gsb" };

describe("Batch 02 — A/B: contract qty unchanged; whole-scope display", () => {
  it("whole eligible scope resolves via the resolver; contractQty passes through untouched", () => {
    const r = resolveArrangementApplicableQty({ scopeMode: "whole", item, scopeSegments: segs });
    expect(r.status).toBe("ok");
    expect(r.contractQty).toBe(12000); // never modified
    // eligible 8.5 of contractual 9.5 (block stays in denominator, no-scope excluded)
    expect(r.applicableQty).toBeCloseTo(12000 * (8.5 / 9.5), 3);
    expect(r.blockedQty).toBeCloseTo(12000 * (1.0 / 9.5), 3);
    expect(r.denominatorBasis).toBe("whole-scope");
  });

  it("scope inactive → applicable = full contract qty (contract-full basis)", () => {
    const r = resolveArrangementApplicableQty({ scopeMode: "whole", item, scopeSegments: [] });
    expect(r.status).toBe("ok");
    expect(r.applicableQty).toBe(12000);
    expect(r.scopeActive).toBe(false);
    expect(r.calculationBasis).toBe("contract-full");
    expect(r.denominatorBasis).toBe("none");
  });
});

describe("Batch 02 — C/D: confirmed working reach (the only true old→new migration)", () => {
  const reach = { chainageFrom: 0, chainageTo: 4, side: "lhs" };

  it("resolver quantity for the selected reach uses the CONTRACTUAL denominator", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "reaches", item, scopeSegments: segs, selectedReaches: [reach],
    });
    expect(r.status).toBe("ok");
    // LHS 0–4 minus LHS no-scope 2–3 → 1.5 km-eq eligible / 9.5 contractual
    expect(r.applicableQty).toBeCloseTo(12000 * (1.5 / 9.5), 3); // 1894.737
    expect(r.denominatorBasis).toBe("whole-scope");
  });

  it("documents the exact old-vs-new difference (old eligible denominator is retired)", () => {
    const scope = resolveEligibleScope(segs, { boqItemId: 1, categoryId: null, isLinear: true, onDate: null });
    const cov = coverageForStretch(scope, reach);
    // OLD dialog formula: qty × min(1, selectedEligible / WHOLE ELIGIBLE) → 12000 × 1.5/8.5
    const oldSuggested = Math.round(12000 * Math.min(1, cov.eligibleSideLenKm / scope.eligibleSideLenKm) * 100) / 100;
    expect(oldSuggested).toBeCloseTo(2117.65, 2);
    // NEW resolver figure: 12000 × 1.5/9.5 — the Temporary Block (6–7) now sits in the denominator.
    const nw = resolveArrangementApplicableQty({ scopeMode: "reaches", item, scopeSegments: segs, selectedReaches: [reach] });
    expect(nw.applicableQty).toBeCloseTo(1894.737, 2);
    expect(oldSuggested).not.toBeCloseTo(nw.applicableQty!, 0);
  });

  it("multiple selected reaches sum per-reach figures on the constant whole-scope denominator", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "reaches", item, scopeSegments: segs,
      selectedReaches: [reach, { chainageFrom: 8, chainageTo: 10, side: "rhs" }],
    });
    expect(r.applicableQty).toBeCloseTo(12000 * ((1.5 + 1.0) / 9.5), 3);
  });

  it("overlapping same-side reaches are unioned, never double-counted", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "reaches", item, scopeSegments: segs,
      selectedReaches: [reach, { chainageFrom: 3, chainageTo: 5, side: "lhs" }], // overlap 3–4
    });
    // Union = LHS 0–5 minus LHS no-scope 2–3 → 2.0 km-eq (NOT 1.5 + 1.0 = 2.5)
    expect(r.applicableQty).toBeCloseTo(12000 * (2.0 / 9.5), 3);
  });

  it("full-width overlapping an LHS reach counts the shared LHS half once", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "reaches", item, scopeSegments: segs,
      selectedReaches: [
        { chainageFrom: 0, chainageTo: 2, side: "lhs" },
        { chainageFrom: 1, chainageTo: 2, side: "full_width" },
      ],
    });
    // LHS union 0–2 = 1.0 km-eq; RHS 1–2 = 0.5 km-eq → 1.5 total
    expect(r.applicableQty).toBeCloseTo(12000 * (1.5 / 9.5), 3);
  });

  it("opposite-side reaches over the same chainage are both counted (no false union)", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "reaches", item, scopeSegments: segs,
      selectedReaches: [
        { chainageFrom: 0, chainageTo: 2, side: "lhs" },
        { chainageFrom: 0, chainageTo: 2, side: "rhs" },
      ],
    });
    expect(r.applicableQty).toBeCloseTo(12000 * (2.0 / 9.5), 3);
  });

  it("no reach selected → incomplete (no figure invented)", () => {
    const r = resolveArrangementApplicableQty({ scopeMode: "reaches", item, scopeSegments: segs, selectedReaches: [] });
    expect(r.status).toBe("incomplete");
    expect(r.applicableQty).toBeNull();
  });
});

describe("Batch 02 — E/F/G/H/I: custom chainage (NEW display — no prior calculation existed)", () => {
  it("arbitrary ad-hoc range not matching any reach/bar/segment boundary resolves correctly", () => {
    // 1.7–3.4 crosses the LHS no-scope 2–3 partially; matches nothing stored.
    const r = resolveArrangementApplicableQty({
      scopeMode: "custom", item, scopeSegments: segs,
      customRange: { chainageFrom: 1.7, chainageTo: 3.4 },
    });
    // full-width 1.7 km = 1.7 km-eq minus LHS no-scope overlap (2–3 → 0.5 km-eq) = 1.2
    expect(r.status).toBe("ok");
    expect(r.applicableQty).toBeCloseTo(12000 * (1.2 / 9.5), 3);
  });

  it("range fully inside No-Scope on that side clips to zero (current semantics, no new rule)", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "custom", item, scopeSegments: segs,
      customRange: { chainageFrom: 2, chainageTo: 3, side: "lhs" },
    });
    expect(r.applicableQty).toBeCloseTo(0, 6);
  });

  it("Temporary Block: overall applicable excludes it from the numerator but keeps it contractual", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "custom", item, scopeSegments: segs,
      customRange: { chainageFrom: 5, chainageTo: 8 },
    });
    // 3 km full width, block 6–7 removes 1.0 km-eq from numerator only
    expect(r.applicableQty).toBeCloseTo(12000 * (2.0 / 9.5), 3);
    expect(r.blockedQty).toBeCloseTo(12000 * (1.0 / 9.5), 3);
  });

  it("LHS/RHS/Both side handling matches resolver semantics", () => {
    const both = resolveArrangementApplicableQty({ scopeMode: "custom", item, scopeSegments: segs, customRange: { chainageFrom: 0, chainageTo: 2 } });
    const lhs = resolveArrangementApplicableQty({ scopeMode: "custom", item, scopeSegments: segs, customRange: { chainageFrom: 0, chainageTo: 2, side: "lhs" } });
    const rhs = resolveArrangementApplicableQty({ scopeMode: "custom", item, scopeSegments: segs, customRange: { chainageFrom: 0, chainageTo: 2, side: "rhs" } });
    expect(lhs.applicableQty! + rhs.applicableQty!).toBeCloseTo(both.applicableQty!, 3);
    expect(lhs.applicableQty).toBeCloseTo(rhs.applicableQty!, 6); // no side constraint in 0–2
  });

  it("withdrawn locations are excluded for the affected item (item 4)", () => {
    const r = resolveArrangementApplicableQty({
      scopeMode: "custom",
      item: { boqItemId: 4, totalQty: 8000, unit: "CUM", layerType: "wmm" },
      scopeSegments: segs,
      customRange: { chainageFrom: 8, chainageTo: 10 },
    });
    // item-4 contractual: 9.5 − withdrawn(9–10)=1.0 → 8.5; range 8–10 eligible = 1.0
    expect(r.applicableQty).toBeCloseTo(8000 * (1.0 / 8.5), 3);
  });

  it("invalid / missing range → incomplete, never a guessed figure", () => {
    for (const bad of [null, { chainageFrom: 3, chainageTo: 3 }, { chainageFrom: 5, chainageTo: 2 }, { chainageFrom: NaN, chainageTo: 4 }]) {
      const r = resolveArrangementApplicableQty({ scopeMode: "custom", item, scopeSegments: segs, customRange: bad as any });
      expect(r.status).toBe("incomplete");
      expect(r.applicableQty).toBeNull();
    }
  });
});

describe("Batch 02 — J/K/L: dialog visibility wiring (source-level assertions)", () => {
  const dialog = readFileSync("client/src/components/EarthworkArrangementDialog.tsx", "utf8");

  it("Applicable Qty comes from the shared resolver; the old eligible-denominator formula is gone", () => {
    expect(dialog).toContain("resolveArrangementApplicableQty");
    expect(dialog).not.toContain("selectedEligibleLen / wholeEligibleLen");
  });

  it("reference panel is not gated on empty Arrangement Qty, edit mode, or a suggestedQty variable", () => {
    // Panel renders whenever `applicable != null`; only the Use button checks the input.
    expect(dialog).toMatch(/applicable != null && \(/);
    expect(dialog).not.toMatch(/suggestedQty != null && allocatedQty/);
    // The applicable computation must not exclude edit mode.
    const compute = dialog.slice(dialog.indexOf("const applicable ="), dialog.indexOf("const sourceApplicable"));
    expect(compute).not.toContain("isEdit");
  });

  it("multi-source shows per-source applicable figures instead of one ambiguous total", () => {
    expect(dialog).toContain("sourceApplicable[src.id]");
  });

  it("over-applicable entry stays UI-only while reused material still requires a source", () => {
    expect(dialog).toContain("warning-over-applicable");
    expect(dialog).toMatch(/const canDraft = allocQtyNum > 0 && arrangementType !== "not_decided" && \(!sourceRequired \|\| sourceExcavationBoqItemId != null\);/);
  });
});

describe("Batch 02 — M/N: Auto Sequence and Gantt untouched", () => {
  it("sequencer value for the fixture reach is unchanged from Batch 01", () => {
    const r = getItemScopeQuantity({
      item, scopeSegments: segs,
      range: { chainageFrom: 0, chainageTo: 4, side: "lhs" },
      stretchDomain: [
        { chainageFrom: 0, chainageTo: 4, side: "lhs" },
        { chainageFrom: 4, chainageTo: 8, side: "full_width" },
        { chainageFrom: 8, chainageTo: 10, side: "rhs" },
      ],
    });
    expect(r.denominatorBasis).toBe("stretch-domain");
    expect(r.resolvedQty).toBeCloseTo(12000 * (1.5 / 6.5), 3); // exact Auto Sequence figure
  });

  it("Gantt Under/Over badge still compares programmed vs raw contract qty", () => {
    const src = readFileSync("client/src/pages/WorkProgramme.tsx", "utf8");
    expect(src).toMatch(/planned\s*-\s*boqQty/);
  });

  it("arrangement helper never passes a stretchDomain to the resolver", () => {
    const helper = readFileSync("shared/arrangementApplicableQty.ts", "utf8");
    expect(helper).toContain("stretchDomain: null");
  });
});
