/**
 * Guided DPR Reliability — draft resume, programme link through submit,
 * scoped balance, out-of-range reason persistence, executor attribution.
 *
 * Coverage:
 *  • Part A — draft state round-trips losslessly through JSON (the autosave
 *    serialization format): every entry field including programmeBarId,
 *    chainageOverrideReason, quantitySource and executedBy survives.
 *  • Part B — programmeBarId survives the FULL server lifecycle on the real
 *    route handlers (registerRoutes + real validateProgressProgrammeLinks,
 *    mocked storage): POST draft (lenient, incomplete chainage keeps the
 *    link) → PATCH draft (no second record) → POST submit (strict).
 *  • No duplicate DPR from repeated draft saves: createDpr fires exactly once;
 *    every later save routes through updateDraftDpr on the same id.
 *  • Part D — out-of-range chainage: submit blocked without a reason; with a
 *    reason the row reaches submitDraftDpr with the reason intact AND stamped
 *    chainageReviewStatus="review_required" (excluded from bar actuals until
 *    reviewed). In-range rows carry no review status.
 *  • Part E — executedBy flows through draft and submit payloads.
 *  • Part C — bar-scoped balance figures come from barBalanceFigures (bar's
 *    own planned/reported/remaining), independent of BOQ-item totals.
 */
import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { barBalanceFigures } from "../shared/dprProgrammeLink";

const PROJECT_ID = 910001;
const BAR_ID = 8101;
const OTHER_BAR_ID = 8102;
const DRAFT_ID = 6001;

const fx = { bars: [] as any[], drafts: new Map<number, any>(), nextId: DRAFT_ID };
const calls = {
  createdDprs: [] as any[],
  draftUpdates: [] as Array<{ id: number; input: any }>,
  submits: [] as Array<{ id: number; input: any }>,
};

vi.mock("../server/push", () => ({
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });

  // registerRoutes fires a background seedDatabase() that seeds an example
  // DPR when getDprs() is empty — return a non-empty list so it never runs
  // (its createDpr call would race with the tests' drafts).
  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  methods.getBoqItem = vi.fn(async () => null);
  methods.getWorkProgramBar = vi.fn(async (id: number) => fx.bars.find(b => b.id === id) ?? undefined);
  methods.getWorkProgramBars = vi.fn(async (projectId: number) => fx.bars.filter(b => b.boqProjectId === projectId));
  methods.createDpr = vi.fn(async (input: any) => {
    calls.createdDprs.push(input);
    const id = fx.nextId++; // unique per created DPR — no cross-test collisions
    const dpr = { id, ...input, draftRevision: "test-revision" };
    fx.drafts.set(id, dpr);
    return dpr;
  });
  methods.getDpr = vi.fn(async (id: number) => fx.drafts.get(id));
  methods.updateDraftDpr = vi.fn(async (id: number, input: any, expectedRevision: string) => {
    const current = fx.drafts.get(id);
    if (!current || expectedRevision !== current.draftRevision) return undefined;
    calls.draftUpdates.push({ id, input });
    const updated = { ...current, ...input, id, draftRevision: `revision-${calls.draftUpdates.length}` };
    fx.drafts.set(id, updated);
    return updated;
  });
  methods.submitDraftDpr = vi.fn(async (id: number, input: any, _timestamp: string | undefined, _audit: any, expectedRevision: string) => {
    const current = fx.drafts.get(id);
    if (!current || expectedRevision !== current.draftRevision) return undefined;
    calls.submits.push({ id, input });
    const submitted = { ...current, ...input, id, dprStatus: "submitted", draftRevision: "submitted-revision" };
    fx.drafts.set(id, submitted);
    return submitted;
  });
  methods.createNotification = vi.fn(async () => ({}));
  methods.getReportedQtyByBar = vi.fn(async () => new Map());

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

function roadBar(overrides: Record<string, unknown> = {}) {
  return {
    id: BAR_ID,
    boqProjectId: PROJECT_ID,
    boqItemId: 701,
    reachLabel: "Reach 1",
    chainageFrom: 100,
    chainageTo: 110,
    plannedQty: 15000,
    source: "auto-sequence",
    side: "lhs",
    scheduled: true,
    planningMode: null,
    ...overrides,
  };
}

/** Mirrors GuidedDpr buildPayload output. */
function guidedPayload(opts: {
  asDraft: boolean;
  progressOverrides?: Record<string, unknown>;
  baseDraftRevision?: string;
}) {
  return {
    date: "2026-08-05",
    site: "Test Site",
    engineer: "TEST ENGINEER - ENGINEER",
    role: "engineer",
    workType: "road",
    boqProjectId: PROJECT_ID,
    baseDraftRevision: opts.baseDraftRevision ?? "test-revision",
    ...(opts.asDraft ? { dprStatus: "draft" } : {}),
    progress: [{
      activity: "GSB LAYING",
      side: "LHS",
      chainageFrom: "100+000",
      chainageTo: "101+000",
      length: null,
      width: null,
      thickness: null,
      quantity: 1100,
      uom: "CUM",
      noSiteWork: false,
      noSiteWorkDescription: "",
      personnelIds: [],
      boqItemId: 701,
      programmeBarId: BAR_ID,
      chainageFromKm: 100,
      chainageToKm: 101,
      quantitySource: "measured",
      quantitySourceNote: null,
      chainageOverrideReason: null,
      executedBy: null,
      ...(opts.progressOverrides ?? {}),
    }],
    structureItems: [],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
  };
}

function resetFx() {
  fx.bars = [roadBar()];
  fx.drafts.clear();
  calls.createdDprs = [];
  calls.draftUpdates = [];
  calls.submits = [];
}
beforeEach(resetFx);

// ---------------------------------------------------------------------------
// Part A — draft state serialization (the autosave format) loses nothing
// ---------------------------------------------------------------------------

describe("Part A — guided draft state round-trips losslessly", () => {
  it("every field of the guided form state survives JSON serialization", () => {
    const state = {
      date: "2026-08-05",
      siteName: "Takkadpally-sirur",
      engineer: "R KUMAR - ENGINEER",
      entries: [{
        activity: "GSB LAYING",
        boqItemId: 701,
        programmeBarId: BAR_ID,
        side: "LHS",
        chainageFrom: "100+000",
        chainageTo: "100+450",
        quantity: 495,
        uom: "CUM",
        expanded: true,
        width: 5.5,
        thickness: 0.2,
        remark: "night shift",
        quantitySource: "measured",
        quantitySourceNote: "",
        chainageOverrideReason: "client instruction",
        executedBy: "agency",
      }],
      equipment: [{ machine: "Grader", vehicleNo: "TS01AB1234", operator: "S", task: "spreading" }],
      labour: [{ category: "Skilled", count: 4, contractor: "M/s ABC", task: "" }],
      remarks: "overall note",
      draftId: DRAFT_ID,
    };
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored).toEqual(state); // deep equality — zero data loss
    // The reliability-critical fields explicitly:
    expect(restored.entries[0].programmeBarId).toBe(BAR_ID);
    expect(restored.entries[0].chainageOverrideReason).toBe("client instruction");
    expect(restored.entries[0].executedBy).toBe("agency");
    expect(restored.draftId).toBe(DRAFT_ID);
  });
});

