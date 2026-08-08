/**
 * Instruction 031 — Execution Arrangements UX & Scope Linkage.
 *
 * Covers:
 *  - Part A: EarthworkControl renamed to "Earthwork Classification & Cut/Fill"
 *    (no logic change), no duplicate "Execution Arrangements" heading.
 *  - Part B: arrangement-first Open behaviour, Applicable Scope selection from
 *    confirmed Working Reaches, scope_segment_ids persistence, constraint
 *    handling without manual splits, legacy free-text compatibility.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  confirmedWorkingReaches,
  scopeConstraints,
  type ScopeSegmentRecordLike,
} from "../shared/autoSequenceScope";
import { resolveEligibleScope, coverageForStretch } from "../shared/projectScope";
import { OPERATIONAL_EDIT_FIELDS, classifyArrangementEdit } from "../shared/executionState";

// ── Fixtures: Takkadpally-like scope ─────────────────────────────────────────
const seg = (o: Partial<ScopeSegmentRecordLike> & { id: number }): ScopeSegmentRecordLike => ({
  segmentType: "working_reach", status: "confirmed", chainageFrom: 0, chainageTo: 1,
  label: null, side: null, reason: null, effectiveFrom: null, ...o,
});

const SEGMENTS: ScopeSegmentRecordLike[] = [
  seg({ id: 1, label: "Reach 1", chainageFrom: 0, chainageTo: 1.25 }),
  seg({ id: 2, label: "Reach 2", chainageFrom: 1.25, chainageTo: 2.5 }),
  seg({ id: 3, label: "Reach 3", chainageFrom: 2.5, chainageTo: 3.8 }),
  seg({ id: 4, label: "Draft reach", chainageFrom: 3.8, chainageTo: 4.5, status: "draft" }),
  seg({ id: 5, label: "Old reach", chainageFrom: 0, chainageTo: 0.5, status: "superseded" }),
  seg({ id: 6, segmentType: "no_scope", chainageFrom: 2.1, chainageTo: 2.4, reason: "Culvert litigation" }),
  seg({ id: 7, segmentType: "temporary_block", chainageFrom: 3.0, chainageTo: 3.2, reason: "Utility shifting" }),
];

// ── B2: reach selection rules ────────────────────────────────────────────────

describe("Applicable Scope — confirmed Working Reaches (B2)", () => {
  it("only confirmed working reaches are selectable; draft/superseded excluded", () => {
    const reaches = confirmedWorkingReaches(SEGMENTS);
    expect(reaches.map(r => r.id)).toEqual([1, 2, 3]);
    expect(reaches.some(r => r.status === "draft" || r.status === "superseded")).toBe(false);
  });

  it("no_scope / temporary_block / withdrawn are constraints, never selectable reaches", () => {
    const reaches = confirmedWorkingReaches(SEGMENTS);
    expect(reaches.some(r => r.segmentType !== "working_reach")).toBe(false);
    const cons = scopeConstraints(SEGMENTS);
    expect(cons.map(c => c.id).sort()).toEqual([6, 7]);
    expect(cons.find(c => c.id === 7)?.temporary).toBe(true);
    expect(cons.find(c => c.id === 6)?.temporary).toBe(false);
  });

  it("multiple reaches can be selected (multi-select union covers both)", () => {
    const reaches = confirmedWorkingReaches(SEGMENTS);
    const selected = reaches.filter(r => [2, 3].includes(Number(r.id)));
    expect(selected.length).toBe(2);
    const from = Math.min(...selected.map(r => Number(r.chainageFrom)));
    const to = Math.max(...selected.map(r => Number(r.chainageTo)));
    expect(from).toBe(1.25);
    expect(to).toBe(3.8);
  });
});

// ── B4: internal No-Scope does not force a manual split ─────────────────────

describe("eligible vs excluded sub-ranges (B4)", () => {
  it("an internal No-Scope interval is clipped automatically — reach stays one selection", () => {
    const scope = resolveEligibleScope(SEGMENTS as any, { boqItemId: null, isLinear: true });
    const cov = coverageForStretch(scope, { chainageFrom: 1.25, chainageTo: 2.5, side: null });
    // Reach 2 (1.250–2.500) minus No-Scope 2.100–2.400 → two eligible sub-ranges
    expect(cov.subRanges.length).toBe(2);
    expect(cov.subRanges[0].from).toBeCloseTo(1.25, 3);
    expect(cov.subRanges[0].to).toBeCloseTo(2.1, 3);
    expect(cov.subRanges[1].from).toBeCloseTo(2.4, 3);
    expect(cov.subRanges[1].to).toBeCloseTo(2.5, 3);
    expect(cov.excludedSideLenKm).toBeGreaterThan(0);
  });
});

// ── B3: scope linkage classification / persistence path ─────────────────────

describe("scope linkage persistence (B3)", () => {
  it("scopeSegmentIds is an operational edit field (same class as reachLabel/chainage)", () => {
    expect((OPERATIONAL_EDIT_FIELDS as readonly string[]).includes("scopeSegmentIds")).toBe(true);
    const cls = classifyArrangementEdit(
      { scopeSegmentIds: null, reachLabel: null } as any,
      { scopeSegmentIds: [2, 3] } as any,
    );
    expect(cls.operational).toContain("scopeSegmentIds");
    expect(cls.material).toEqual([]);
  });

  it("schema + blocking storage ensure include scope_segment_ids (legacy DB safe)", () => {
    const schema = readFileSync("shared/schema.ts", "utf8");
    expect(schema).toMatch(/scopeSegmentIds:\s*jsonb\("scope_segment_ids"\)/);
    const storage = readFileSync("server/storage.ts", "utf8");
    const ensure = storage.slice(storage.indexOf("async ensureEarthworkTables"));
    const ensureBody = ensure.slice(0, ensure.indexOf("async getEarthworkArrangements"));
    expect(ensureBody).toContain("ALTER TABLE earthwork_arrangements ADD COLUMN IF NOT EXISTS scope_segment_ids jsonb");
  });

  it("POST and PATCH routes validate and persist scopeSegmentIds", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain("validateArrangementScopeSegments");
    // POST persists the normalised ids
    expect(routes).toMatch(/scopeSegmentIds:\s*scopeSegmentIdsValue/);
    // PATCH whitelists the field and re-validates it
    const patchIdx = routes.indexOf('app.patch("/api/earthwork-arrangements/:id"');
    const patchBody = routes.slice(patchIdx, patchIdx + 6000);
    expect(patchBody).toContain('"scopeSegmentIds"');
    expect(patchBody).toContain("validateArrangementScopeSegments(current.boqProjectId");
    // Only confirmed working reaches are linkable
    expect(routes).toContain("SCOPE_SEGMENT_NOT_LINKABLE");
    expect(routes).toContain("SCOPE_SEGMENT_NOT_CONFIRMED");
    expect(routes).toContain("SCOPE_SEGMENT_NOT_FOUND");
  });
});

// ── Precise reach membership in auto-allocation reconciliation ──────────────

import {
  planArrangementBarAutoAllocations,
  type AutoAllocArrangement,
  type AutoAllocBar,
  type AutoAllocExisting,
} from "../shared/arrangementAutoAllocation";

const scopedArr = (o: Partial<AutoAllocArrangement> = {}): AutoAllocArrangement => ({
  id: 10, boqProjectId: 1, status: "approved", allocatedQty: 1000,
  boqItemId: 5, boqItemAllocations: null, chainageFrom: 0, chainageTo: 3.8, ...o,
});
const bar = (o: Partial<AutoAllocBar> = {}): AutoAllocBar =>
  ({ id: 100, boqProjectId: 1, boqItemId: 5, plannedQty: 400, chainageFrom: 0, chainageTo: 1.25, ...o });

describe("auto-allocation honours precise reach membership (scopeRanges)", () => {
  const barsAcrossProject: AutoAllocBar[] = [
    bar({ id: 101, chainageFrom: 0, chainageTo: 1.25 }),      // Reach 1
    bar({ id: 102, chainageFrom: 1.25, chainageTo: 2.5 }),    // Reach 2 (gap)
    bar({ id: 103, chainageFrom: 2.5, chainageTo: 3.8 }),     // Reach 3
  ];

  it("non-contiguous reach selection skips bars in the gap (envelope would include them)", () => {
    const a = scopedArr({ scopeRanges: [{ from: 0, to: 1.25 }, { from: 2.5, to: 3.8 }] }); // Reaches 1+3, NOT 2
    const plan = planArrangementBarAutoAllocations(a, barsAcrossProject, []);
    const barsHit = plan.actions.map(x => x.programmeBarId).sort();
    expect(barsHit).toEqual([101, 103]);
    // sanity: without scopeRanges the envelope WOULD have included bar 102
    const envPlan = planArrangementBarAutoAllocations(scopedArr(), barsAcrossProject, []);
    expect(envPlan.actions.map(x => x.programmeBarId)).toContain(102);
  });

  it("changing linked reaches removes stale auto rows and reallocates to newly eligible bars", () => {
    const existing: AutoAllocExisting[] = [
      { id: 900, arrangementId: 10, programmeBarId: 101, boqItemId: 5, allocatedQty: 400, arrangementStatus: "approved", source: "auto" },
    ];
    // Scope edited from Reach 1 → Reach 3 only
    const a = scopedArr({ scopeRanges: [{ from: 2.5, to: 3.8 }] });
    const plan = planArrangementBarAutoAllocations(a, barsAcrossProject, existing);
    const removal = plan.actions.find(x => x.remove && x.existingAllocId === 900);
    expect(removal).toBeTruthy();
    expect(removal!.qty).toBe(-400);
    expect(plan.actions.some(x => x.programmeBarId === 103 && x.qty > 0)).toBe(true);
    expect(plan.actions.some(x => x.programmeBarId === 101 && x.qty > 0)).toBe(false);
  });

  it("manual rows outside the new reaches are never touched", () => {
    const existing: AutoAllocExisting[] = [
      { id: 901, arrangementId: 10, programmeBarId: 101, boqItemId: 5, allocatedQty: 300, arrangementStatus: "approved", source: "manual" },
    ];
    const a = scopedArr({ scopeRanges: [{ from: 2.5, to: 3.8 }] });
    const plan = planArrangementBarAutoAllocations(a, barsAcrossProject, existing);
    expect(plan.actions.some(x => x.existingAllocId === 901 && (x.remove || x.qty < 0))).toBe(false);
  });

  it("all linked reaches revised away (impossible range) strips every auto row", () => {
    const existing: AutoAllocExisting[] = [
      { id: 902, arrangementId: 10, programmeBarId: 101, boqItemId: 5, allocatedQty: 200, arrangementStatus: "approved", source: "auto" },
      { id: 903, arrangementId: 10, programmeBarId: 103, boqItemId: 5, allocatedQty: 200, arrangementStatus: "approved", source: "auto" },
    ];
    const a = scopedArr({ scopeRanges: [{ from: -1, to: -1 }] }); // sync layer's sentinel when no linked reach survives
    const plan = planArrangementBarAutoAllocations(a, barsAcrossProject, existing);
    expect(plan.actions.filter(x => x.remove).map(x => x.existingAllocId).sort()).toEqual([902, 903]);
    expect(plan.actions.some(x => x.qty > 0)).toBe(false);
  });

  it("a one-side linked reach never allocates to the parallel opposite-side bar", () => {
    const parallelBars: AutoAllocBar[] = [
      bar({ id: 201, chainageFrom: 0, chainageTo: 1.25, side: "lhs" }),
      bar({ id: 202, chainageFrom: 0, chainageTo: 1.25, side: "rhs" }),
    ];
    const a = scopedArr({ scopeRanges: [{ from: 0, to: 1.25, side: "lhs" }] });
    const plan = planArrangementBarAutoAllocations(a, parallelBars, []);
    expect(plan.actions.map(x => x.programmeBarId)).toEqual([201]);
  });

  it("null-side policy: legacy full-width bars match any reach side, and a null-side reach matches sided bars", () => {
    const bars: AutoAllocBar[] = [
      bar({ id: 301, chainageFrom: 0, chainageTo: 1.25, side: null }),     // legacy full-width bar
      bar({ id: 302, chainageFrom: 0, chainageTo: 1.25, side: "rhs" }),
    ];
    // sided reach → legacy null-side bar still eligible (full carriageway spans both corridors)
    const sided = planArrangementBarAutoAllocations(scopedArr({ scopeRanges: [{ from: 0, to: 1.25, side: "lhs" }] }), bars, []);
    expect(sided.actions.map(x => x.programmeBarId)).toEqual([301]);
    // null-side reach → matches both sided and legacy bars
    const nullSide = planArrangementBarAutoAllocations(scopedArr({ scopeRanges: [{ from: 0, to: 1.25, side: null }] }), bars, []);
    expect(new Set(nullSide.actions.map(x => x.programmeBarId))).toEqual(new Set([301, 302]));
  });

  it("a stale auto row on an opposite-side bar is stripped when side membership is enforced", () => {
    const parallelBars: AutoAllocBar[] = [
      bar({ id: 201, chainageFrom: 0, chainageTo: 1.25, side: "lhs" }),
      bar({ id: 202, chainageFrom: 0, chainageTo: 1.25, side: "rhs" }),
    ];
    const existing: AutoAllocExisting[] = [
      { id: 950, arrangementId: 10, programmeBarId: 202, boqItemId: 5, allocatedQty: 300, arrangementStatus: "approved", source: "auto" },
    ];
    const a = scopedArr({ scopeRanges: [{ from: 0, to: 1.25, side: "lhs" }] });
    const plan = planArrangementBarAutoAllocations(a, parallelBars, existing);
    expect(plan.actions.some(x => x.remove && x.existingAllocId === 950)).toBe(true);
    expect(plan.actions.some(x => x.programmeBarId === 201 && x.qty > 0)).toBe(true);
  });

  it("empty/absent scopeRanges keeps pre-031 envelope behaviour byte-for-byte", () => {
    const withNull = planArrangementBarAutoAllocations(scopedArr({ scopeRanges: null }), barsAcrossProject, []);
    const withEmpty = planArrangementBarAutoAllocations(scopedArr({ scopeRanges: [] }), barsAcrossProject, []);
    const without = planArrangementBarAutoAllocations(scopedArr(), barsAcrossProject, []);
    expect(withNull).toEqual(without);
    expect(withEmpty).toEqual(without);
  });
});

describe("scope-change auto-sync triggers (server wiring)", () => {
  it("PATCH scopeSegmentIds triggers reconciliation; sync resolves live reach geometry", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toMatch(/scopeChanged = .*"scopeSegmentIds" in body/);
    const sync = readFileSync("server/arrangementAllocationSync.ts", "utf8");
    expect(sync).toContain("projectScopeSegments");
    expect(sync).toMatch(/segmentType === "working_reach" && s\.status === "confirmed"/);
    expect(sync).toContain("scopeRanges = [{ from: -1, to: -1 }]"); // no surviving reach → strip, don't fall back to envelope
    expect(sync).toMatch(/side: \(s as any\)\.side \?\? null/); // reach side carried into precise membership
    expect(sync).toMatch(/side: \(b as any\)\.side \?\? null/); // bar side carried too
    // operational scope edit submitted alongside a material revision proposal still syncs
    expect(routes).toMatch(/hasSideOperational && \("scopeSegmentIds" in sideOperational/);
  });

  it("sync clips linked reaches by the eligible scope (constraints subtracted server-side)", () => {
    const sync = readFileSync("server/arrangementAllocationSync.ts", "utf8");
    expect(sync).toContain("resolveEligibleScope");
    expect(sync).toContain("coverageForStretch");
    // whole project scope loaded, not just the linked segment ids
    expect(sync).toMatch(/eq\(projectScopeSegments\.boqProjectId, arr\.boqProjectId\)/);
    // eligible sub-ranges (post-clipping) become the candidate ranges
    expect(sync).toMatch(/for \(const r of cov\.subRanges\)/);
  });

  it("constraint mutations reconcile all linked arrangements in the project", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain("async function reconcileLinkedArrangementsForProject");
    // constraint revise / confirm / delete all hit the project-wide path
    expect(routes).toMatch(/segmentType === "working_reach"\)[\s\S]{0,200}reconcileArrangementsForScopeSegments\(\[segId\]/);
    expect(routes).toMatch(/reconcileLinkedArrangementsForProject\(result\.segment\.boqProjectId/);
    expect(routes).toMatch(/reconcileLinkedArrangementsForProject\(segment\.boqProjectId/);
    expect(routes).toMatch(/reconcileLinkedArrangementsForProject\(delSeg\.boqProjectId/);
  });

  it("side-operational edits persist normalised patch values, never the raw body", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toMatch(/sideOperational\[f\] = f in patch \? \(patch as any\)\[f\] : \(body\[f\] \?\? null\)/);
  });

  it("planner never allocates inside a clipped-out sub-range", () => {
    // Reach 2 = 1.25–2.5 with no-scope 2.1–2.4 clipped out → two eligible sub-ranges.
    const clipped = scopedArr({ scopeRanges: [{ from: 1.25, to: 2.1 }, { from: 2.4, to: 2.5 }] });
    const bars: AutoAllocBar[] = [
      bar({ id: 401, chainageFrom: 1.25, chainageTo: 2.1 }),
      bar({ id: 402, chainageFrom: 2.1, chainageTo: 2.4 }), // inside the exclusion
      bar({ id: 403, chainageFrom: 2.4, chainageTo: 2.5 }),
    ];
    const plan = planArrangementBarAutoAllocations(clipped, bars, []);
    expect(plan.actions.map(x => x.programmeBarId).sort()).toEqual([401, 403]);
  });

  it("scope segment mutations reconcile linked arrangements (PATCH-revise / confirm / delete)", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain("async function reconcileArrangementsForScopeSegments");
    // supersede via PATCH strips immediately
    expect(routes).toMatch(/if \(result\.revised\) \{[\s\S]{0,200}reconcileArrangementsForScopeSegments\(\[segId\]/);
    // confirm of a revision re-points links then reconciles (geometry redistribute)
    expect(routes).toContain("repointArrangementScopeLinks(Number((segment as any).revisionOf), segment.id)");
    expect(routes).toMatch(/reconcileArrangementsForScopeSegments\(\[segment\.id/);
    // delete reconciles defensively
    expect(routes).toMatch(/deleteProjectScopeSegment\(delSegId\);[\s\S]{0,500}reconcileArrangementsForScopeSegments\(\[delSegId\]/);
    // reconciliation is limited to operational arrangements
    const helper = routes.slice(routes.indexOf("async function reconcileArrangementsForScopeSegments"));
    expect(helper.slice(0, 1500)).toContain("AUTO_SYNC_STATUSES.has(String(a.status))");
  });
});

// ── B1: arrangement-first Open + child bar detail ────────────────────────────

describe("register Open behaviour (B1)", () => {
  const register = readFileSync("client/src/pages/ExecutionArrangements.tsx", "utf8");

  it("Open opens the arrangement detail, never allocs[0]", () => {
    expect(register).not.toContain("firstBarAlloc");
    const openBtn = register.slice(register.indexOf("button-open-"));
    expect(register).toContain("setDetailTargetId(r.arr.id)");
    expect(openBtn.length).toBeGreaterThan(0);
  });

  it("detail panel lists every linked bar with qty and per-bar drill-in", () => {
    expect(register).toContain('data-testid="arrangement-detail"');
    expect(register).toContain('data-testid="detail-bar-list"');
    expect(register).toContain("button-open-bar-");
    expect(register).toContain("Programme Coverage");
  });

  it("register shows the aggregate 'N bars · X allocated' with a view affordance", () => {
    expect(register).toContain("button-view-allocations-");
    expect(register).toMatch(/allocs\.length.*bar/);
    expect(register).toContain("allocated");
  });

  it("register still creates arrangements without a programme bar (030 preserved)", () => {
    expect(register).toContain("button-new-arrangement");
    expect(register).toContain("create-arrangement-picker");
    expect(register).toContain("EarthworkArrangementDialog");
  });

  it("Applicable Scope column uses the scope link with legacy free-text fallback (B6/B7)", () => {
    expect(register).toContain("applicableScopeLabel");
    expect(register).toContain("Whole eligible scope");
    expect(register).toMatch(/Custom Ch\./);
    // legacy fallback: free-text reachLabel still displayed as-is
    expect(register).toContain("a.reachLabel; // legacy free text (B7)");
    // item labels keep using the short-name helper
    expect(register).toContain("boqItemDisplayName");
  });
});

// ── B2 dialog wiring ─────────────────────────────────────────────────────────

describe("arrangement dialog Applicable Scope (B2/B5/B7)", () => {
  const dialog = readFileSync("client/src/components/EarthworkArrangementDialog.tsx", "utf8");

  it("offers whole / reaches / custom modes and reuses the shared scope helpers", () => {
    expect(dialog).toContain("radio-scope-${mode}");
    for (const mode of ["whole", "reaches", "custom"]) {
      expect(dialog).toMatch(new RegExp(`\\["${mode}",`));
    }
    expect(dialog).toContain("confirmedWorkingReaches");
    expect(dialog).toContain("scopeConstraints");
    expect(dialog).toContain("resolveEligibleScope");
    expect(dialog).toContain("coverageForStretch");
  });

  it("suggested quantity is conservative and never overwrites a manual entry", () => {
    expect(dialog).toContain("suggested-qty-hint");
    // hidden for multi-source and once the user has typed anything
    expect(dialog).toMatch(/!isMultiSource && scopeMode === "reaches"/);
    expect(dialog).toMatch(/allocatedQty\.trim\(\) === ""/);
  });

  it("legacy free-text arrangements open in custom mode unchanged (B7)", () => {
    expect(dialog).toMatch(/editScopeSegmentIds\.length > 0 \? "reaches"/);
    expect(dialog).toMatch(/reachLabel \|\| \(editArrangement as any\)\?\.chainageFrom != null\) \? "custom"/);
  });
});

// ── Part A: naming ───────────────────────────────────────────────────────────

describe("Part A — naming collision resolved", () => {
  it("EarthworkControl uses the new heading and no duplicate register name", () => {
    const page = readFileSync("client/src/pages/EarthworkControl.tsx", "utf8");
    expect(page).toContain("Earthwork Classification & Cut/Fill");
    expect(page).not.toContain("Execution Arrangements — Classification & Demand");
  });

  it("cross-links renamed; register remains the single 'Execution Arrangements'", () => {
    for (const f of [
      "client/src/pages/WorkDemand.tsx",
      "client/src/components/BarArrangementPanel.tsx",
      "client/src/components/EarthworkArrangementDialog.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/use Earthwork Control|Classify in Earthwork Control|>\s*Earthwork Control →/);
    }
    const register = readFileSync("client/src/pages/ExecutionArrangements.tsx", "utf8");
    expect(register).toContain(">Execution Arrangements</h1>");
  });
});
