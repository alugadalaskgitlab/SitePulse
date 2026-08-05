/**
 * Instruction 029C — Category-aware side quantity allocation, data round-trip,
 * overallocation guard and allocation preview.
 *
 * Coverage (Part H of the spec):
 *  1. sideShareForStretch: full-width/null = 1; one-sided = 0.5; width-matched
 *     LHS/RHS pair splits by width; mismatched boundaries → 0.5 + fallback note.
 *  2. allocationRuleForItem: earthwork / MT-bituminous / pavement (automatic, no selector).
 *  3. LHS+RHS same reach never double-counts: halves sum to the full-width quantity.
 *  4. Earthwork bars carry the "Planning Estimate" label.
 *  5. Manual Qty% bypasses ALL automatic side math.
 *  6. 029B regression: full_width stretches allocate exactly as before (length share).
 *  7. Round-trip: plannedWidthM/side persist on upserted bars; preview-only fields stripped.
 *  8. Overallocation blocks persistence (400 OVERALLOCATION_BLOCKED) unless an
 *     explicit override reason is provided (then audited).
 *  9. Dry-run returns regenSummary.allocationPreview.
 * 10. Reconciled bars with a manual qty override keep their quantity (qtyConflicts).
 */
import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import {
  generateSequencedProgramme,
  sideShareForStretch,
  allocationRuleForItem,
  WIDTH_SPLIT_FALLBACK_NOTE,
  EARTHWORK_ESTIMATE_LABEL,
  type SeqInputItem,
} from "../shared/programmeSequencer";

// ---------------------------------------------------------------------------
// Unit tests — helpers + sequencer (no server)
// ---------------------------------------------------------------------------

const gsbItem: SeqInputItem = {
  boqItemId: 1,
  description: "Providing and laying Granular Sub Base with well graded material as per MoRTH 401",
  unit: "Cum",
  totalQty: 30000,
  fullDurationMonths: 6,
  layerType: "granular",
};
const earthworkItem: SeqInputItem = {
  boqItemId: 2,
  description: "Construction of embankment with approved material as per MoRTH 305",
  unit: "Cum",
  totalQty: 50000,
  fullDurationMonths: 6,
  layerType: "earthwork",
};
const dbmMtItem: SeqInputItem = {
  boqItemId: 3,
  description: "Providing and laying Dense Bituminous Macadam as per MoRTH 507",
  unit: "MT",
  totalQty: 12000,
  fullDurationMonths: 4,
  layerType: "bituminous",
};

const baseOpts = {
  fronts: 1,
  totalMonths: 18,
  roadLengthKm: 20,
  chainageStartKm: 100,
  staggerMonths: 2,
  lagMonths: 0,
  disableStructureFronts: true,
};

describe("029C sideShareForStretch", () => {
  it("full_width / both_sides / null side → fraction 1, no note", () => {
    const all = [{ chainageFrom: 100, chainageTo: 110, side: "full_width" as string | null, plannedWidthM: null }];
    expect(sideShareForStretch(all[0], all)).toEqual({ fraction: 1, note: null });
    expect(sideShareForStretch({ ...all[0], side: null }, all)).toEqual({ fraction: 1, note: null });
    expect(sideShareForStretch({ ...all[0], side: "both_sides" }, all)).toEqual({ fraction: 1, note: null });
  });

  it("one-sided corridor without widths → 0.5, no note", () => {
    const st = { chainageFrom: 100, chainageTo: 110, side: "lhs", plannedWidthM: null };
    expect(sideShareForStretch(st, [st])).toEqual({ fraction: 0.5, note: null });
    const sh = { ...st, side: "shoulder_rhs" };
    expect(sideShareForStretch(sh, [sh])).toEqual({ fraction: 0.5, note: null });
  });

  it("width-matched LHS/RHS pair with identical boundaries splits by width", () => {
    const lhs = { chainageFrom: 100, chainageTo: 110, side: "lhs", plannedWidthM: 7 };
    const rhs = { chainageFrom: 100, chainageTo: 110, side: "rhs", plannedWidthM: 3.5 };
    const all = [lhs, rhs];
    expect(sideShareForStretch(lhs, all).fraction).toBeCloseTo(7 / 10.5, 6);
    expect(sideShareForStretch(rhs, all).fraction).toBeCloseTo(3.5 / 10.5, 6);
    expect(sideShareForStretch(lhs, all).note).toBeNull();
  });

  it("widths set but boundaries mismatch → flat 0.5 + explicit fallback note", () => {
    const lhs = { chainageFrom: 100, chainageTo: 110, side: "lhs", plannedWidthM: 7 };
    const rhs = { chainageFrom: 102, chainageTo: 110, side: "rhs", plannedWidthM: 3.5 }; // overlapping but not identical
    const res = sideShareForStretch(lhs, [lhs, rhs]);
    expect(res.fraction).toBe(0.5);
    expect(res.note).toBe(WIDTH_SPLIT_FALLBACK_NOTE);
  });
});