// ---------------------------------------------------------------------------
// Part B — programme link through the full server lifecycle
// ---------------------------------------------------------------------------

describe("Part B — programmeBarId survives draft → update → submit (real routes)", () => {
  it("draft POST with INCOMPLETE chainage keeps the link (draft-lenient)", async () => {
    const res = await request(app).post("/api/dprs").send(guidedPayload({
      asDraft: true,
      progressOverrides: { chainageFrom: "", chainageTo: "", chainageFromKm: null, chainageToKm: null, quantity: null, quantitySource: null },
    }));
    expect(res.status).toBe(201);
    expect(calls.createdDprs).toHaveLength(1);
    expect(calls.createdDprs[0].progress[0].programmeBarId).toBe(BAR_ID);
  });

  it("full lifecycle: create draft → PATCH draft twice → submit — link intact at every step, exactly one DPR record", async () => {
    // 1. create draft
    const create = await request(app).post("/api/dprs").send(guidedPayload({ asDraft: true }));
    expect(create.status).toBe(201);
    const id = create.body.id;
    let revision = create.body.draftRevision;
    expect(id).toBeGreaterThanOrEqual(DRAFT_ID);

    // 2. two more autosaves — PATCH the SAME record, never a new POST
    for (const qty of [1200, 1250]) {
      const patch = await request(app).patch(`/api/dprs/${id}/draft`).send(guidedPayload({
        asDraft: true, progressOverrides: { quantity: qty }, baseDraftRevision: revision,
      }));
      expect(patch.status).toBe(200);
      revision = patch.body.draftRevision;
    }
    expect(calls.createdDprs).toHaveLength(1);          // no duplicate DPR
    expect(calls.draftUpdates).toHaveLength(2);
    expect(calls.draftUpdates.every(u => u.id === id)).toBe(true);
    expect(calls.draftUpdates[1].input.progress[0].programmeBarId).toBe(BAR_ID);

    // 3. submit — strict validation passes, link + side reach storage intact
    const submit = await request(app).post(`/api/dprs/${id}/submit`).send(guidedPayload({
      asDraft: false,
      baseDraftRevision: revision,
    }));
    expect(submit.status).toBe(200);
    expect(calls.submits).toHaveLength(1);
    const row = calls.submits[0].input.progress[0];
    expect(row.programmeBarId).toBe(BAR_ID);
    expect(row.side).toBe("LHS");
    expect(row.chainageReviewStatus ?? null).toBeNull(); // in-range: counts toward the bar
  });

  it("rejects missing and stale draft revisions without replacing saved child rows", async () => {
    const create = await request(app).post("/api/dprs").send(guidedPayload({ asDraft: true }));
    const id = create.body.id;
    const originalProgress = structuredClone(fx.drafts.get(id).progress);
    const withRevision = guidedPayload({
      asDraft: true,
      progressOverrides: { quantity: 9999 },
      baseDraftRevision: "stale-revision",
    });
    const stale = await request(app).patch(`/api/dprs/${id}/draft`).send(withRevision);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("DPR_DRAFT_STALE");
    expect(fx.drafts.get(id).progress).toEqual(originalProgress);

    const { baseDraftRevision: _removed, ...withoutRevision } = withRevision;
    const missing = await request(app).patch(`/api/dprs/${id}/draft`).send(withoutRevision);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("DPR_DRAFT_REVISION_REQUIRED");
    expect(fx.drafts.get(id).progress).toEqual(originalProgress);
  });

  it("submit strictly blocks a linked row with missing chainage (no silent link drop)", async () => {
    const create = await request(app).post("/api/dprs").send(guidedPayload({
      asDraft: true,
      progressOverrides: { chainageFrom: "", chainageTo: "", chainageFromKm: null, chainageToKm: null, quantity: null, quantitySource: null },
    }));
    const id = create.body.id;
    const submit = await request(app).post(`/api/dprs/${id}/submit`).send(guidedPayload({
      asDraft: false,
      progressOverrides: { chainageFrom: "", chainageTo: "", chainageFromKm: null, chainageToKm: null },
    }));
    expect(submit.status).toBe(400);
    expect(submit.body.code).toBe("PROGRAMME_LINK_INVALID");
    expect(calls.submits).toHaveLength(0);
    // The draft still exists untouched, link intact:
    expect(fx.drafts.get(id).progress[0].programmeBarId).toBe(BAR_ID);
  });
});

