/**
 * Instruction 031 — shared DPR ↔ programme-bar link logic.
 *
 * These rules are used by BOTH DPR screens (Detailed/SiteEntry and Guided) and
 * by the server-side validateProgressProgrammeLinks, so this suite is the
 * contract for all three:
 *  - Part C: auto-bar-matching (1 compatible → auto, several → choose, none →
 *    unplanned; incompatible sides excluded).
 *  - Parts B/F: per-row validation — strict on submit, draft-lenient so drafts
 *    keep their programmeBarId with incomplete chainage / missing reason.
 *  - Part G: "Outside planned reach — review required" derivation.
 *  - Part E: quantity-source suggestion for direct-entry quantities.
 */
import { describe, it, expect } from "vitest";
import {
  autoMatchBar,
  isBarCompatible,
  chainageOutsideBar,
  checkProgrammeLinkRow,
  deriveChainageReviewStatus,
  suggestQuantitySource,
  normalizeDprSideKey,
  barBalanceFigures,
  CHAINAGE_REVIEW_REQUIRED,
  type LinkableBar,
} from "../shared/dprProgrammeLink";

const bar = (over: Partial<LinkableBar> = {}): LinkableBar => ({
  id: 1,
  side: "lhs",
  chainageFrom: 1.0,
  chainageTo: 2.0,
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  plannedQty: 100,
  reportedQty: 40,
  remainingQty: 60,
  unit: "CUM",
  ...over,
});

describe("normalizeDprSideKey", () => {
  it("maps display labels and keys to canonical side keys", () => {
    expect(normalizeDprSideKey("LHS")).toBe("lhs");
    expect(normalizeDprSideKey("rhs")).toBe("rhs");
    expect(normalizeDprSideKey("Full Width")).toBe("full_width");
    expect(normalizeDprSideKey("Both Sides")).toBe("both_sides");
    expect(normalizeDprSideKey("")).toBeNull();
    expect(normalizeDprSideKey(null)).toBeNull();
  });
});

describe("chainageOutsideBar", () => {
  it("inside / boundary ranges are not outside", () => {
    expect(chainageOutsideBar(1.2, 1.8, bar())).toBe(false);
    expect(chainageOutsideBar(1.0, 2.0, bar())).toBe(false);
  });
  it("ranges extending past either end are outside", () => {
    expect(chainageOutsideBar(0.9, 1.5, bar())).toBe(true);
    expect(chainageOutsideBar(1.5, 2.1, bar())).toBe(true);
  });
  it("incomplete or unbounded input is never 'outside'", () => {
    expect(chainageOutsideBar(null, 1.5, bar())).toBe(false);
    expect(chainageOutsideBar(1.2, 1.5, bar({ chainageFrom: null }))).toBe(false);
  });
});

describe("Part C — autoMatchBar", () => {
  it("exactly one compatible bar → auto-link", () => {
    const r = autoMatchBar([bar()], { dprDate: "2026-08-05" });
    expect(r.kind).toBe("auto");
    if (r.kind === "auto") expect(r.bar.id).toBe(1);
  });
  it("several compatible bars → choose", () => {
    const r = autoMatchBar([bar(), bar({ id: 2, chainageFrom: 2, chainageTo: 3 })], { dprDate: "2026-08-05" });
    expect(r.kind).toBe("choose");
    if (r.kind === "choose") expect(r.candidates).toHaveLength(2);
  });
  it("no bars → none (unplanned entry path)", () => {
    expect(autoMatchBar([], {}).kind).toBe("none");
  });
  it("side-incompatible bars are excluded from the candidate list", () => {
    const r = autoMatchBar([bar(), bar({ id: 2, side: "rhs" })], { dprDate: "2026-08-05", sideKey: "lhs" });
    expect(r.kind).toBe("auto");
    if (r.kind === "auto") expect(r.bar.id).toBe(1);
    expect(isBarCompatible(bar({ side: "rhs" }), { sideKey: "lhs" })).toBe(false);
  });
  it("prefers bars active on the DPR date but falls back to inactive ones", () => {
    const active = bar();
    const inactive = bar({ id: 2, startDate: "2026-01-01", endDate: "2026-01-31", chainageFrom: 3, chainageTo: 4 });
    const r = autoMatchBar([active, inactive], { dprDate: "2026-08-05" });
    expect(r.kind).toBe("auto");
    if (r.kind === "auto") expect(r.bar.id).toBe(1);
    const r2 = autoMatchBar([inactive], { dprDate: "2026-08-05" });
    expect(r2.kind).toBe("auto");
  });
  it("entered chainage narrows candidates by containment", () => {
    const r = autoMatchBar(
      [bar(), bar({ id: 2, chainageFrom: 2, chainageTo: 3 })],
      { dprDate: "2026-08-05", fromKm: 2.2, toKm: 2.8 },
    );
    expect(r.kind).toBe("auto");
    if (r.kind === "auto") expect(r.bar.id).toBe(2);
  });
});

