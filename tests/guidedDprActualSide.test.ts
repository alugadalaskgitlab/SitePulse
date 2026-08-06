/**
 * Batch 1 — Guided DPR Actual Execution Side Correctness.
 *
 * Planned side (programme bar) and actual execution side (DPR entry) are
 * separate concepts. This suite proves the settled compatibility matrix, the
 * "Both Sides" actual value, side-specific chainage coverage over a shared
 * quantity balance, and auto-link behaviour — all against the shared modules
 * used by BOTH the client and the server.
 */
import { describe, it, expect } from "vitest";
import {
  allowedDprSides,
  dprSideOptionsForBar,
  isDprSideCompatible,
  barSideLabel,
} from "../shared/barSide";
import {
  normalizeDprSideKey,
  autoMatchBar,
  isBarCompatible,
  barSideCoverage,
  checkProgrammeLinkRow,
  type LinkableBar,
} from "../shared/dprProgrammeLink";

const bar = (side: string | null, from = 2.4, to = 3.25): LinkableBar => ({
  id: 1, side, chainageFrom: from, chainageTo: to, plannedQty: 1000, reportedQty: 0, remainingQty: 1000, unit: "CUM",
});

describe("settled compatibility matrix (tests 1-13, 23)", () => {
  const M: Array<[string, string, boolean]> = [
    // planned both_sides
    ["both_sides", "lhs", true],          // 1
    ["both_sides", "rhs", true],          // 2
    ["both_sides", "both_sides", true],   // 3
    ["both_sides", "full_width", true],   // 4
    // planned full_width
    ["full_width", "lhs", true],          // 5
    ["full_width", "rhs", true],          // 6
    ["full_width", "both_sides", true],   // 7
    ["full_width", "full_width", true],   // 8
    // planned LHS — everything but LHS blocked
    ["lhs", "lhs", true],
    ["lhs", "rhs", false],                // 9
    ["lhs", "both_sides", false],         // 10
    ["lhs", "full_width", false],         // 11
    // planned RHS — mirrored (12)
    ["rhs", "rhs", true],
    ["rhs", "lhs", false],
    ["rhs", "both_sides", false],
    ["rhs", "full_width", false],
    // corridors — only the matching corridor (13)
    ["median", "median", true],
    ["median", "lhs", false],
    ["median", "both_sides", false],
    ["service_road_lhs", "service_road_lhs", true],
    ["service_road_lhs", "rhs", false],
    ["service_road_lhs", "full_width", false],
  ];
  for (const [planned, actual, ok] of M) {
    it(`planned ${planned} + actual ${actual} → ${ok ? "accepted" : "blocked"}`, () => {
      expect(isDprSideCompatible(planned, actual)).toBe(ok);
    });
  }

  it("test 23: 'Both Sides' offered exactly where the matrix allows it", () => {
    // Offered: unlinked default + both/full planned bars.
    expect(dprSideOptionsForBar(null)).toContain("both_sides");
    expect(dprSideOptionsForBar("both_sides")).toContain("both_sides");
    expect(dprSideOptionsForBar("full_width")).toContain("both_sides");
    // Blocked: side-specific and corridor bars.
    expect(dprSideOptionsForBar("lhs")).toEqual(["lhs"]);
    expect(dprSideOptionsForBar("rhs")).toEqual(["rhs"]);
    expect(dprSideOptionsForBar("median")).toEqual(["median"]);
    expect(dprSideOptionsForBar("service_road_rhs")).toEqual(["service_road_rhs"]);
  });

  it("'Both Sides' display label round-trips through normalisation", () => {
    expect(normalizeDprSideKey("Both Sides")).toBe("both_sides");
    expect(normalizeDprSideKey(barSideLabel("both_sides"))).toBe("both_sides");
    expect(allowedDprSides("both_sides")).toEqual(["lhs", "rhs", "both_sides", "full_width"]);
  });

  it("server-side row check blocks incompatible sides even in drafts", () => {
    const row = { side: "Both Sides", chainageFrom: "2.500", chainageTo: "2.600" };
    expect(checkProgrammeLinkRow(row as any, bar("lhs"), { draft: true })).toBeTruthy();  // blocked
    expect(checkProgrammeLinkRow(row as any, bar("both_sides"), { draft: false })).toBeNull(); // allowed
  });

  it("submit requires an explicit actual side even on a bar with NO planned side (legacy)", () => {
    const row = { side: "", chainageFrom: "2.500", chainageTo: "2.600" };
    expect(checkProgrammeLinkRow(row as any, bar(null), { draft: false })).toMatch(/actual execution side/i);
    expect(checkProgrammeLinkRow(row as any, bar(null), { draft: true })).toBeNull(); // drafts stay lenient
    // structure/point bars are exempt — side has no meaning there
    expect(checkProgrammeLinkRow({ side: "" } as any, { ...bar(null), planningMode: "structure_location" }, { draft: false })).toBeNull();
  });
});

