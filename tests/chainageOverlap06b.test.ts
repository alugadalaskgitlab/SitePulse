/**
 * Batch 06B — chainage duplicate/overlap guard tests.
 * Covers the neutral shared helper (shared/chainageOverlap.ts) that Guided
 * DPR, Detailed DPR, SiteEdit AND the server Final-Submit recheck all use,
 * plus the Progress Report compatibility re-exports.
 */
import { describe, it, expect } from "vitest";
import {
  KM_EPS,
  normaliseReportSide,
  sidesMayOverlap,
  normaliseKmRange,
  overlapSegment,
  compareChainageRows,
  isChainageGuardRow,
  findChainageOverlaps,
  findActionableChainageOverlaps,
  chainageOverlapReadinessIssues,
  unchangedChainageRowKeys,
  type CandidateChainageRow,
  type PriorChainageEntry,
} from "../shared/chainageOverlap";
import {
  normaliseReportSide as reportSide,
  sidesMayOverlap as reportSidesMayOverlap,
  detectOverlaps,
  type ReportEntry,
} from "../shared/progressReport";

const row = (o: Partial<CandidateChainageRow> & { rowKey: string | number }): CandidateChainageRow => ({
  boqItemId: 1, side: "RHS", fromKm: 2.0, toKm: 2.2, ...o,
});
const prior = (o: Partial<PriorChainageEntry>): PriorChainageEntry => ({
  entryId: 900, dprId: 123, dprDate: "2026-08-08", boqItemId: 1,
  side: "RHS", fromKm: 2.15, toKm: 2.18, quantity: 35, uom: "Cum", ...o,
});

describe("side semantics (§19 — reused, not reinvented)", () => {
  it("LHS vs RHS never overlap; same side may; Both/Full overlap everything; unknown is conservative", () => {
    expect(sidesMayOverlap("LHS", "RHS")).toBe(false);
    expect(sidesMayOverlap("LHS", "Left")).toBe(true);
    expect(sidesMayOverlap("RHS", "rhs")).toBe(true);
    expect(sidesMayOverlap("Both Sides", "LHS")).toBe(true);
    expect(sidesMayOverlap("Full Width", "RHS")).toBe(true);
    expect(sidesMayOverlap(null, "LHS")).toBe(true);
    expect(sidesMayOverlap("Median", "LHS")).toBe(false);
  });
  it("Progress Report re-exports are the SAME functions (single definition)", () => {
    expect(reportSide).toBe(normaliseReportSide);
    expect(reportSidesMayOverlap).toBe(sidesMayOverlap);
  });
});

describe("interval semantics (§20)", () => {
  it("adjacent ranges are NOT overlap (C)", () => {
    expect(overlapSegment(2.0, 2.1, 2.1, 2.2)).toBeNull();
  });
  it("true intersection returns the exact segment (I)", () => {
    expect(overlapSegment(2.1, 2.3, 2.25, 2.4)).toEqual({ from: 2.25, to: 2.3 });
  });
  it("reverse-entered chainage is canonicalised, zero-length ignored", () => {
    expect(normaliseKmRange(2.2, 2.0)).toEqual({ from: 2.0, to: 2.2 });
    expect(overlapSegment(2.1, 2.1, 2.0, 2.2)).toBeNull();
    expect(normaliseKmRange(null, 2)).toBeNull();
    expect(normaliseKmRange(NaN, 2)).toBeNull();
  });
});

describe("canonical pair comparator (06X-HF2)", () => {
  it("applies item, side, strict-intersection and explicit-layer rules together", () => {
    expect(compareChainageRows(row({ rowKey: 1 }), row({ rowKey: 2, boqItemId: 2 }))).toBeNull();
    expect(compareChainageRows(row({ rowKey: 1, side: "LHS" }), row({ rowKey: 2, side: "RHS" }))).toBeNull();
    expect(compareChainageRows(row({ rowKey: 1, toKm: 2.1 }), row({ rowKey: 2, fromKm: 2.1 }))).toBeNull();
    expect(compareChainageRows(row({ rowKey: 1, layerNo: 1 }), row({ rowKey: 2, layerNo: 2 }))).toBeNull();
    expect(compareChainageRows(row({ rowKey: 1, layerNo: null }), row({ rowKey: 2, layerNo: 2 }))).not.toBeNull();
  });
});

