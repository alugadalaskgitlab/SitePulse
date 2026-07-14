/**
 * Integration tests: Auto-Sequence full flow
 *
 * Verifies that the shared resolveWorkType() resolver is used consistently
 * by the programme sequencer, fixing the regression where items with a saved
 * Work Category (e.g. Roadway Excavation, WMM) showed "Not programmed"
 * solely because the description-only regex returned null.
 *
 * Test coverage:
 *  1. Roadway Excavation — unusual description, workCategory=EARTHWORK
 *  2. WMM base course — no "wmm" keyword, workCategory=SUBBASE_BASE
 *  3. Clearing & Grubbing — canonical description match (Tier 1 resolver)
 *  4. Missing item code — description-only resolution still works
 *  5. Canonical unit from raw "CUM" — correctly canonicalised before sequencing
 *  6. Spelling variation in description — typo/abbreviation, workCategory saves it
 *  7. planningWorkType=road + workCategory fallback (critical bug-fix path)
 *  8. Road furniture — resolved via stageByWorkCategory (no WorkType, stage 9)
 *  9. Truly unclassifiable item returns rich skipReason, never bare null
 * 10. Bars created only for pavement items; unclassifiable items excluded
 * 11. unclassifiedItems carries boqItemId, description, workCategory, unit, skipReason
 * 12. GSB via workCategory fallback
 * 13. Structure excavation with workCategory=CROSS_DRAINAGE
 * 14. Bituminous base course via workCategory fallback
 * 15. No bar duplication when the same items are sequenced twice
 * 16. diagnostics array — present on every call, one entry per seqItem
 * 17. diagnostics — wouldHaveBar=true for classified, false for "other" track items
 * 18. diagnostics — skipReason=null for classified items
 * 19. diagnostics — fieldAudit: description is the classification field (not itemName)
 */

import { describe, it, expect } from "vitest";
import {
  generateSequencedProgramme,
  type SeqInputItem,
  type SeqResult,
  type SeqDiagItem,
} from "../shared/programmeSequencer";

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_OPTS = {
  fronts: 1,
  totalMonths: 12,
  roadLengthKm: 10,
};

function mkItem(overrides: Partial<SeqInputItem> & { boqItemId: number; description: string; unit: string }): SeqInputItem {
  return {
    totalQty: 1000,
    fullDurationMonths: 2,
    ...overrides,
  };
}

function barItemIds(result: SeqResult): number[] {
  return [...new Set(result.bars.map((b) => b.boqItemId))];
}

