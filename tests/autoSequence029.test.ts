/**
 * Instruction 029 — Real stretch/chainage input, independent execution priority,
 * and arrangement-safe re-sequencing.
 *
 * Coverage (acceptance A–F of the spec):
 *  A — priority-over-chainage scheduling: priority 1 stretch mobilises first even
 *      when it sits at the far chainage end; sequenceOrder stamped on road bars.
 *  B — server blocks genuinely overlapping stretches (400 STRETCH_VALIDATION_FAILED)
 *      and PATCH chainage edits that overlap a sibling bar (400 CHAINAGE_OVERLAP).
 *  C — gaps are non-blocking warnings (validateStretches + route stretchGaps).
 *  D — arrangement-linked bars survive a re-run: reconciled in place (id kept,
 *      updateWorkProgramBar) or blocked (never deleted) when nothing overlaps.
 *  E — proportionate stretch quantity matches calculateStretchQty (formula untouched).
 *  F — structure sequencing untouched (structure group bars carry no sequenceOrder).
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import {
  generateSequencedProgramme,
  validateStretches,
  type SeqInputItem,
} from "../shared/programmeSequencer";
import { calculateStretchQty } from "../shared/planningEngine";

// ---------------------------------------------------------------------------
// Unit tests — sequencer + validator (no server needed)
// ---------------------------------------------------------------------------

const gsbItem: SeqInputItem = {
  boqItemId: 1,
  description: "Providing and laying Granular Sub Base with well graded material as per MoRTH 401",
  unit: "Cum",
  totalQty: 30000,
  fullDurationMonths: 6,
};
const wmmItem: SeqInputItem = {
  boqItemId: 2,
  description: "Providing and laying Wet Mix Macadam as per MoRTH 406",
  unit: "Cum",
  totalQty: 24000,
  fullDurationMonths: 6,
};

const baseOpts = {
  fronts: 2,
  totalMonths: 18,
  roadLengthKm: 20,
  chainageStartKm: 100,
  staggerMonths: 2,
  lagMonths: 0,
  disableStructureFronts: true,
};

describe("029 sequencer — real stretches + execution priority", () => {
  it("A: priority order drives stagger offsets, independent of chainage order", () => {
    // Far stretch (Km 110–120) has priority 1 → must start FIRST (offset 0).
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 2 },
        { chainageFrom: 110, chainageTo: 120, priority: 1 },
      ],
    });
    const far = bars.find(b => b.chainageFrom === 110)!;
    const near = bars.find(b => b.chainageFrom === 100)!;
    expect(far.startMonth).toBeLessThan(near.startMonth);
    expect(near.startMonth - far.startMonth).toBeCloseTo(2, 5); // stagger by priority rank
    expect(far.sequenceOrder).toBe(1);
    expect(near.sequenceOrder).toBe(2);
    // Reach label number reflects execution priority, not chainage position.
    expect(far.reachLabel).toBe("Reach 1");
    expect(near.reachLabel).toBe("Reach 2");
  });

  it("E: proportionate stretch qty matches calculateStretchQty exactly", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 104, priority: 1 }, // 4 km of 20
        { chainageFrom: 104, chainageTo: 120, priority: 2 }, // 16 km of 20
      ],
    });
    const a = bars.find(b => b.chainageFrom === 100)!;
    const b2 = bars.find(b => b.chainageFrom === 104)!;
    expect(a.plannedQty).toBeCloseTo(calculateStretchQty(30000, 100, 104, 20), 6);
    expect(b2.plannedQty).toBeCloseTo(calculateStretchQty(30000, 104, 120, 20), 6);
    expect(a.plannedQty + b2.plannedQty).toBeCloseTo(30000, 6);
  });

  it("manualQtyFraction overrides the proportionate share", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 1, manualQtyFraction: 0.7 },
        { chainageFrom: 110, chainageTo: 120, priority: 2 },
      ],
    });
    expect(bars.find(b => b.chainageFrom === 100)!.plannedQty).toBeCloseTo(21000, 6);
    expect(bars.find(b => b.chainageFrom === 110)!.plannedQty).toBeCloseTo(15000, 6);
  });

  it("custom labels are preserved; stage dependency order kept within a stretch", () => {
    const { bars } = generateSequencedProgramme([gsbItem, wmmItem], {
      ...baseOpts,
      stretches: [
        { label: "Pkg-A", chainageFrom: 100, chainageTo: 110, priority: 1 },
        { chainageFrom: 110, chainageTo: 120, priority: 2 },
      ],
    });
    const pkgA = bars.filter(b => b.reachLabel === "Pkg-A");
    expect(pkgA).toHaveLength(2);
    const gsb = pkgA.find(b => b.boqItemId === 1)!;
    const wmm = pkgA.find(b => b.boqItemId === 2)!;
    expect(wmm.startMonth).toBeGreaterThanOrEqual(gsb.endMonth); // GSB before WMM
  });

  it("legacy equal split unchanged, but road bars now get default sequenceOrder = chainage order", () => {
    const { bars } = generateSequencedProgramme([gsbItem], baseOpts); // no stretches
    expect(bars).toHaveLength(2);
    const r1 = bars.find(b => b.reachLabel === "Reach 1")!;
    const r2 = bars.find(b => b.reachLabel === "Reach 2")!;
    expect(r1.chainageFrom).toBeCloseTo(100, 6);
    expect(r1.chainageTo).toBeCloseTo(110, 6);
    expect(r2.chainageFrom).toBeCloseTo(110, 6);
    expect(r1.plannedQty).toBeCloseTo(15000, 6); // totalQty / fronts — unchanged
    expect(r1.sequenceOrder).toBe(1);
    expect(r2.sequenceOrder).toBe(2);
    expect(r1.startMonth).toBeLessThan(r2.startMonth);
  });

  it("F: structure group bars carry no sequenceOrder (structure sequencing untouched)", () => {
    const culvert: SeqInputItem = {
      boqItemId: 3,
      description: "Construction of RCC box culvert including excavation as per MoRTH 2100",
      unit: "Cum",
      totalQty: 500,
      fullDurationMonths: 4,
      planningWorkType: "structure",
    };
    const { bars } = generateSequencedProgramme([culvert], {
      ...baseOpts,
      disableStructureFronts: false,
      stretches: [{ chainageFrom: 100, chainageTo: 120, priority: 1 }],
    });
    const structBars = bars.filter(b => /Struct/.test(b.reachLabel));
    expect(structBars.length).toBeGreaterThan(0);
    for (const b of structBars) expect(b.sequenceOrder).toBeUndefined();
  });
});

describe("029 validateStretches — overlaps block, gaps warn", () => {
  it("B: detects genuine interior overlap (touching boundaries allowed)", () => {
    // 029B: overlap validation is side-aware — same side (or full_width)
    // keeps the classic blocking behaviour tested here.
    const v = validateStretches(
      [
        { chainageFrom: 0, chainageTo: 10, priority: 1, side: "full_width" },
        { chainageFrom: 8, chainageTo: 20, priority: 2, side: "full_width" },
      ],
      0, 20,
    );
    expect(v.overlaps).toHaveLength(1);
    expect(v.overlaps[0].overlapFrom).toBeCloseTo(8, 3);
    expect(v.overlaps[0].overlapTo).toBeCloseTo(10, 3);

    const touching = validateStretches(
      [
        { chainageFrom: 0, chainageTo: 10, priority: 1 },
        { chainageFrom: 10, chainageTo: 20, priority: 2 },
      ],
      0, 20,
    );
    expect(touching.overlaps).toHaveLength(0);
    expect(touching.gaps).toHaveLength(0);
    expect(touching.errors).toHaveLength(0);
  });

  it("C: reports uncovered ranges as gaps (non-blocking)", () => {
    const v = validateStretches(
      [
        { chainageFrom: 2, chainageTo: 8, priority: 1 },
        { chainageFrom: 12, chainageTo: 18, priority: 2 },
      ],
      0, 20,
    );
    expect(v.overlaps).toHaveLength(0);
    expect(v.errors).toHaveLength(0);
    expect(v.gaps).toEqual([
      { from: 0, to: 2 },
      { from: 8, to: 12 },
      { from: 18, to: 20 },
    ]);
  });

  it("flags malformed rows as blocking errors; duplicate stages are ALLOWED (029B)", () => {
    const v = validateStretches(
      [
        { chainageFrom: 10, chainageTo: 10, priority: 1 }, // zero length
        { chainageFrom: 0, chainageTo: 5, priority: 1 },   // shared stage — normal parallel work
      ],
      0, 20,
    );
    expect(v.errors.some(e => /greater than/.test(e))).toBe(true);
    // 029B Part C: the old "priority used more than once" rule is gone.
    expect(v.errors.some(e => /used more than once/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route-level tests — Part B/C/D against the REAL auto-sequence + PATCH routes
// ---------------------------------------------------------------------------

const PROJECT_ID = 779001;

const fx = {
  project: {
    id: PROJECT_ID,
    name: "029 Route Test Project",
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
    return { id: 90000 + storageCalls.upserted.length, ...data };
  });
  methods.bulkSetBoqItemsNeedsReview = vi.fn(async () => undefined);

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

function gsbFixtureItem() {
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
  };
}

function autoBar(overrides: Record<string, unknown> = {}) {
  return {
    id: 7001,
    boqProjectId: PROJECT_ID,
    boqItemId: 601,
    reachLabel: "Reach 1",
    chainageFrom: 100,
    chainageTo: 110,
    startMonth: 1,
    endMonth: 4,
    plannedQty: 15000,
    source: "auto-sequence",
    ...overrides,
  };
}

function resetFx() {
  fx.items = [gsbFixtureItem()];
  fx.bars = [];
  fx.barAllocations = [];
  storageCalls.updated = [];
  storageCalls.deleted = [];
  storageCalls.upserted = [];
}

describe("029 route — stretch validation (Part B/C)", () => {
  it("B: overlapping stretches are rejected with 400 STRETCH_VALIDATION_FAILED", async () => {
    resetFx();
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({
        staggerMonths: 1, lagMonths: 0, disableStructureFronts: true,
        // 029B: side-aware validation — same-side overlap keeps the classic block.
        stretches: [
          { chainageFrom: 100, chainageTo: 112, priority: 1, side: "full_width" },
          { chainageFrom: 110, chainageTo: 120, priority: 2, side: "full_width" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("STRETCH_VALIDATION_FAILED");
    expect(res.body.overlaps).toHaveLength(1);
    expect(storageCalls.deleted).toHaveLength(0);
    expect(storageCalls.upserted).toHaveLength(0);
  });

  it("C: gaps do not block — run succeeds and reports stretchGaps in regenSummary", async () => {
    resetFx();
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({
        staggerMonths: 1, lagMonths: 0, disableStructureFronts: true,
        stretches: [
          { chainageFrom: 100, chainageTo: 108, priority: 1 },
          { chainageFrom: 112, chainageTo: 120, priority: 2 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.regenSummary.stretchGaps).toEqual([{ from: 108, to: 112 }]);
    expect(storageCalls.upserted).toHaveLength(2);
    // sequenceOrder persisted on the created bars
    expect(storageCalls.upserted.map(b => b.sequenceOrder).sort()).toEqual([1, 2]);
  });
});

describe("029 route — arrangement-safe regeneration (Part D)", () => {
  it("D1: arrangement-linked bar is reconciled IN PLACE (id kept, never deleted)", async () => {
    resetFx();
    fx.bars = [autoBar(), autoBar({ id: 7002, reachLabel: "Reach 2", chainageFrom: 110, chainageTo: 120 })];
    fx.barAllocations = [{ id: 1, programmeBarId: 7001, arrangementId: 55, monthFraction: 1 }];
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({
        staggerMonths: 1, lagMonths: 0, disableStructureFronts: true,
        stretches: [
          { chainageFrom: 100, chainageTo: 110, priority: 1 },
          { chainageFrom: 110, chainageTo: 120, priority: 2 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.regenSummary.preservedUpdated).toBe(1);
    expect(res.body.regenSummary.blocked).toHaveLength(0);
    // Linked bar 7001 updated in place, unlinked bar 7002 deleted + recreated.
    expect(storageCalls.updated.map(u => u.id)).toEqual([7001]);
    expect(storageCalls.deleted).toEqual([7002]);
    expect(storageCalls.deleted).not.toContain(7001);
    expect(storageCalls.upserted).toHaveLength(1); // only the second stretch's bar
  });

  it("D2: linked bar with NO overlapping new stretch is BLOCKED, not deleted", async () => {
    resetFx();
    fx.bars = [autoBar({ chainageFrom: 100, chainageTo: 105 })];
    fx.barAllocations = [{ id: 1, programmeBarId: 7001, arrangementId: 55, monthFraction: 1 }];
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({
        staggerMonths: 1, lagMonths: 0, disableStructureFronts: true,
        stretches: [{ chainageFrom: 110, chainageTo: 120, priority: 1 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.regenSummary.blocked).toHaveLength(1);
    expect(res.body.regenSummary.blocked[0]).toMatchObject({ barId: 7001, arrangementIds: [55] });
    expect(storageCalls.deleted).toHaveLength(0);
    expect(storageCalls.updated).toHaveLength(0);
  });

  it("D3: dryRun returns the regenSummary without touching anything", async () => {
    resetFx();
    fx.bars = [autoBar()];
    fx.barAllocations = [{ id: 1, programmeBarId: 7001, arrangementId: 55, monthFraction: 1 }];
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({
        dryRun: true, staggerMonths: 1, lagMonths: 0, disableStructureFronts: true,
        stretches: [{ chainageFrom: 100, chainageTo: 110, priority: 1 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.regenSummary.preservedUpdated).toBe(1);
    expect(storageCalls.deleted).toHaveLength(0);
    expect(storageCalls.updated).toHaveLength(0);
    expect(storageCalls.upserted).toHaveLength(0);
  });
});

describe("029 route — PATCH chainage overlap guard (Part C / 029B Part D)", () => {
  it("blocks a same-side chainage edit that overlaps a sibling stretch of the same item", async () => {
    resetFx();
    fx.bars = [
      autoBar({ side: "full_width" }), // 100–110
      autoBar({ id: 7002, reachLabel: "Reach 2", chainageFrom: 110, chainageTo: 120, side: "full_width" }),
    ];
    const res = await request(app)
      .patch(`/api/boq/programme/bars/7002`)
      .send({ chainageFrom: 105 }); // would overlap 105–110 with bar 7001
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CHAINAGE_OVERLAP");
    expect(storageCalls.updated).toHaveLength(0);
  });

  it("029B J: null-side chainage overlap → SIDE_CONFIRM_REQUIRED, not a false duplicate", async () => {
    resetFx();
    fx.bars = [
      autoBar(), // 100–110, side null
      autoBar({ id: 7002, reachLabel: "Reach 2", chainageFrom: 110, chainageTo: 120 }),
    ];
    const res = await request(app)
      .patch(`/api/boq/programme/bars/7002`)
      .send({ chainageFrom: 105 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SIDE_CONFIRM_REQUIRED");
    expect(res.body.message).toMatch(/side must be confirmed/i);
    expect(storageCalls.updated).toHaveLength(0);
  });

  it("029B G: LHS vs RHS may share chainage — distinct corridors pass", async () => {
    resetFx();
    fx.bars = [
      autoBar({ side: "lhs" }), // 100–110 LHS
      autoBar({ id: 7002, reachLabel: "Reach 2", chainageFrom: 110, chainageTo: 120, side: "rhs" }),
    ];
    const res = await request(app)
      .patch(`/api/boq/programme/bars/7002`)
      .send({ chainageFrom: 100, chainageTo: 110 }); // full overlap, opposite side
    expect(res.status).toBe(200);
  });

  it("029B H/I: same-side and full_width-vs-LHS overlaps still block", async () => {
    resetFx();
    fx.bars = [
      autoBar({ side: "lhs" }),
      autoBar({ id: 7002, chainageFrom: 110, chainageTo: 120, side: "lhs" }),
    ];
    const sameSide = await request(app).patch(`/api/boq/programme/bars/7002`).send({ chainageFrom: 105 });
    expect(sameSide.status).toBe(400);
    expect(sameSide.body.error).toBe("CHAINAGE_OVERLAP");

    // Changing side to full_width over an LHS sibling with overlapping chainage blocks too.
    fx.bars = [
      autoBar({ side: "lhs" }),
      autoBar({ id: 7002, chainageFrom: 100, chainageTo: 110, side: "rhs" }),
    ];
    const fw = await request(app).patch(`/api/boq/programme/bars/7002`).send({ side: "full_width" });
    expect(fw.status).toBe(400);
    expect(fw.body.error).toBe("CHAINAGE_OVERLAP");
  });

  it("allows touching boundaries and non-chainage edits", async () => {
    resetFx();
    fx.bars = [autoBar(), autoBar({ id: 7002, chainageFrom: 110, chainageTo: 120 })];
    const ok = await request(app).patch(`/api/boq/programme/bars/7002`).send({ chainageFrom: 110 });
    expect(ok.status).toBe(200);
    const noCh = await request(app).patch(`/api/boq/programme/bars/7001`).send({ plannedQty: 12345 });
    expect(noCh.status).toBe(200);
  });
});