describe("029C allocationRuleForItem", () => {
  it("classifies earthwork / MT-bituminous / pavement automatically", () => {
    expect(allocationRuleForItem(earthworkItem)).toBe("earthwork-estimate");
    expect(allocationRuleForItem(dbmMtItem)).toBe("mt-proportional");
    expect(allocationRuleForItem({ ...dbmMtItem, unit: "Cum" })).toBe("pavement"); // volumetric bituminous = pavement rule
    expect(allocationRuleForItem(gsbItem)).toBe("pavement");
  });
});

describe("029C sequencer — side-aware quantity allocation", () => {
  const lhsRhsStretches = [
    { chainageFrom: 100, chainageTo: 120, priority: 1, side: "lhs", label: "LHS" },
    { chainageFrom: 100, chainageTo: 120, priority: 1, side: "rhs", label: "RHS" },
  ];

  it("LHS + RHS over the same reach never double-count — halves sum to BOQ qty", () => {
    const { bars } = generateSequencedProgramme([gsbItem], { ...baseOpts, stretches: lhsRhsStretches });
    expect(bars).toHaveLength(2);
    for (const b of bars) expect(b.plannedQty).toBeCloseTo(15000, 3);
    expect(bars[0].plannedQty + bars[1].plannedQty).toBeCloseTo(30000, 3);
    expect(bars.map(b => b.side).sort()).toEqual(["lhs", "rhs"]);
  });

  it("width-matched split flows through to bar quantities", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 120, priority: 1, side: "lhs", plannedWidthM: 7 },
        { chainageFrom: 100, chainageTo: 120, priority: 1, side: "rhs", plannedWidthM: 3.5 },
      ],
    });
    const lhsBar = bars.find(b => b.side === "lhs")!;
    const rhsBar = bars.find(b => b.side === "rhs")!;
    expect(lhsBar.plannedQty).toBeCloseTo(30000 * (7 / 10.5), 2);
    expect(rhsBar.plannedQty).toBeCloseTo(30000 * (3.5 / 10.5), 2);
    expect(lhsBar.plannedWidthM).toBe(7);
    expect(lhsBar.plannedQty + rhsBar.plannedQty).toBeCloseTo(30000, 2);
  });

  it("earthwork bars carry the Planning Estimate label + rule", () => {
    const { bars } = generateSequencedProgramme([earthworkItem], { ...baseOpts, stretches: lhsRhsStretches });
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.allocationRule).toBe("earthwork-estimate");
      expect(b.notes).toBe(EARTHWORK_ESTIMATE_LABEL);
    }
  });

  it("MT bituminous items use the proportional rule (no density/geometry math)", () => {
    const { bars } = generateSequencedProgramme([dbmMtItem], { ...baseOpts, stretches: lhsRhsStretches });
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.allocationRule).toBe("mt-proportional");
      expect(b.plannedQty).toBeCloseTo(6000, 3); // 12000 × 1.0 length share × 0.5 side share
    }
  });

  it("manual Qty% bypasses all automatic side allocation", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [{ chainageFrom: 100, chainageTo: 120, priority: 1, side: "lhs", manualQtyFraction: 0.8, plannedWidthM: 7 }],
    });
    expect(bars[0].plannedQty).toBeCloseTo(24000, 3); // 0.8 × 30000 — no 0.5 side factor
    expect(bars[0].allocationRule).toBe("manual");
  });

  it("029B regression: full_width stretches allocate purely by length share", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "full_width" },
        { chainageFrom: 110, chainageTo: 120, priority: 2, side: "full_width" },
      ],
    });
    for (const b of bars) expect(b.plannedQty).toBeCloseTo(15000, 3);
  });
});