describe("scope (§3) — only meaningful chainage rows participate (V)", () => {
  it("rows without BOQ item / chainage / with noSiteWork are out of scope", () => {
    expect(isChainageGuardRow(row({ rowKey: 0 }))).toBe(true);
    expect(isChainageGuardRow(row({ rowKey: 0, boqItemId: null }))).toBe(false);
    expect(isChainageGuardRow(row({ rowKey: 0, fromKm: null }))).toBe(false);
    expect(isChainageGuardRow(row({ rowKey: 0, toKm: null }))).toBe(false);
    expect(isChainageGuardRow(row({ rowKey: 0, noSiteWork: true }))).toBe(false);
  });
});

describe("same-DPR overlaps (§4A)", () => {
  it("A: exact same item+side+range in one DPR → exact hit on both rows", () => {
    const hits = findChainageOverlaps([row({ rowKey: 0 }), row({ rowKey: 1 })], []);
    expect(hits.get(0)![0]).toMatchObject({ kind: "exact", source: "same_dpr", withRowKey: 1 });
    expect(hits.get(1)![0]).toMatchObject({ kind: "exact", source: "same_dpr", withRowKey: 0 });
  });
  it("B: partial overlap in one DPR → partial hit with the exact segment", () => {
    const hits = findChainageOverlaps(
      [row({ rowKey: 0, fromKm: 2.0, toKm: 2.2 }), row({ rowKey: 1, fromKm: 2.15, toKm: 2.3 })], [],
    );
    expect(hits.get(1)![0]).toMatchObject({ kind: "partial", segmentFromKm: 2.15, segmentToKm: 2.2 });
  });
  it("C: adjacent chainages in one DPR → no warning", () => {
    const hits = findChainageOverlaps(
      [row({ rowKey: 0, fromKm: 2.0, toKm: 2.1 }), row({ rowKey: 1, fromKm: 2.1, toKm: 2.2 })], [],
    );
    expect(hits.size).toBe(0);
  });
  it("D: LHS vs RHS same chainage → no warning", () => {
    const hits = findChainageOverlaps(
      [row({ rowKey: 0, side: "LHS" }), row({ rowKey: 1, side: "RHS" })], [],
    );
    expect(hits.size).toBe(0);
  });
  it("different BOQ items never compared", () => {
    const hits = findChainageOverlaps([row({ rowKey: 0 }), row({ rowKey: 1, boqItemId: 2 })], []);
    expect(hits.size).toBe(0);
  });
});

describe("prior-DPR overlaps (§4B)", () => {
  it("E/H: prior submitted same item/side overlap → hit carrying the DPR reference", () => {
    const hits = findChainageOverlaps([row({ rowKey: 0, fromKm: 2.15, toKm: 2.3 })], [prior({})]);
    expect(hits.get(0)![0]).toMatchObject({
      source: "prior_dpr", withDprId: 123, withEntryId: 900, withDprDate: "2026-08-08",
      withQuantity: 35, withUom: "Cum",
    });
  });
  it("exact duplicate vs partial are differentiated (§6)", () => {
    const exact = findChainageOverlaps([row({ rowKey: 0, fromKm: 2.15, toKm: 2.18 })], [prior({})]);
    expect(exact.get(0)![0].kind).toBe("exact");
    const partial = findChainageOverlaps([row({ rowKey: 0, fromKm: 2.1, toKm: 2.3 })], [prior({})]);
    expect(partial.get(0)![0].kind).toBe("partial");
    expect(partial.get(0)![0]).toMatchObject({ segmentFromKm: 2.15, segmentToKm: 2.18 });
  });
  it("same From/To but different specific side is NOT exact (and not a hit for LHS vs RHS)", () => {
    const hits = findChainageOverlaps([row({ rowKey: 0, side: "LHS", fromKm: 2.15, toKm: 2.18 })], [prior({})]);
    expect(hits.size).toBe(0);
  });
  it("prior on Both Sides overlaps an RHS row", () => {
    const hits = findChainageOverlaps([row({ rowKey: 0, fromKm: 2.16, toKm: 2.17 })], [prior({ side: "Both Sides" })]);
    expect(hits.get(0)).toHaveLength(1);
  });
  it("adjacent prior range → no hit", () => {
    const hits = findChainageOverlaps([row({ rowKey: 0, fromKm: 2.18, toKm: 2.3 })], [prior({})]);
    expect(hits.size).toBe(0);
  });
});

