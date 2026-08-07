import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  planArrangementBarAutoAllocations,
  chainageRangesOverlap,
  AUTO_SYNC_STATUSES,
  type AutoAllocArrangement,
  type AutoAllocBar,
  type AutoAllocExisting,
} from "../shared/arrangementAutoAllocation";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function arr(overrides: Partial<AutoAllocArrangement> = {}): AutoAllocArrangement {
  return {
    id: 10, boqProjectId: 1, status: "approved", allocatedQty: 1000,
    boqItemId: 5, boqItemAllocations: null, chainageFrom: 0, chainageTo: 5,
    ...overrides,
  };
}
function bar(overrides: Partial<AutoAllocBar> = {}): AutoAllocBar {
  return { id: 100, boqProjectId: 1, boqItemId: 5, plannedQty: 600, chainageFrom: 0, chainageTo: 2, ...overrides };
}
function alloc(overrides: Partial<AutoAllocExisting> = {}): AutoAllocExisting {
  return { id: 900, arrangementId: 10, programmeBarId: 100, boqItemId: 5, allocatedQty: 0, arrangementStatus: "approved", ...overrides };
}

// ── Status gating ─────────────────────────────────────────────────────────────

describe("status gating", () => {
  it("only plans for operational lifecycle statuses", () => {
    for (const status of ["approved", "mobilisation_pending", "in_progress", "on_hold"]) {
      expect(AUTO_SYNC_STATUSES.has(status)).toBe(true);
      expect(planArrangementBarAutoAllocations(arr({ status }), [bar()], []).actions.length).toBe(1);
    }
    for (const status of ["proposed", "draft", "cancelled", "rejected", "completed"]) {
      expect(planArrangementBarAutoAllocations(arr({ status }), [bar()], []).actions).toEqual([]);
    }
  });
});

// ── Chainage overlap semantics ────────────────────────────────────────────────

describe("chainage overlap", () => {
  it("null bounds are open-ended", () => {
    expect(chainageRangesOverlap(null, null, 3, 4)).toBe(true);
    expect(chainageRangesOverlap(2, null, 3, 4)).toBe(true);
    expect(chainageRangesOverlap(null, 2.5, 3, 4)).toBe(false);
  });
  it("touching boundaries do not overlap", () => {
    expect(chainageRangesOverlap(0, 2, 2, 4)).toBe(false);
    expect(chainageRangesOverlap(0, 2.0005, 2, 4)).toBe(false); // within EPS
    expect(chainageRangesOverlap(0, 2.1, 2, 4)).toBe(true);
  });
  it("bar with no chainage only matches a range-less arrangement", () => {
    const noChBar = bar({ chainageFrom: null, chainageTo: null });
    expect(planArrangementBarAutoAllocations(arr(), [noChBar], []).actions).toEqual([]);
    expect(planArrangementBarAutoAllocations(arr({ chainageFrom: null, chainageTo: null }), [noChBar], []).actions.length).toBe(1);
  });
  it("skips bars outside the arrangement range", () => {
    const plan = planArrangementBarAutoAllocations(arr({ chainageFrom: 0, chainageTo: 1.5 }), [
      bar({ id: 100, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, chainageFrom: 3, chainageTo: 4 }),
    ], []);
    expect(plan.actions.map(a => a.programmeBarId)).toEqual([100]);
  });
});

// ── Distribution, budgets, capacity ───────────────────────────────────────────