// ---------------------------------------------------------------------------
// Route-level tests — round-trip, overallocation guard, preview
// ---------------------------------------------------------------------------

const PROJECT_ID = 779029;

const fx = {
  project: {
    id: PROJECT_ID,
    name: "029C Route Test Project",
    chainageFrom: 100,
    chainageTo: 120,
    roadLengthKm: 20,
    totalMonths: 18,
  } as any,
  items: [] as any[],
  bars: [] as any[],
  barAllocations: [] as any[],
};

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = { id: 1, username: "test-admin", isAdmin: true, isActive: true, sessionPolicy: "sticky" };
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fakeAdmin;
    req.authPermissions = {};
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

const storageCalls = {
  updated: [] as Array<{ id: number; data: any }>,
  deleted: [] as number[],
  upserted: [] as any[],
  audits: [] as any[],
};

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });

  methods.getBoqProject = vi.fn(async (id: number) => (id === PROJECT_ID ? fx.project : undefined));
  methods.getBoqItemsWithRecipes = vi.fn(async () => fx.items);
  methods.getBoqProgramSettings = vi.fn(async () => null);
  methods.upsertBoqProgramSettings = vi.fn(async () => ({}));
  methods.getWorkProgramBars = vi.fn(async () => fx.bars);
  methods.getWorkProgramBar = vi.fn(async (id: number) => fx.bars.find(b => b.id === id) ?? null);
  methods.getArrangementProgrammeAllocationsForProject = vi.fn(async () => fx.barAllocations);
  methods.updateWorkProgramBar = vi.fn(async (id: number, data: any) => {
    storageCalls.updated.push({ id, data });
    return { id, ...data };
  });
  methods.deleteWorkProgramBar = vi.fn(async (id: number) => {
    storageCalls.deleted.push(id);
  });
  methods.upsertWorkProgramBar = vi.fn(async (data: any) => {
    storageCalls.upserted.push(data);
    return { id: 91000 + storageCalls.upserted.length, ...data };
  });
  methods.bulkSetBoqItemsNeedsReview = vi.fn(async () => undefined);
  methods.logAudit = vi.fn(async (entry: any) => {
    storageCalls.audits.push(entry);
    return { id: 1, ...entry };
  });

  return { storage: storageProxy };
});

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

beforeEach(() => {
  fx.items = [];
  fx.bars = [];
  fx.barAllocations = [];
  storageCalls.updated.length = 0;
  storageCalls.deleted.length = 0;
  storageCalls.upserted.length = 0;
  storageCalls.audits.length = 0;
});

function gsbFixtureItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 601,
    projectId: PROJECT_ID,
    itemCode: "4.1",
    itemName: null,
    description: "Providing and laying Granular Sub Base with well graded material as per MoRTH 401",
    unit: "Cum",
    canonicalUnit: "Cum",
    currentQty: 30000,
    includedInPlanning: true,
    layerConfig: null,
    materials: [],
    equipment: [],
    labour: [],
    ...overrides,
  };
}

const lhsRhsBody = {
  disableStructureFronts: true,
  stretches: [
    { chainageFrom: 100, chainageTo: 120, priority: 1, side: "lhs", plannedWidthM: 7 },
    { chainageFrom: 100, chainageTo: 120, priority: 1, side: "rhs", plannedWidthM: 3.5 },
  ],
};