describe("Final-Submit readiness rule (§9)", () => {
  it("K: overlap without reason → mandatory issue in Batch 04 shape", () => {
    const issues = chainageOverlapReadinessIssues([row({ rowKey: 0, label: "WMM" }), row({ rowKey: 1, label: "WMM" })], []);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      section: "activities", label: "WMM",
      message: "Possible chainage overlap requires a reason before submission.",
    });
  });
  it("L/M: overlap WITH a reason → no issue (legitimate repeated work passes)", () => {
    const issues = chainageOverlapReadinessIssues(
      [row({ rowKey: 0, chainageOverrideReason: "Second WMM layer" })], [prior({})],
    );
    expect(issues).toHaveLength(0);
  });
  it("no overlap → no issue regardless of reason", () => {
    expect(chainageOverlapReadinessIssues([row({ rowKey: 0 })], [])).toHaveLength(0);
  });
  it("N/O: server-shape check — a raw payload with both same-DPR and prior overlaps yields issues (frontend bypass covered)", () => {
    const issues = chainageOverlapReadinessIssues(
      [row({ rowKey: 0 }), row({ rowKey: 1 })],
      [prior({ fromKm: 2.05, toKm: 2.1 })],
    );
    expect(issues).toHaveLength(2); // one per row, not per hit
  });
});

describe("submitted-version unchanged history exemption (06X-HF2)", () => {
  it("exempts an unchanged persisted claim from a newly discovered prior overlap", () => {
    const current = [row({ rowKey: "unchanged", fromKm: 2.15, toKm: 2.18 })];
    const exempt = unchangedChainageRowKeys(current, [row({ rowKey: "old", fromKm: 2.15, toKm: 2.18 })]);
    expect(exempt).toEqual(new Set(["unchanged"]));
    expect(chainageOverlapReadinessIssues(current, [prior({})], { exemptRowKeys: exempt })).toEqual([]);
  });

  it("new or overlap-relevant changed claims are never exempt", () => {
    const current = [
      row({ rowKey: "changed-range", boqItemId: 1, fromKm: 2.14, toKm: 2.18 }),
      row({ rowKey: "changed-side", boqItemId: 2, side: "LHS" }),
      row({ rowKey: "changed-layer", boqItemId: 3, layerNo: 2 }),
      row({ rowKey: "new", boqItemId: 4 }),
    ];
    const persisted = [
      row({ rowKey: 1, boqItemId: 1, fromKm: 2.15, toKm: 2.18 }),
      row({ rowKey: 2, boqItemId: 2, side: "RHS" }),
      row({ rowKey: 3, boqItemId: 3, layerNo: 1 }),
    ];
    expect(unchangedChainageRowKeys(current, persisted).size).toBe(0);
  });

  it("uses multiset matching so an added duplicate remains new", () => {
    const current = [row({ rowKey: "existing" }), row({ rowKey: "duplicate" })];
    const exempt = unchangedChainageRowKeys(current, [row({ rowKey: "persisted" })]);
    expect(exempt.size).toBe(1);
    expect(exempt.has("existing")).toBe(true);
    expect(exempt.has("duplicate")).toBe(false);
    const issues = chainageOverlapReadinessIssues(current, [], { exemptRowKeys: exempt });
    expect(issues.map((issue) => issue.rowKey)).toEqual(["duplicate"]);
  });

  it("the version route supplies original progress to the shared exemption", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    const versionSlice = routes.slice(
      routes.indexOf('app.post("/api/dprs/:id/version"'),
      routes.indexOf("// Clone DPR", routes.indexOf('app.post("/api/dprs/:id/version"')),
    );
    expect(routes).toContain("unchangedChainageRowKeys");
    expect(versionSlice).toContain("versionOriginal.progress");
  });
});