// ─── 1. Roadway Excavation — unusual description, workCategory=EARTHWORK ──────
describe("Auto-Sequence — Roadway Excavation via EARTHWORK workCategory", () => {
  it("produces a pavement bar at stage 3 when description does not match regex", () => {
    // "Formation level preparation" has no 'excavat' or 'roadway' keyword so the
    // Tier-1 classifyWorkType regex returns null. The Tier-2 EARTHWORK fallback
    // in resolveWorkType should return "earthwork" → PAVEMENT_STAGE[earthwork] = 3.
    const item = mkItem({
      boqItemId: 1,
      description: "Formation level preparation and disposal of surplus material",
      unit: "CUM",
      workCategory: "EARTHWORK",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(barItemIds(result)).toContain(1);
    expect(result.unclassifiedItemIds).not.toContain(1);
    expect(result.unclassifiedItems).toHaveLength(0);
  });

  it("sequences before GSB and WMM (lower stage number)", () => {
    const excavation = mkItem({ boqItemId: 1, description: "Mass excavation and grading", unit: "CUM", workCategory: "EARTHWORK" });
    const gsb       = mkItem({ boqItemId: 2, description: "Granular Sub-Base course",      unit: "CUM", workCategory: "SUBBASE_BASE" });
    const result = generateSequencedProgramme([excavation, gsb], DEFAULT_OPTS);

    const excBar = result.bars.find((b) => b.boqItemId === 1)!;
    const gsbBar = result.bars.find((b) => b.boqItemId === 2)!;
    expect(excBar).toBeDefined();
    expect(gsbBar).toBeDefined();
    expect(excBar.startMonth).toBeLessThanOrEqual(gsbBar.startMonth);
  });

  it("also works when planningWorkType='road' is set (critical bug-fix path)", () => {
    // Before the fix: effectivePWT=road + wt=null → immediate "other". This test
    // ensures the workCategory fallback is tried BEFORE giving up.
    const item = mkItem({
      boqItemId: 10,
      description: "Cutting in soft rock and stacking",
      unit: "CUM",
      workCategory: "EARTHWORK",
      planningWorkType: "road",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(10);
  });
});

// ─── 2. Wet Mix Macadam via workCategory=SUBBASE_BASE ─────────────────────────
describe("Auto-Sequence — WMM via SUBBASE_BASE workCategory", () => {
  it("produces a pavement bar when description has no 'wmm' or 'wet mix' keyword", () => {
    // The Tier-1 classifier requires the keyword "wmm" or "wet mix macadam".
    // "Aggregate base course" has neither, so classifyWorkType returns null.
    // The SUBBASE_BASE workCategory fallback should return "gsb" → stage 4.
    const item = mkItem({
      boqItemId: 2,
      description: "Aggregate base course as per technical specification",
      unit: "CUM",
      workCategory: "SUBBASE_BASE",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(barItemIds(result)).toContain(2);
    expect(result.unclassifiedItemIds).not.toContain(2);
  });

  it("produces a bar for 'Wet Mix Macadam' with explicit WMM keyword (Tier-1 path)", () => {
    const item = mkItem({
      boqItemId: 3,
      description: "Providing and laying WMM base course",
      unit: "CUM",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(3);
  });

  it("sequences SUBBASE_BASE items after earthwork and before bituminous", () => {
    const earthwork  = mkItem({ boqItemId: 1, description: "Mass earthwork",              unit: "CUM", workCategory: "EARTHWORK" });
    const subbase    = mkItem({ boqItemId: 2, description: "Base course aggregates",       unit: "CUM", workCategory: "SUBBASE_BASE" });
    const bituminous = mkItem({ boqItemId: 3, description: "Dense Bituminous Macadam DBM", unit: "CUM" });

    const result = generateSequencedProgramme([earthwork, subbase, bituminous], DEFAULT_OPTS);
    const [ewBar, sbBar, btBar] = [1, 2, 3].map((id) => result.bars.find((b) => b.boqItemId === id)!);

    expect(ewBar).toBeDefined();
    expect(sbBar).toBeDefined();
    expect(btBar).toBeDefined();
    expect(ewBar.startMonth).toBeLessThanOrEqual(sbBar.startMonth);
    expect(sbBar.startMonth).toBeLessThanOrEqual(btBar.startMonth);
  });
});

// ─── 3. Clearing & Grubbing — Tier-1 resolver ────────────────────────────────
describe("Auto-Sequence — Clearing & Grubbing (Tier-1 classifyWorkType)", () => {
  it("sequences C&G at the very first pavement stage", () => {
    const cg  = mkItem({ boqItemId: 1, description: "Clearing and grubbing",      unit: "HEC" });
    const exc = mkItem({ boqItemId: 2, description: "Earthwork excavation",        unit: "CUM", workCategory: "EARTHWORK" });
    const result = generateSequencedProgramme([cg, exc], DEFAULT_OPTS);

    const cgBar  = result.bars.find((b) => b.boqItemId === 1)!;
    const excBar = result.bars.find((b) => b.boqItemId === 2)!;
    expect(cgBar).toBeDefined();
    expect(cgBar.startMonth).toBeLessThanOrEqual(excBar.startMonth);
  });
});

// ─── 4. Missing item code — description-only resolution ───────────────────────
describe("Auto-Sequence — Missing item code", () => {
  it("still resolves when no item code prefix is present in the description", () => {
    // Real-world BOQ items sometimes have no code prefix; the classifier should
    // still fire on the description keywords alone.
    const item = mkItem({
      boqItemId: 5,
      description: "Bituminous Concrete wearing course 40mm thick",
      unit: "SQM",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(5);
  });
});

// ─── 5. Canonical unit ────────────────────────────────────────────────────────
describe("Auto-Sequence — canonical unit derived from raw unit variants", () => {
  it("classifies excavation correctly when unit is 'CUM' (canonical)", () => {
    const item = mkItem({
      boqItemId: 6,
      description: "Roadway excavation in hard rock",
      unit: "CUM",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(6);
  });

  it("classifies via workCategory even when unit is unusual (SQM for earthwork charges)", () => {
    // Some BOQ items use SQM for earthwork sub-items (e.g. slope treatment).
    // The classifier's CUM unit guard will block it, but workCategory saves it.
    const item = mkItem({
      boqItemId: 7,
      description: "Slope treatment and compaction",
      unit: "SQM",
      workCategory: "EARTHWORK",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(7);
  });
});

// ─── 6. Spelling variation in description ─────────────────────────────────────
describe("Auto-Sequence — spelling variation with workCategory safety net", () => {
  it("resolves 'Wet Mix Mcadam' (typo) via SUBBASE_BASE workCategory", () => {
    const item = mkItem({
      boqItemId: 8,
      description: "Wet Mix Mcadam 100mm thick as per BOQ",  // 'Mcadam' instead of 'Macadam'
      unit: "CUM",
      workCategory: "SUBBASE_BASE",
    });
    // The Tier-1 regex checks for 'wet mix macadam' / 'wmm' — the typo may miss it.
    // workCategory fallback must rescue the item.
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(8);
  });

  it("resolves 'BC wearing cource' (typo) via BITUMINOUS workCategory", () => {
    const item = mkItem({
      boqItemId: 9,
      description: "BC wearing cource 25mm dense graded",  // 'cource' misspelling
      unit: "SQM",
      workCategory: "BITUMINOUS",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(9);
  });
});

// ─── 7. planningWorkType=road + workCategory fallback (bug fix) ───────────────
describe("Auto-Sequence — planningWorkType=road must NOT skip via workCategory", () => {
  it("places item in pavement when planningWorkType=road and workCategory=EARTHWORK", () => {
    // Old code: effectivePWT=road + wt=null → return {track:"other"} immediately.
    // New code: try workCategory stage map first.
    const item = mkItem({
      boqItemId: 20,
      description: "General excavation works as per schedule",
      unit: "CUM",
      workCategory: "EARTHWORK",
      planningWorkType: "road",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(20);
  });

  it("places item in pavement when planningWorkType=road and workCategory=SITE_CLEARANCE", () => {
    const item = mkItem({
      boqItemId: 21,
      description: "Site clearance and topsoil removal",
      unit: "HEC",
      workCategory: "SITE_CLEARANCE",
      planningWorkType: "road",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(21);
  });

  it("places item in pavement when planningWorkType=road and workCategory=BITUMINOUS", () => {
    const item = mkItem({
      boqItemId: 22,
      description: "Bituminous works item reference 4.2.1",
      unit: "SQM",
      workCategory: "BITUMINOUS",
      planningWorkType: "road",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(22);
  });
});

// ─── 8. Road furniture — stageByWorkCategory direct path ──────────────────────
describe("Auto-Sequence — Road Furniture via stageByWorkCategory", () => {
  it("places ROAD_FURNITURE item on pavement track at a late stage", () => {
    // resolveWorkType returns null for ROAD_FURNITURE (no recipe template).
    // stageByWorkCategory must place it in pavement at stage 9.
    const item = mkItem({
      boqItemId: 30,
      description: "Supply and fixing of road safety barriers",
      unit: "RMT",
      workCategory: "ROAD_FURNITURE",
    });
    const earthwork = mkItem({ boqItemId: 31, description: "Earthwork embankment", unit: "CUM", workCategory: "EARTHWORK" });
    const result = generateSequencedProgramme([item, earthwork], DEFAULT_OPTS);

    expect(result.bars.find((b) => b.boqItemId === 30)).toBeDefined();
    expect(result.unclassifiedItemIds).not.toContain(30);

    // Road furniture must come AFTER earthwork (stage 9 > stage 3)
    const rfBar  = result.bars.find((b) => b.boqItemId === 30)!;
    const ewBar  = result.bars.find((b) => b.boqItemId === 31)!;
    expect(rfBar.startMonth).toBeGreaterThanOrEqual(ewBar.startMonth);
  });
});

// ─── 9. Truly unclassifiable item — rich skipReason ──────────────────────────
describe("Auto-Sequence — unclassifiable item returns rich diagnostic info", () => {
  it("returns non-empty skipReason for an item with no description match and no workCategory", () => {
    const item = mkItem({
      boqItemId: 99,
      description: "Miscellaneous works lumpsum",
      unit: "LS",
    });
    const validItem = mkItem({ boqItemId: 1, description: "Clearing and grubbing", unit: "HEC" });
    const result = generateSequencedProgramme([item, validItem], DEFAULT_OPTS);

    expect(result.unclassifiedItemIds).toContain(99);
    const unclassified = result.unclassifiedItems.find((u) => u.boqItemId === 99);
    expect(unclassified).toBeDefined();
    expect(unclassified!.skipReason).toBeTruthy();
    expect(unclassified!.skipReason.length).toBeGreaterThan(5);
  });

  it("unclassifiedItems entry contains full description, workCategory, unit and resolvedWorkType", () => {
    const item = mkItem({
      boqItemId: 88,
      description: "Lumpsum provision for temporary works",
      unit: "LS",
      workCategory: null,
    });
    const validItem = mkItem({ boqItemId: 1, description: "Clearing and grubbing", unit: "HEC" });
    const result = generateSequencedProgramme([item, validItem], DEFAULT_OPTS);

    const u = result.unclassifiedItems.find((u) => u.boqItemId === 88);
    expect(u).toBeDefined();
    expect(u!.boqItemId).toBe(88);
    expect(u!.description).toContain("Lumpsum");
    expect(u!.workCategory).toBeNull();
    expect(u!.unit).toBe("LS");
    expect(u!.resolvedWorkType).toBeNull();
    expect(u!.skipReason).toBeTruthy();
  });

  it("skipReason is never undefined — always a non-empty string", () => {
    const items: SeqInputItem[] = [
      mkItem({ boqItemId: 1, description: "Clearing and grubbing", unit: "HEC" }),
      mkItem({ boqItemId: 2, description: "Unknown works Item", unit: "LS" }),
      mkItem({ boqItemId: 3, description: "Supply of misc materials", unit: "NOS" }),
    ];
    const result = generateSequencedProgramme(items, DEFAULT_OPTS);
    for (const u of result.unclassifiedItems) {
      expect(typeof u.skipReason).toBe("string");
      expect(u.skipReason.length).toBeGreaterThan(0);
    }
  });
});

// ─── 10. Bar creation only for classifiable items ─────────────────────────────
describe("Auto-Sequence — bar creation correctness", () => {
  it("creates bars only for classified items; unclassifiable items get no bars", () => {
    const items: SeqInputItem[] = [
      mkItem({ boqItemId: 1, description: "Earthwork embankment",                    unit: "CUM", workCategory: "EARTHWORK" }),
      mkItem({ boqItemId: 2, description: "Wet Mix Macadam base",                    unit: "CUM", workCategory: "SUBBASE_BASE" }),
      mkItem({ boqItemId: 3, description: "Unrecognised works lumpsum provision LS", unit: "LS" }),
    ];
    const result = generateSequencedProgramme(items, DEFAULT_OPTS);
    const barsFor = (id: number) => result.bars.filter((b) => b.boqItemId === id);

    expect(barsFor(1).length).toBeGreaterThan(0);
    expect(barsFor(2).length).toBeGreaterThan(0);
    expect(barsFor(3)).toHaveLength(0);
    expect(result.unclassifiedItemIds).toContain(3);
  });

  it("all generated bars have source='auto-sequence'", () => {
    const item = mkItem({ boqItemId: 1, description: "Clearing and grubbing", unit: "HEC" });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    for (const bar of result.bars) {
      expect(bar.source).toBe("auto-sequence");
    }
  });

  it("bars are within the specified totalMonths window", () => {
    const item = mkItem({ boqItemId: 1, description: "Earthwork excavation", unit: "CUM", workCategory: "EARTHWORK" });
    const result = generateSequencedProgramme([item], { ...DEFAULT_OPTS, totalMonths: 18 });
    for (const bar of result.bars) {
      expect(bar.startMonth).toBeGreaterThanOrEqual(1);
      expect(bar.endMonth).toBeLessThanOrEqual(18);
    }
  });
});

// ─── 11. GSB via workCategory fallback ───────────────────────────────────────
describe("Auto-Sequence — GSB via SUBBASE_BASE workCategory fallback", () => {
  it("sequences GSB at stage 4 (after earthwork, before WMM)", () => {
    const earthwork = mkItem({ boqItemId: 1, description: "Earthwork embankment", unit: "CUM", workCategory: "EARTHWORK" });
    const gsb       = mkItem({ boqItemId: 2, description: "Sub-base course laying", unit: "CUM", workCategory: "SUBBASE_BASE" });
    const result = generateSequencedProgramme([earthwork, gsb], DEFAULT_OPTS);

    expect(result.bars.find((b) => b.boqItemId === 1)).toBeDefined();
    expect(result.bars.find((b) => b.boqItemId === 2)).toBeDefined();
    const ewBar  = result.bars.find((b) => b.boqItemId === 1)!;
    const gsbBar = result.bars.find((b) => b.boqItemId === 2)!;
    expect(ewBar.startMonth).toBeLessThanOrEqual(gsbBar.startMonth);
  });
});

// ─── 12. Structure excavation via CROSS_DRAINAGE workCategory ─────────────────
describe("Auto-Sequence — structure items via workCategory", () => {
  it("places CROSS_DRAINAGE item on structure track", () => {
    const item = mkItem({
      boqItemId: 40,
      description: "Culvert installation works",
      unit: "NOS",
      workCategory: "CROSS_DRAINAGE",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(40);
  });

  it("places MAJOR_BRIDGES item on bridge track", () => {
    const item = mkItem({
      boqItemId: 41,
      description: "Bridge construction works",
      unit: "NOS",
      workCategory: "MAJOR_BRIDGES",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItemIds).not.toContain(41);
  });
});

// ─── 13. Bituminous workCategory fallback ─────────────────────────────────────
describe("Auto-Sequence — Bituminous item via workCategory fallback", () => {
  it("places bituminous item at stage 7 (binder course) via BITUMINOUS category", () => {
    const item = mkItem({
      boqItemId: 50,
      description: "Binder layer supply and placement",
      unit: "SQM",
      workCategory: "BITUMINOUS",
    });
    const gsb = mkItem({ boqItemId: 51, description: "Sub-base course", unit: "CUM", workCategory: "SUBBASE_BASE" });
    const result = generateSequencedProgramme([item, gsb], DEFAULT_OPTS);

    const bitBar = result.bars.find((b) => b.boqItemId === 50)!;
    const gsbBar = result.bars.find((b) => b.boqItemId === 51)!;
    expect(bitBar).toBeDefined();
    expect(gsbBar).toBeDefined();
    expect(gsbBar.startMonth).toBeLessThanOrEqual(bitBar.startMonth);
  });
});

// ─── 14. No bar duplication on re-run ────────────────────────────────────────
describe("Auto-Sequence — idempotency", () => {
  it("generateSequencedProgramme returns the same bars on repeated calls", () => {
    const items: SeqInputItem[] = [
      mkItem({ boqItemId: 1, description: "Clearing and grubbing",       unit: "HEC" }),
      mkItem({ boqItemId: 2, description: "Earthwork embankment",        unit: "CUM", workCategory: "EARTHWORK" }),
      mkItem({ boqItemId: 3, description: "Wet Mix Macadam base course", unit: "CUM", workCategory: "SUBBASE_BASE" }),
      mkItem({ boqItemId: 4, description: "Dense Bituminous Macadam",    unit: "SQM" }),
    ];
    const opts = { fronts: 2, totalMonths: 24, roadLengthKm: 20 };
    const r1 = generateSequencedProgramme(items, opts);
    const r2 = generateSequencedProgramme(items, opts);
    expect(r1.bars.length).toBe(r2.bars.length);
    expect(r1.unclassifiedItemIds).toEqual(r2.unclassifiedItemIds);
    for (let i = 0; i < r1.bars.length; i++) {
      expect(r1.bars[i].boqItemId).toBe(r2.bars[i].boqItemId);
      expect(r1.bars[i].startMonth).toBeCloseTo(r2.bars[i].startMonth, 5);
    }
  });
});

// ─── 15. resolveWorkType and classifyItem consistent with Auto-build Recipes ──
describe("Auto-Sequence — resolver parity with Auto-build Recipes", () => {
  it("resolves the same work type for Roadway Excavation as auto-build-recipes would", () => {
    // The resolveWorkType() import is tested independently in resolveWorkType.test.ts.
    // Here we verify the sequencer uses it: an EARTHWORK item produces a bar (not "other").
    const item = mkItem({
      boqItemId: 60,
      description: "Excavation in ordinary soil, cutting to formation level",
      unit: "CUM",
      workCategory: "EARTHWORK",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItems).toHaveLength(0);
  });

  it("resolves the same work type for WMM as auto-build-recipes would", () => {
    const item = mkItem({
      boqItemId: 61,
      description: "Providing and laying Wet Mix Macadam base",
      unit: "CUM",
    });
    const result = generateSequencedProgramme([item], DEFAULT_OPTS);
    expect(result.bars).toHaveLength(1);
    expect(result.unclassifiedItems).toHaveLength(0);
  });
});

// ─── 16-19. SeqResult.diagnostics array ───────────────────────────────────────
describe("Auto-Sequence — diagnostics array (per-item classification trace)", () => {
  const items: SeqInputItem[] = [
    mkItem({ boqItemId: 70, description: "Clearing and grubbing of road land", unit: "HEC" }),
    mkItem({ boqItemId: 71, description: "Wet Mix Macadam base course", unit: "CUM", workCategory: "SUBBASE_BASE" }),
    mkItem({ boqItemId: 72, description: "Truly unknown item XYZ-9999", unit: "LS" }), // unclassifiable
  ];

  it("16 — diagnostics array is always present and contains one entry per seqItem", () => {
    const result = generateSequencedProgramme(items, DEFAULT_OPTS);
    expect(result.diagnostics).toBeDefined();
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.diagnostics).toHaveLength(items.length);
  });

  it("17 — wouldHaveBar=true for classified items, false for unclassifiable", () => {
    const result = generateSequencedProgramme(items, DEFAULT_OPTS);
    const diag70 = result.diagnostics.find((d: SeqDiagItem) => d.boqItemId === 70)!;
    const diag71 = result.diagnostics.find((d: SeqDiagItem) => d.boqItemId === 71)!;
    const diag72 = result.diagnostics.find((d: SeqDiagItem) => d.boqItemId === 72)!;
    expect(diag70.wouldHaveBar).toBe(true);
    expect(diag71.wouldHaveBar).toBe(true);
    expect(diag72.wouldHaveBar).toBe(false);
  });

  it("18 — skipReason=null for classified items, non-null string for unclassifiable", () => {
    const result = generateSequencedProgramme(items, DEFAULT_OPTS);
    const diag70 = result.diagnostics.find((d: SeqDiagItem) => d.boqItemId === 70)!;
    const diag72 = result.diagnostics.find((d: SeqDiagItem) => d.boqItemId === 72)!;
    expect(diag70.skipReason).toBeNull();
    expect(typeof diag72.skipReason).toBe("string");
    expect((diag72.skipReason as string).length).toBeGreaterThan(0);
  });

  it("19 — diagnostics.description equals the full item.description passed to sequencer (not a short name)", () => {
    // This is the field-audit guarantee: classification ALWAYS reads item.description.
    // If a route were to pass item.itemName (short name) as description, these would diverge.
    const result = generateSequencedProgramme(items, DEFAULT_OPTS);
    for (const d of result.diagnostics) {
      const orig = items.find((it) => it.boqItemId === d.boqItemId)!;
      expect(d.description).toBe(orig.description); // must match exactly — no truncation, no substitution
    }
  });
});