describe("distribution", () => {
  it("fills bars in chainage order, capped by bar planned qty", () => {
    const plan = planArrangementBarAutoAllocations(arr({ allocatedQty: 1000 }), [
      bar({ id: 101, plannedQty: 600, chainageFrom: 2, chainageTo: 4 }),
      bar({ id: 100, plannedQty: 600, chainageFrom: 0, chainageTo: 2 }),
    ], []);
    expect(plan.actions).toEqual([
      { programmeBarId: 100, boqItemId: 5, qty: 600, existingAllocId: undefined },
      { programmeBarId: 101, boqItemId: 5, qty: 400, existingAllocId: undefined },
    ]);
    expect(plan.shortfall).toBe(0);
  });

  it("respects capacity consumed by OTHER arrangements and never reduces them", () => {
    const other = alloc({ id: 901, arrangementId: 99, programmeBarId: 100, allocatedQty: 500 });
    const plan = planArrangementBarAutoAllocations(arr({ allocatedQty: 300 }), [bar({ plannedQty: 600 })], [other]);
    expect(plan.actions).toEqual([{ programmeBarId: 100, boqItemId: 5, qty: 100, existingAllocId: undefined }]);
    expect(plan.shortfall).toBe(200);
  });

  it("cancelled/rejected arrangements' allocations do not consume bar capacity", () => {
    const dead = alloc({ id: 902, arrangementId: 99, allocatedQty: 500, arrangementStatus: "cancelled" });
    const plan = planArrangementBarAutoAllocations(arr({ allocatedQty: 300 }), [bar({ plannedQty: 600 })], [dead]);
    expect(plan.actions[0].qty).toBe(300);
  });

  it("multi-source boqItemAllocations enforce per-item budgets", () => {
    const a = arr({
      allocatedQty: 500, boqItemId: null,
      boqItemAllocations: [{ boqItemId: 5, qty: 200 }, { boqItemId: 6, qty: 300 }],
    });
    const plan = planArrangementBarAutoAllocations(a, [
      bar({ id: 100, boqItemId: 5, plannedQty: 1000, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, boqItemId: 6, plannedQty: 1000, chainageFrom: 2, chainageTo: 4 }),
    ], []);
    expect(plan.actions).toEqual([
      { programmeBarId: 100, boqItemId: 5, qty: 200, existingAllocId: undefined },
      { programmeBarId: 101, boqItemId: 6, qty: 300, existingAllocId: undefined },
    ]);
  });

  it("distributable total is capped by the sum of item budgets when the split is stale/malformed", () => {
    // allocatedQty says 1000 but the per-item split only accounts for 500 —
    // the planner must not exceed the split.
    const a = arr({
      allocatedQty: 1000, boqItemId: null,
      boqItemAllocations: [{ boqItemId: 5, qty: 200 }, { boqItemId: 6, qty: 300 }],
    });
    const plan = planArrangementBarAutoAllocations(a, [
      bar({ id: 100, boqItemId: 5, plannedQty: 1000, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, boqItemId: 6, plannedQty: 1000, chainageFrom: 2, chainageTo: 4 }),
    ], []);
    expect(plan.actions.reduce((s, x) => s + x.qty, 0)).toBe(500);
    expect(plan.shortfall).toBe(0);
  });

  it("reports shortfall when no bar overlaps", () => {
    const plan = planArrangementBarAutoAllocations(arr({ chainageFrom: 10, chainageTo: 12 }), [bar()], []);
    expect(plan.actions).toEqual([]);
    expect(plan.shortfall).toBe(1000);
  });
});

// ── Idempotency & own-row updates ─────────────────────────────────────────────

describe("idempotency", () => {
  it("running the planner on its own output yields no further actions", () => {
    const bars = [bar({ id: 100, plannedQty: 600 }), bar({ id: 101, plannedQty: 600, chainageFrom: 2, chainageTo: 4 })];
    const first = planArrangementBarAutoAllocations(arr(), bars, []);
    const asExisting: AutoAllocExisting[] = first.actions.map((a, i) => ({
      id: 900 + i, arrangementId: 10, programmeBarId: a.programmeBarId,
      boqItemId: a.boqItemId, allocatedQty: a.qty, arrangementStatus: "approved",
    }));
    const second = planArrangementBarAutoAllocations(arr(), bars, asExisting);
    expect(second.actions).toEqual([]);
    expect(second.shortfall).toBe(0);
  });

  it("tops up its OWN existing row (update, not duplicate insert)", () => {
    const own = alloc({ id: 950, allocatedQty: 200 });
    const plan = planArrangementBarAutoAllocations(arr({ allocatedQty: 500 }), [bar({ plannedQty: 600 })], [own]);
    expect(plan.actions).toEqual([{ programmeBarId: 100, boqItemId: 5, qty: 300, existingAllocId: 950 }]);
  });
});

// ── Instruction 030 Part B regression: FieldHome SUBGRADE ordering ────────────

// ── Scope-revision reconciliation (auto rows moved, manual rows preserved) ───