describe("Parts B/F — checkProgrammeLinkRow strict vs draft", () => {
  const okRow = { activity: "GSB", side: "LHS", chainageFrom: "1+200", chainageTo: "1+500", chainageOverrideReason: "" };

  it("valid in-range row passes strict", () => {
    expect(checkProgrammeLinkRow(okRow, bar())).toBeNull();
  });
  it("strict: missing chainage fails; draft: passes (link kept)", () => {
    const row = { ...okRow, chainageFrom: "", chainageTo: "" };
    expect(checkProgrammeLinkRow(row, bar())).toMatch(/chainage From and To are required/);
    expect(checkProgrammeLinkRow(row, bar(), { draft: true })).toBeNull();
  });
  it("strict: To <= From fails; draft: passes", () => {
    const row = { ...okRow, chainageFrom: "1+500", chainageTo: "1+200" };
    expect(checkProgrammeLinkRow(row, bar())).toMatch(/greater than From/);
    expect(checkProgrammeLinkRow(row, bar(), { draft: true })).toBeNull();
  });
  it("strict: out-of-range without reason fails; with reason passes; draft without reason passes", () => {
    const row = { ...okRow, chainageFrom: "0+800", chainageTo: "1+500" };
    expect(checkProgrammeLinkRow(row, bar())).toMatch(/outside the bar's planned range/);
    expect(checkProgrammeLinkRow({ ...row, chainageOverrideReason: "client instruction" }, bar())).toBeNull();
    expect(checkProgrammeLinkRow(row, bar(), { draft: true })).toBeNull();
  });
  it("wrong side is a structural error even for drafts", () => {
    const row = { ...okRow, side: "RHS" };
    expect(checkProgrammeLinkRow(row, bar())).toMatch(/not compatible/);
    expect(checkProgrammeLinkRow(row, bar(), { draft: true })).toMatch(/not compatible/);
  });
  it("missing side on a side-specific bar: blocked on submit, allowed in draft", () => {
    const row = { ...okRow, side: "" };
    expect(checkProgrammeLinkRow(row, bar())).toMatch(/state the executed side/);
    expect(checkProgrammeLinkRow(row, bar(), { draft: true })).toBeNull();
  });
  it("structure_location (point work) skips linear chainage rules", () => {
    const row = { ...okRow, chainageFrom: "", chainageTo: "" };
    expect(checkProgrammeLinkRow(row, bar({ planningMode: "structure_location" }))).toBeNull();
  });
});

describe("Part G — deriveChainageReviewStatus", () => {
  it("out-of-range row → review_required; in-range → null", () => {
    expect(deriveChainageReviewStatus({ chainageFrom: "0+800", chainageTo: "1+500" }, bar())).toBe(CHAINAGE_REVIEW_REQUIRED);
    expect(deriveChainageReviewStatus({ chainageFrom: "1+200", chainageTo: "1+500" }, bar())).toBeNull();
  });
  it("no bar / point work → null", () => {
    expect(deriveChainageReviewStatus({ chainageFrom: "0+800", chainageTo: "1+500" }, null)).toBeNull();
    expect(deriveChainageReviewStatus({ chainageFrom: "0+800", chainageTo: "1+500" }, bar({ planningMode: "structure_location" }))).toBeNull();
  });
  it("prefers numeric km fields over display text", () => {
    expect(deriveChainageReviewStatus({ chainageFromKm: 0.8, chainageToKm: 1.5, chainageFrom: "junk", chainageTo: "junk" }, bar())).toBe(CHAINAGE_REVIEW_REQUIRED);
  });
});

describe("Part D — barBalanceFigures", () => {
  it("returns bar-scoped planned/done/balance", () => {
    expect(barBalanceFigures(bar())).toEqual({ currentQty: 100, totalActual: 40, balance: 60, unit: "CUM" });
  });
  it("null when the bar has no planned quantity", () => {
    expect(barBalanceFigures(bar({ plannedQty: undefined as any }))).toBeNull();
  });
});

describe("Part E — suggestQuantitySource", () => {
  it("MT-like units suggest weighment, everything else measured", () => {
    expect(suggestQuantitySource("MT")).toBe("weighment_mt");
    expect(suggestQuantitySource("Tonne")).toBe("weighment_mt");
    expect(suggestQuantitySource("CUM")).toBe("measured");
    expect(suggestQuantitySource(null)).toBe("measured");
  });
});