describe("auto-linking uses actual side + matrix (test 21)", () => {
  it("Both-Sides/Full-Width bars are compatible with one-sided actual execution", () => {
    expect(isBarCompatible(bar("both_sides"), { sideKey: "lhs" })).toBe(true);
    expect(isBarCompatible(bar("full_width"), { sideKey: "rhs" })).toBe(true);
    expect(isBarCompatible(bar("both_sides"), { sideKey: "both_sides" })).toBe(true);
  });
  it("an opposite-side-only bar never auto-links", () => {
    expect(isBarCompatible(bar("lhs"), { sideKey: "rhs" })).toBe(false);
    const res = autoMatchBar([bar("lhs")], { dprDate: "2026-08-06", sideKey: "rhs", fromKm: 2.5, toKm: 2.6 });
    expect(res.kind).not.toBe("auto");
  });
  it("exactly one compatible bar → auto-link", () => {
    const bars = [bar("lhs"), { ...bar("both_sides"), id: 2 }];
    const res = autoMatchBar(bars, { dprDate: "2026-08-06", sideKey: "rhs", fromKm: 2.5, toKm: 2.6 });
    expect(res.kind).toBe("auto");
    if (res.kind === "auto") expect(res.bar.id).toBe(2);
  });
});

describe("side-specific coverage over a shared quantity (tests 17-20, Part E)", () => {
  const B = bar("both_sides", 2.0, 3.0);

  it("test 17: LHS progress never marks RHS chainage covered", () => {
    const cov = barSideCoverage(B, [{ side: "LHS", fromKm: 2.0, toKm: 3.0 }]);
    expect(cov.lhsFraction).toBeCloseTo(1, 6);
    expect(cov.rhsCoveredKm).toBe(0);
    expect(cov.fullyCovered).toBe(false); // full LHS alone ≠ complete Both-Sides bar (test 19)
  });

  it("test 18: RHS progress never marks LHS chainage covered", () => {
    const cov = barSideCoverage(B, [{ side: "rhs", fromKm: 2.0, toKm: 2.5 }]);
    expect(cov.rhsCoveredKm).toBeCloseTo(0.5, 6);
    expect(cov.lhsCoveredKm).toBe(0);
  });

  it("test 19: fully covered only when LHS + RHS jointly account for the range", () => {
    const partial = barSideCoverage(B, [
      { side: "LHS", fromKm: 2.0, toKm: 3.0 },
      { side: "RHS", fromKm: 2.0, toKm: 2.6 },
    ]);
    expect(partial.fullyCovered).toBe(false);
    const joint = barSideCoverage(B, [
      { side: "LHS", fromKm: 2.0, toKm: 3.0 },
      { side: "RHS", fromKm: 2.0, toKm: 3.0 },
    ]);
    expect(joint.fullyCovered).toBe(true);
    const explicitBoth = barSideCoverage(B, [{ side: "Both Sides", fromKm: 2.0, toKm: 3.0 }]);
    expect(explicitBoth.fullyCovered).toBe(true);
    const fullWidth = barSideCoverage(B, [{ side: "Full Width", fromKm: 2.0, toKm: 3.0 }]);
    expect(fullWidth.fullyCovered).toBe(true);
  });

  it("no double counting: overlapping entries merge, never sum twice", () => {
    const cov = barSideCoverage(B, [
      { side: "LHS", fromKm: 2.0, toKm: 2.6 },
      { side: "LHS", fromKm: 2.4, toKm: 3.0 },
      { side: "Both Sides", fromKm: 2.2, toKm: 2.8 },
    ]);
    expect(cov.lhsCoveredKm).toBeCloseTo(1.0, 6); // merged 2.0–3.0, not 1.8
    expect(cov.rhsCoveredKm).toBeCloseTo(0.6, 6);
  });

  it("coverage is clipped to the bar's own range; blank side claims nothing", () => {
    const cov = barSideCoverage(B, [
      { side: "LHS", fromKm: 1.0, toKm: 4.0 },   // clipped to 2.0–3.0
      { side: "", fromKm: 2.0, toKm: 3.0 },      // no side → no coverage claim
      { side: "RHS", fromKm: null, toKm: 3.0 },  // incomplete chainage → nothing
    ]);
    expect(cov.lhsCoveredKm).toBeCloseTo(1.0, 6);
    expect(cov.rhsCoveredKm).toBe(0);
  });

  it("one-sided planned bar is fully covered by its own side alone", () => {
    const cov = barSideCoverage(bar("lhs", 2.0, 3.0), [{ side: "LHS", fromKm: 2.0, toKm: 3.0 }]);
    expect(cov.fullyCovered).toBe(true);
  });

  it("test 20 (shared quantity): coverage math never splits or duplicates qty — quantity accounting has no side dimension", () => {
    // remainingQty derives from plannedQty - sum(all entries' qty) regardless
    // of side (server getReportedQtyByBar groups by bar only). Coverage output
    // deliberately contains NO quantity figures to split.
    const cov = barSideCoverage(B, [
      { side: "LHS", fromKm: 2.0, toKm: 2.5 },
      { side: "RHS", fromKm: 2.5, toKm: 3.0 },
    ]);
    expect(Object.keys(cov).sort()).toEqual(
      ["fullyCovered", "lhs", "lhsCoveredKm", "lhsFraction", "rhs", "rhsCoveredKm", "rhsFraction"].sort(),
    );
  });
});