describe("scope-revision reconciliation", () => {
  it("relocates a fully auto-allocated arrangement when its chainage moves", () => {
    // Arrangement was fully allocated to bar 100 (auto), then revised to Ch 2–4.
    const bars = [
      bar({ id: 100, plannedQty: 1000, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, plannedQty: 1000, chainageFrom: 2, chainageTo: 4 }),
    ];
    const prior = [alloc({ id: 950, programmeBarId: 100, allocatedQty: 1000, source: "auto" })];
    const plan = planArrangementBarAutoAllocations(arr({ chainageFrom: 2, chainageTo: 4 }), bars, prior);
    expect(plan.actions).toEqual([
      { programmeBarId: 100, boqItemId: 5, qty: -1000, existingAllocId: 950, remove: true },
      { programmeBarId: 101, boqItemId: 5, qty: 1000, existingAllocId: undefined },
    ]);
    expect(plan.shortfall).toBe(0);
  });

  it("never removes or reduces MANUAL rows, even when stale", () => {
    const bars = [
      bar({ id: 100, plannedQty: 1000, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, plannedQty: 1000, chainageFrom: 2, chainageTo: 4 }),
    ];
    const prior = [alloc({ id: 950, programmeBarId: 100, allocatedQty: 600, source: "manual" })];
    const plan = planArrangementBarAutoAllocations(arr({ allocatedQty: 1000, chainageFrom: 2, chainageTo: 4 }), bars, prior);
    // Manual 600 stays on bar 100; only the remaining 400 moves to the new range.
    expect(plan.actions).toEqual([{ programmeBarId: 101, boqItemId: 5, qty: 400, existingAllocId: undefined }]);
  });

  it("shrinks auto rows when the item split is reduced at the same range", () => {
    const bars = [bar({ id: 100, plannedQty: 1000 })];
    const prior = [alloc({ id: 950, programmeBarId: 100, allocatedQty: 1000, source: "auto" })];
    const plan = planArrangementBarAutoAllocations(arr({ allocatedQty: 700 }), bars, prior);
    expect(plan.actions).toEqual([{ programmeBarId: 100, boqItemId: 5, qty: -300, existingAllocId: 950 }]);
  });

  it("removes auto rows for an item dropped from a multi-source split", () => {
    const bars = [
      bar({ id: 100, boqItemId: 5, plannedQty: 1000, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, boqItemId: 6, plannedQty: 1000, chainageFrom: 2, chainageTo: 4 }),
    ];
    const prior = [alloc({ id: 950, programmeBarId: 100, boqItemId: 5, allocatedQty: 400, source: "auto" })];
    const a = arr({ allocatedQty: 400, boqItemId: null, boqItemAllocations: [{ boqItemId: 6, qty: 400 }] });
    const plan = planArrangementBarAutoAllocations(a, bars, prior);
    expect(plan.actions).toEqual([
      { programmeBarId: 100, boqItemId: 5, qty: -400, existingAllocId: 950, remove: true },
      { programmeBarId: 101, boqItemId: 6, qty: 400, existingAllocId: undefined },
    ]);
  });

  it("reconciliation is idempotent — a second run after applying yields no actions", () => {
    const bars = [
      bar({ id: 100, plannedQty: 1000, chainageFrom: 0, chainageTo: 2 }),
      bar({ id: 101, plannedQty: 1000, chainageFrom: 2, chainageTo: 4 }),
    ];
    const revised = arr({ chainageFrom: 2, chainageTo: 4 });
    const first = planArrangementBarAutoAllocations(revised, bars, [alloc({ id: 950, programmeBarId: 100, allocatedQty: 1000, source: "auto" })]);
    // Apply: row 950 deleted, new auto row on bar 101.
    const after = [alloc({ id: 960, programmeBarId: 101, allocatedQty: 1000, source: "auto" })];
    const second = planArrangementBarAutoAllocations(revised, bars, after);
    expect(first.actions.length).toBe(2);
    expect(second.actions).toEqual([]);
  });
});

// ── Route-level trigger coverage (source regression) ─────────────────────────
// The idempotent auto-sync must run on EVERY path where approved quantity or
// scope becomes effective — not just the literal `status: "approved"` PATCH.

describe("auto-sync trigger coverage in routes (source regression)", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  it("syncs on any transition into an operational status and on scope changes", () => {
    expect(routes).toMatch(/enteredOperational\s*=\s*!!newStatus\s*&&\s*AUTO_SYNC_STATUSES\.has\(newStatus\)/);
    expect(routes).toMatch(/scopeChanged\s*=\s*patchChangesLinkage\s*\|\|\s*"chainageFrom" in body\s*\|\|\s*"chainageTo" in body/);
  });
  it("syncs after revision approval", () => {
    expect(routes).toMatch(/revisionAction === "approve" && AUTO_SYNC_STATUSES\.has[\s\S]{0,200}runArrangementAutoSync\(id, user, "revision_approved"\)/);
  });
  it("syncs after Edit-and-Apply-Now", () => {
    expect(routes).toContain('runArrangementAutoSync(id, user, "revision_applied_now")');
  });
});

describe("allocation schema readiness (source regression)", () => {
  it("ensures allocation table + source column in the BLOCKING ensureEarthworkTables phase", () => {
    const storage = readFileSync("server/storage.ts", "utf8");
    const ensureStart = storage.indexOf("async ensureEarthworkTables");
    const ensureEnd = storage.indexOf("async getEarthworkArrangements", ensureStart);
    const ensureBody = storage.slice(ensureStart, ensureEnd);
    // Legacy DBs lack the table and/or source column; the auto-sync inserts
    // source='auto', so both must exist before arrangement routes activate.
    expect(ensureBody).toContain("CREATE TABLE IF NOT EXISTS earthwork_arrangement_programme_allocations");
    expect(ensureBody).toMatch(/ALTER TABLE earthwork_arrangement_programme_allocations ADD COLUMN IF NOT EXISTS source/);
  });
});

describe("FieldHome extractShortName ordering (source regression)", () => {
  const src = readFileSync("client/src/pages/FieldHome.tsx", "utf8");
  it("checks SUBGRADE before any EMBANKMENT branch", () => {
    const sub = src.indexOf('d.includes("SUBGRADE")');
    const emb = src.indexOf('d.includes("EMBANKMENT")');
    expect(sub).toBeGreaterThan(-1);
    expect(emb).toBeGreaterThan(-1);
    expect(sub).toBeLessThan(emb);
  });
});