describe("submitted DPR edit overlap parity (06X-HF5 Part 2)", () => {
  const clearingPrior = prior({
    entryId: 290,
    dprId: 249,
    dprDate: "2026-05-30",
    boqItemId: 1,
    side: "RHS",
    fromKm: 2.6,
    toKm: 3.1,
  });
  const embankmentPrior = prior({
    entryId: 295,
    dprId: 253,
    dprDate: "2026-06-06",
    boqItemId: 4,
    side: "RHS",
    fromKm: 2.4,
    toKm: 2.7,
  });

  it("A: unchanged submitted claims stay exempt in both UI hits and server readiness", () => {
    const current = [
      row({ rowKey: "clearing", boqItemId: 1, side: "RHS", fromKm: 2.9, toKm: 3.05 }),
      row({ rowKey: "embankment", boqItemId: 4, side: "RHS", fromKm: 2.57, toKm: 2.66 }),
    ];
    const persisted = [
      row({ rowKey: 315, boqItemId: 1, side: "RHS", fromKm: 2.9, toKm: 3.05 }),
      row({ rowKey: 314, boqItemId: 4, side: "RHS", fromKm: 2.57, toKm: 2.66 }),
    ];
    const exemptRowKeys = unchangedChainageRowKeys(current, persisted);

    expect(findActionableChainageOverlaps(
      current,
      [clearingPrior, embankmentPrior],
      { exemptRowKeys },
    ).size).toBe(0);
    expect(chainageOverlapReadinessIssues(
      current,
      [clearingPrior, embankmentPrior],
      { exemptRowKeys },
    )).toEqual([]);
  });

  it("B: a changed overlapping claim shows a hit and requires a reason until one is supplied", () => {
    const changed = [
      row({ rowKey: "clearing", boqItemId: 1, side: "RHS", fromKm: 2.85, toKm: 3.05 }),
    ];
    const persisted = [
      row({ rowKey: 315, boqItemId: 1, side: "RHS", fromKm: 2.9, toKm: 3.05 }),
    ];
    const exemptRowKeys = unchangedChainageRowKeys(changed, persisted);

    expect(exemptRowKeys.size).toBe(0);
    expect(findActionableChainageOverlaps(changed, [clearingPrior], { exemptRowKeys }).get("clearing"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ withDprId: 249, withEntryId: 290 })]));
    expect(chainageOverlapReadinessIssues(changed, [clearingPrior], { exemptRowKeys })).toHaveLength(1);

    const withReason = [{ ...changed[0], chainageOverrideReason: "Correction after survey" }];
    expect(chainageOverlapReadinessIssues(withReason, [clearingPrior], { exemptRowKeys })).toEqual([]);
  });

  it("C: a non-overlapping change remains unaffected", () => {
    const changed = [
      row({ rowKey: "clearing", boqItemId: 1, side: "RHS", fromKm: 3.1, toKm: 3.2 }),
    ];
    expect(findActionableChainageOverlaps(changed, [clearingPrior]).size).toBe(0);
    expect(chainageOverlapReadinessIssues(changed, [clearingPrior])).toEqual([]);
  });

  it("registers the literal overlap-context route before the generic DPR id route", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    expect(routes.indexOf('app.get("/api/dprs/chainage-overlap-context"'))
      .toBeLessThan(routes.indexOf("app.get(api.dprs.get.path"));
  });
});

describe("T: extracted helper does not alter Progress Report overlap behavior", () => {
  const re = (o: Partial<ReportEntry>): ReportEntry => ({
    kind: "progress", entryId: 1, dprId: 10, dprDate: "2026-08-01", boqItemId: 1,
    chainageFromKm: 2.0, chainageToKm: 2.2, side: "RHS", quantity: 10, ...o,
  });
  it("detectOverlaps still flags true intersections and skips adjacency/side mismatch", () => {
    const m1 = detectOverlaps([re({ entryId: 1 }), re({ entryId: 2, dprId: 11, chainageFromKm: 2.15, chainageToKm: 2.3 })]);
    expect(m1.get("progress:1")).toHaveLength(1);
    expect(m1.get("progress:1")![0]).toMatchObject({ withDprId: 11, fromKm: 2.15, toKm: 2.2 });
    const m2 = detectOverlaps([re({ entryId: 1 }), re({ entryId: 2, chainageFromKm: 2.2, chainageToKm: 2.3 })]);
    expect(m2.size).toBe(0);
    const m3 = detectOverlaps([re({ entryId: 1, side: "LHS" }), re({ entryId: 2, side: "RHS" })]);
    expect(m3.size).toBe(0);
  });
  it("KM_EPS unchanged", () => expect(KM_EPS).toBe(1e-6));
});