describe("029C route — round-trip + preview + overallocation", () => {
  it("persists side + plannedWidthM on bars and strips preview-only fields", async () => {
    fx.items = [gsbFixtureItem()];
    const res = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`).send(lhsRhsBody);
    expect(res.status).toBe(200);
    expect(storageCalls.upserted.length).toBe(2);
    const lhsBar = storageCalls.upserted.find(b => b.side === "lhs");
    expect(lhsBar).toBeTruthy();
    expect(lhsBar.plannedWidthM).toBe(7);
    expect(lhsBar.allocationRule).toBeUndefined();
    expect(lhsBar.allocationNote).toBeUndefined();
    const total = storageCalls.upserted.reduce((s, b) => s + Number(b.plannedQty), 0);
    expect(total).toBeCloseTo(30000, 1); // width split, no double count
  });

  it("dry-run returns allocationPreview with programmed totals", async () => {
    fx.items = [gsbFixtureItem()];
    const res = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`).send({ ...lhsRhsBody, dryRun: true });
    expect(res.status).toBe(200);
    const ap = res.body?.regenSummary?.allocationPreview;
    expect(Array.isArray(ap)).toBe(true);
    expect(ap[0].boqItemId).toBe(601);
    expect(ap[0].totalAllocated).toBeCloseTo(30000, 1);
    expect(ap[0].overallocated).toBe(0);
    expect(storageCalls.upserted.length).toBe(0); // dry-run touches nothing
  });

  it("blocks overallocation with 400 OVERALLOCATION_BLOCKED, allows explicit override + audits it", async () => {
    fx.items = [gsbFixtureItem()];
    const overBody = {
      disableStructureFronts: true,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 1, manualQtyFraction: 0.8 },
        { chainageFrom: 110, chainageTo: 120, priority: 2, manualQtyFraction: 0.8 }, // 160% total
      ],
    };
    const blocked = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`).send(overBody);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe("OVERALLOCATION_BLOCKED");
    expect(blocked.body.overallocatedItems[0].boqItemId).toBe(601);
    expect(storageCalls.upserted.length).toBe(0);

    const overridden = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({ ...overBody, overallocationOverrideReason: "Contract variation VO-12 increases GSB scope" });
    expect(overridden.status).toBe(200);
    expect(storageCalls.upserted.length).toBe(2);
    expect(storageCalls.audits.length).toBe(1);
    expect(storageCalls.audits[0].action).toBe("overallocation_override");
    expect(storageCalls.audits[0].reason).toContain("VO-12");
  });

  it("blocked overallocation run performs ZERO mutations (no settings save, no structure pre-delete)", async () => {
    // Structure-planned item with an old auto bar → would normally be pre-deleted
    fx.items = [
      gsbFixtureItem(),
      gsbFixtureItem({
        id: 602, itemCode: "12.1",
        description: "Construction of RCC box culvert 2x2m as per MoRTH 1200",
        planningWorkType: "culvert", currentQty: 500,
      }),
    ];
    fx.bars = [{
      id: 7101, boqProjectId: PROJECT_ID, boqItemId: 602,
      reachLabel: "Structures", chainageFrom: 100, chainageTo: 120,
      startMonth: 1, endMonth: 4, plannedQty: 500, source: "auto-sequence",
    }];
    const { storage } = await import("../server/storage");
    (storage.upsertBoqProgramSettings as any).mockClear();
    const res = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`).send({
      disableStructureFronts: true,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 1, manualQtyFraction: 0.8 },
        { chainageFrom: 110, chainageTo: 120, priority: 2, manualQtyFraction: 0.8 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("OVERALLOCATION_BLOCKED");
    expect(storageCalls.upserted.length).toBe(0);
    expect(storageCalls.updated.length).toBe(0);
    expect(storageCalls.deleted.length).toBe(0); // structure pre-delete deferred past the guard
    expect((storage.upsertBoqProgramSettings as any).mock.calls.length).toBe(0); // settings save deferred too
  });

  it("reconciled arrangement-linked bar with manual qty override keeps its quantity (qtyConflicts)", async () => {
    fx.items = [gsbFixtureItem()];
    fx.bars = [{
      id: 7001, boqProjectId: PROJECT_ID, boqItemId: 601,
      reachLabel: "Reach 1", chainageFrom: 100, chainageTo: 120,
      startMonth: 1, endMonth: 4, plannedQty: 5000, isQtyOverride: true,
      source: "auto-sequence",
    }];
    fx.barAllocations = [{ programmeBarId: 7001, arrangementId: 42 }];
    const res = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`).send({
      disableStructureFronts: true,
      stretches: [{ chainageFrom: 100, chainageTo: 120, priority: 1, side: "full_width" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.regenSummary.qtyConflicts).toHaveLength(1);
    expect(res.body.regenSummary.qtyConflicts[0].keptQty).toBe(5000);
    const upd = storageCalls.updated.find(u => u.id === 7001);
    expect(upd).toBeTruthy();
    expect(upd!.data.plannedQty).toBeUndefined(); // manual quantity NOT overwritten
  });
});