// ---------------------------------------------------------------------------
// Part D — out-of-range reason survives to a successful submit
// ---------------------------------------------------------------------------

describe("Part D — out-of-range chainage reason persistence", () => {
  const outOfRange = { chainageFrom: "111+000", chainageTo: "112+000", chainageFromKm: 111, chainageToKm: 112 };

  it("submit without a reason is blocked with PROGRAMME_LINK_INVALID", async () => {
    const create = await request(app).post("/api/dprs").send(guidedPayload({ asDraft: true, progressOverrides: outOfRange }));
    expect(create.status).toBe(201); // draft-lenient: saveable without reason
    const submit = await request(app).post(`/api/dprs/${create.body.id}/submit`).send(guidedPayload({
      asDraft: false, progressOverrides: outOfRange,
    }));
    expect(submit.status).toBe(400);
    expect(submit.body.code).toBe("PROGRAMME_LINK_INVALID");
  });

  it("with a reason: submit succeeds, reason persisted, row stamped review_required", async () => {
    const withReason = { ...outOfRange, chainageOverrideReason: "continuation of previous stretch" };
    const create = await request(app).post("/api/dprs").send(guidedPayload({ asDraft: true, progressOverrides: withReason }));
    const submit = await request(app).post(`/api/dprs/${create.body.id}/submit`).send(guidedPayload({
      asDraft: false, progressOverrides: withReason,
    }));
    expect(submit.status).toBe(200);
    const row = calls.submits[0].input.progress[0];
    expect(row.chainageOverrideReason).toBe("continuation of previous stretch");
    expect(row.programmeBarId).toBe(BAR_ID);
    // Part G stamp: preserved but excluded from bar actuals until reviewed
    expect(row.chainageReviewStatus).toBe("review_required");
  });
});

// ---------------------------------------------------------------------------
// Part E — executor attribution flows through draft and submit
// ---------------------------------------------------------------------------

describe("Part E — executedBy attribution persists through the lifecycle", () => {
  it("executedBy set on a draft reaches submitDraftDpr unchanged", async () => {
    const withExecutor = { executedBy: "agency" };
    const create = await request(app).post("/api/dprs").send(guidedPayload({ asDraft: true, progressOverrides: withExecutor }));
    expect(create.status).toBe(201);
    expect(calls.createdDprs[0].progress[0].executedBy).toBe("agency");
    const submit = await request(app).post(`/api/dprs/${create.body.id}/submit`).send(guidedPayload({
      asDraft: false, progressOverrides: withExecutor,
    }));
    expect(submit.status).toBe(200);
    expect(calls.submits[0].input.progress[0].executedBy).toBe("agency");
  });
});

// ---------------------------------------------------------------------------
// Part C — balance figures are scoped to the selected bar
// ---------------------------------------------------------------------------

describe("Part C — bar-scoped balance, not BOQ-item totals", () => {
  it("two bars of the same item report their own planned/done/balance", () => {
    const barA = { ...roadBar(), plannedQty: 1000, reportedQty: 400, remainingQty: 600, unit: "CUM" };
    const barB = { ...roadBar({ id: OTHER_BAR_ID }), plannedQty: 500, reportedQty: 0, remainingQty: 500, unit: "CUM" };
    expect(barBalanceFigures(barA as any)).toEqual({ currentQty: 1000, totalActual: 400, balance: 600, unit: "CUM" });
    expect(barBalanceFigures(barB as any)).toEqual({ currentQty: 500, totalActual: 0, balance: 500, unit: "CUM" });
    // Item total (1500 planned) is NOT what either bar shows.
    expect(barBalanceFigures(barA as any)!.currentQty).not.toBe(1500);
  });
});
