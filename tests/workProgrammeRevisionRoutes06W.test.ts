/**
 * Instruction 06W — real route handlers with mocked persistence.
 *
 * Verifies that preview is write-free, commit recomputes server-side and sends
 * an atomic source/successor plan, completed work is immutable, and the
 * enriched programme response exposes execution evidence.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const PROJECT_ID = 860001;

const fx = {
  bars: [] as any[],
  evidence: new Map<number, { reportedQty: number; earliestProgressDate: string | null }>(),
  projectStartDate: "2026-01-01" as string | null,
  baselinePublishedAt: null as string | null,
  outcomeCounts: new Map<number, number>(),
  items: [] as any[],
  isAdmin: true,
};

const calls = {
  commits: [] as any[],
  audits: [] as any[],
  barUpdates: [] as Array<{ id: number; data: any }>,
  settingsSaves: [] as Array<{ projectId: number; data: any }>,
  barDeletes: [] as number[],
  barInserts: [] as any[],
};

vi.mock("../server/push", () => ({
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = {
    id: 71,
    username: "programme-admin",
    name: "Programme Admin",
    isAdmin: true,
    isActive: true,
    sessionPolicy: "sticky",
  };
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { ...fakeAdmin, isAdmin: fx.isAdmin };
    req.authPermissions = {};
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const proxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getWorkProgramBar = vi.fn(async (id: number) => fx.bars.find((bar) => bar.id === id));
  methods.getWorkProgramBars = vi.fn(async (projectId: number) =>
    fx.bars.filter((bar) => bar.boqProjectId === projectId),
  );
  methods.getWorkProgrammeExecutionEvidence = vi.fn(async () => fx.evidence);
  methods.getProgrammeBarOutcomeEventCounts = vi.fn(async () => fx.outcomeCounts);
  methods.getBoqProject = vi.fn(async (id: number) =>
    id === PROJECT_ID ? {
      id,
      startDate: fx.projectStartDate,
      programmeBaselinePublishedAt: fx.baselinePublishedAt,
    } : undefined,
  );
  methods.publishProgrammeBaseline = vi.fn(async (id: number) => {
    if (id !== PROJECT_ID || fx.baselinePublishedAt) return null;
    fx.baselinePublishedAt = "2026-03-01T10:00:00.000Z";
    return { id, startDate: fx.projectStartDate, programmeBaselinePublishedAt: fx.baselinePublishedAt };
  });
  methods.getBoqProgramSettings = vi.fn(async () => ({ projectStartDate: fx.projectStartDate }));
  methods.upsertBoqProgramSettings = vi.fn(async (_id: number, body: any) => body);
  methods.upsertBoqProgramSettingsWithCalendarRealignment = vi.fn(async (projectId: number, data: any) => {
    calls.settingsSaves.push({ projectId, data });
    for (const bar of fx.bars) {
      calls.barUpdates.push({
        id: bar.id,
        data: {
          startDate: bar.startDate,
          endDate: bar.endDate,
        },
      });
    }
    return { projectId, ...data };
  });
  methods.updateBoqProject = vi.fn(async () => ({}));
  methods.updateWorkProgramBar = vi.fn(async (id: number, data: any) => {
    calls.barUpdates.push({ id, data });
    return { id, ...data };
  });
  methods.upsertWorkProgramBar = vi.fn(async (data: any) => {
    calls.barInserts.push(data);
    return { id: 9900 + calls.barInserts.length, ...data };
  });
  methods.deleteWorkProgramBar = vi.fn(async (id: number) => {
    calls.barDeletes.push(id);
    return true;
  });
  methods.getSubmittedProgressLinkCounts = vi.fn(async () => new Map());
  methods.getActiveAllocationsForBar = vi.fn(async () => []);
  methods.getBoqItems = vi.fn(async () => fx.items);
  methods.commitWorkProgrammeScheduleRevision = vi.fn(async (input: any) => {
    calls.commits.push(input);
    return {
      source: fx.bars.find((bar) => bar.id === input.source.id),
      shifted: input.shifted,
    };
  });
  methods.logAudit = vi.fn(async (entry: any) => {
    calls.audits.push(entry);
  });
  // Prevent registerRoutes' non-awaited demo seed from creating a DPR while
  // route assertions are running.
  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  methods.createNotification = vi.fn(async () => ({}));
  return { storage: proxy };
});

let app: express.Express;

function bar(overrides: Record<string, unknown> = {}) {
  return {
    id: 8001,
    boqProjectId: PROJECT_ID,
    boqItemId: 501,
    itemCode: "2.01",
    description: "Granular sub-base",
    reachLabel: "Front 1",
    chainageFrom: 0,
    chainageTo: 5,
    side: "lhs",
    startMonth: 1,
    endMonth: 2,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    baselineStartDate: "2026-01-01",
    baselineEndDate: "2026-01-31",
    revisionHistory: [],
    plannedQty: 1000,
    source: "auto-sequence",
    scheduled: true,
    planningMode: "auto",
    ...overrides,
  };
}

function resetFixtures() {
  fx.bars = [
    bar(),
    bar({
      id: 8002,
      boqItemId: 502,
      itemCode: "2.02",
      description: "Wet mix macadam",
      reachLabel: "Front 1",
      startMonth: 2,
      endMonth: 3,
      startDate: "2026-01-31",
      endDate: "2026-02-28",
      plannedQty: 700,
    }),
    bar({
      id: 8003,
      boqItemId: 503,
      description: "Prime coat",
      startDate: "2026-02-02",
      endDate: "2026-02-15",
      plannedQty: 500,
    }),
  ];
  fx.evidence = new Map([[8003, { reportedQty: 25, earliestProgressDate: "2026-02-03" }]]);
  fx.projectStartDate = "2026-01-01";
  fx.baselinePublishedAt = null;
  fx.outcomeCounts = new Map();
  fx.isAdmin = true;
  fx.items = [];
  calls.commits = [];
  calls.audits = [];
  calls.barUpdates = [];
  calls.settingsSaves = [];
  calls.barDeletes = [];
  calls.barInserts = [];
}

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

beforeEach(resetFixtures);

describe("06W revision routes", () => {
  it("returns a complete write-free preview across BOQ items", async () => {
    const res = await request(app)
      .post("/api/boq/programme/bars/8001/revision-preview")
      .send({
        startDate: "2026-01-01",
        endDate: "2026-02-05",
        reason: "Utility diversion delayed the base layer",
        cascade: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.previewToken).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.deltaDays).toBe(5);
    expect(res.body.shifted.map((row: any) => row.before.id)).toEqual([8002]);
    expect(res.body.notShifted).toEqual([
      expect.objectContaining({
        bar: expect.objectContaining({ id: 8003 }),
        executionState: "started",
        reason: expect.stringMatching(/started/i),
      }),
    ]);
    expect(calls.commits).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });

  it("recomputes and sends one atomic source/successor commit with typed history", async () => {
    const body = {
      startDate: "2026-01-03",
      endDate: "2026-02-05",
      reason: "Approved recovery programme",
      cascade: true,
    };
    const preview = await request(app)
      .post("/api/boq/programme/bars/8001/revision-preview")
      .send(body);
    const res = await request(app)
      .post("/api/boq/programme/bars/8001/revise-schedule")
      .send({
        ...body,
        previewToken: preview.body.previewToken,
      });

    expect(res.status).toBe(200);
    expect(calls.commits).toHaveLength(1);
    expect(calls.commits[0].expectedProjectStart).toBe("2026-01-01");
    const commit = calls.commits[0];
    expect(commit.source).toMatchObject({
      id: 8001,
      expectedStartDate: "2026-01-01",
      expectedEndDate: "2026-01-31",
      startDate: "2026-01-03",
      endDate: "2026-02-05",
      historyEntry: {
        type: "schedule_revision",
        originalStartDate: "2026-01-01",
        originalEndDate: "2026-01-31",
        revisedStartDate: "2026-01-03",
        revisedEndDate: "2026-02-05",
        reason: "Approved recovery programme",
      },
    });
    expect(commit.source).not.toHaveProperty("plannedQty");
    expect(commit.source).not.toHaveProperty("isQtyOverride");
    expect(commit.shifted).toHaveLength(1);
    expect(commit.shifted[0]).toMatchObject({
      id: 8002,
      expectedStartDate: "2026-01-31",
      expectedEndDate: "2026-02-28",
      startDate: "2026-02-05",
      endDate: "2026-03-05",
      historyEntry: {
        type: "cascade_shift",
        sourceBarId: 8001,
      },
    });
    expect(calls.audits).toHaveLength(1);
    expect(calls.audits[0]).toMatchObject({
      module: "work_programme",
      action: "schedule_revision",
      reason: "Approved recovery programme",
    });
  });

  it("does not include successors in an atomic commit when cascade is off", async () => {
    const body = {
      startDate: "2026-01-01",
      endDate: "2026-02-05",
      reason: "Source only by PM direction",
      cascade: false,
    };
    const preview = await request(app)
      .post("/api/boq/programme/bars/8001/revision-preview")
      .send(body);
    const res = await request(app)
      .post("/api/boq/programme/bars/8001/revise-schedule")
      .send({
        ...body,
        previewToken: preview.body.previewToken,
      });

    expect(res.status).toBe(200);
    expect(calls.commits[0].shifted).toEqual([]);
    expect(res.body.notShifted).toHaveLength(2);
    expect(res.body.notShifted.every((row: any) => /cascade/i.test(row.reason))).toBe(true);
  });

  it("rejects a completed source without writing", async () => {
    fx.evidence.set(8001, { reportedQty: 1000, earliestProgressDate: "2026-01-02" });
    const res = await request(app)
      .post("/api/boq/programme/bars/8001/revise-schedule")
      .send({
        endDate: "2026-02-05",
        reason: "Attempt after completion",
        cascade: true,
        previewToken: "a".repeat(64),
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("BAR_COMPLETED");
    expect(calls.commits).toHaveLength(0);
  });

  it("rejects a commit when any project schedule changed after preview", async () => {
    const body = {
      startDate: "2026-01-01",
      endDate: "2026-02-05",
      reason: "Preview must remain exact",
      cascade: true,
    };
    const preview = await request(app)
      .post("/api/boq/programme/bars/8001/revision-preview")
      .send(body);
    fx.bars[1].endDate = "2026-03-01";

    const res = await request(app)
      .post("/api/boq/programme/bars/8001/revise-schedule")
      .send({ ...body, previewToken: preview.body.previewToken });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("REVISION_STALE");
    expect(calls.commits).toHaveLength(0);
  });

  it("allows direct schedule editing before baseline when the bar has no evidence", async () => {
    const res = await request(app)
      .patch("/api/boq/programme/bars/8001")
      .send({
        startDate: "2026-01-10",
        endDate: "2026-02-10",
        startMonth: 1.3,
        endMonth: 2.4,
        durationMode: "fixed",
        durationDays: 32,
        isDurationOverride: true,
      });

    expect(res.status).toBe(200);
    expect(calls.barUpdates.at(-1)).toMatchObject({
      id: 8001,
      data: { startDate: "2026-01-10", endDate: "2026-02-10", durationMode: "fixed" },
    });
    expect(calls.commits).toHaveLength(0);
  });

  it("blocks direct schedule editing before baseline when progress or outcome evidence exists", async () => {
    fx.evidence.set(8001, { reportedQty: 1, earliestProgressDate: "2026-01-05" });
    let res = await request(app)
      .patch("/api/boq/programme/bars/8001")
      .send({ startDate: "2026-01-10" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SCHEDULE_REVISION_REQUIRED");

    fx.evidence.delete(8001);
    fx.outcomeCounts.set(8001, 1);
    res = await request(app)
      .patch("/api/boq/programme/bars/8001")
      .send({ durationMode: "fixed" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SCHEDULE_REVISION_REQUIRED");
    expect(calls.barUpdates).toHaveLength(0);
  });

  it("blocks direct schedule editing after the baseline is published", async () => {
    fx.baselinePublishedAt = "2026-02-01T09:00:00.000Z";
    const res = await request(app)
      .patch("/api/boq/programme/bars/8001")
      .send({ startMonth: 2, endMonth: 3 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SCHEDULE_REVISION_REQUIRED");
    expect(calls.barUpdates).toHaveLength(0);
  });

  it("publishes the project programme baseline explicitly and only once", async () => {
    const first = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/programme/publish-baseline`)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.programmeBaselinePublishedAt).toBe("2026-03-01T10:00:00.000Z");
    expect(calls.audits.at(-1)).toMatchObject({
      module: "work_programme",
      transactionId: PROJECT_ID,
      action: "publish_baseline",
    });

    const second = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/programme/publish-baseline`)
      .send({});
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("PROGRAMME_BASELINE_ALREADY_PUBLISHED");
  });

  it("does not publish an empty programme baseline", async () => {
    fx.bars = [];
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/programme/publish-baseline`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROGRAMME_BASELINE_EMPTY");
  });

  it("blocks published create, bulk-create, and auto-sequence bypass routes", async () => {
    fx.baselinePublishedAt = "2026-02-01T09:00:00.000Z";
    const create = await request(app).post(`/api/boq/projects/${PROJECT_ID}/programme`)
      .send({ boqItemId: 999, startMonth: 1, endMonth: 2 });
    const bulk = await request(app).post(`/api/boq/projects/${PROJECT_ID}/programme/bulk`)
      .send({ bars: [{ boqItemId: 999, startMonth: 1, endMonth: 2 }] });
    const auto = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence`)
      .send({});
    const structures = await request(app).post(`/api/boq/projects/${PROJECT_ID}/auto-sequence-structures`)
      .send({});
    for (const res of [create, bulk, auto, structures]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SCHEDULE_REVISION_REQUIRED");
    }
    expect(calls.barUpdates).toHaveLength(0);
  });

  it("blocks published delete, split commit, and structure cleanup without mutations", async () => {
    fx.baselinePublishedAt = "2026-02-01T09:00:00.000Z";
    fx.items = [{
      id: 501,
      planningWorkType: "structure",
      categoryName: "Culverts",
      description: "Culvert concrete",
    }];
    fx.bars = [bar({ id: 8001, boqItemId: 501, source: "auto-sequence" })];

    const deletion = await request(app).delete("/api/boq/programme/bars/8001");
    const split = await request(app)
      .post("/api/boq/programme/bars/8001/split-by-side")
      .send({ parts: [{ side: "lhs" }, { side: "rhs" }] });
    const cleanup = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/programme/clean-structure-bars`)
      .send({});

    for (const res of [deletion, split, cleanup]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SCHEDULE_REVISION_REQUIRED");
    }
    expect(calls.barDeletes).toEqual([]);
    expect(calls.barUpdates).toEqual([]);
    expect(calls.barInserts).toEqual([]);
  });

  it("blocks evidence-linked delete, split, and cleanup while retaining split preview", async () => {
    fx.items = [{
      id: 501,
      planningWorkType: "structure",
      categoryName: "Culverts",
      description: "Culvert concrete",
    }];
    fx.bars = [bar({ id: 8001, boqItemId: 501, source: "auto-sequence" })];
    fx.outcomeCounts.set(8001, 1);

    const preview = await request(app)
      .post("/api/boq/programme/bars/8001/split-by-side")
      .send({ preview: true, parts: [{ side: "lhs" }, { side: "rhs" }] });
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);

    const responses = [
      await request(app).delete("/api/boq/programme/bars/8001"),
      await request(app).post("/api/boq/programme/bars/8001/split-by-side")
        .send({ parts: [{ side: "lhs" }, { side: "rhs" }] }),
      await request(app).post(`/api/boq/projects/${PROJECT_ID}/programme/clean-structure-bars`).send({}),
    ];
    for (const res of responses) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SCHEDULE_REVISION_REQUIRED");
    }
    expect(calls.barDeletes).toEqual([]);
    expect(calls.barUpdates).toEqual([]);
    expect(calls.barInserts).toEqual([]);
  });

  it("allows an evidence-free unpublished structure row to patch its schedule", async () => {
    fx.bars = [bar({ id: 8101, planningMode: "structure_location", source: "structure_import" })];
    fx.evidence = new Map();
    const res = await request(app)
      .patch("/api/boq/programme/bars/8101")
      .send({
        startDate: "2026-01-08",
        endDate: "2026-01-19",
        startMonth: 1.25,
        endMonth: 1.65,
        durationDays: 12,
        durationMode: "fixed",
      });
    expect(res.status).toBe(200);
    expect(calls.barUpdates.at(-1)).toMatchObject({
      id: 8101,
      data: expect.objectContaining({ durationMode: "fixed", durationDays: 12 }),
    });
  });

  it("enriches programme rows from execution evidence without changing schedule dates", async () => {
    fx.evidence.set(8001, { reportedQty: 300, earliestProgressDate: "2026-01-05" });
    const res = await request(app).get(`/api/boq/projects/${PROJECT_ID}/programme`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: 8001,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      reportedQty: 300,
      actualStartDate: "2026-01-05",
      executionState: "started",
    });
  });

  it("realigns month indices without rewriting established dates when project start changes", async () => {
    const res = await request(app)
      .put(`/api/boq/projects/${PROJECT_ID}/program-settings`)
      .send({ projectStartDate: "2026-02-01" });

    expect(res.status).toBe(200);
    expect(calls.settingsSaves).toEqual([{
      projectId: PROJECT_ID,
      data: { projectStartDate: "2026-02-01" },
    }]);
    expect(calls.barUpdates).toHaveLength(fx.bars.length);
    expect(calls.barUpdates[0].data).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(calls.barUpdates[0].data).not.toHaveProperty("baselineStartDate");
    expect(calls.barUpdates[0].data).not.toHaveProperty("baselineEndDate");
  });

  it("denies programme settings changes to a read-only user without mutating schedules", async () => {
    fx.isAdmin = false;

    const res = await request(app)
      .put(`/api/boq/projects/${PROJECT_ID}/program-settings`)
      .send({ projectStartDate: "2026-02-01" });

    expect(res.status).toBe(403);
    expect(calls.settingsSaves).toHaveLength(0);
    expect(calls.barUpdates).toHaveLength(0);
  });

  it("does not let structure auto-sequencing overwrite revised bars", async () => {
    fx.bars = [
      bar({
        id: 8101,
        planningMode: "structure_location",
        structureId: "CUL-1",
        source: "manual",
        revisionHistory: [{ type: "schedule_revision" }],
      }),
      bar({
        id: 8102,
        planningMode: "structure_location",
        structureId: "CUL-2",
        source: "structure_import",
      }),
      bar({
        id: 8103,
        planningMode: "structure_location",
        structureId: "CUL-3",
        source: "structure_import",
      }),
      bar({
        id: 8104,
        planningMode: "structure_location",
        structureId: "CUL-4",
        source: "structure_import",
      }),
    ];
    fx.evidence = new Map();

    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/auto-sequence-structures`)
      .send({ scope: "all" });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);
    expect(calls.barUpdates.map((row) => row.id)).toEqual([8102, 8103, 8104]);
  });
});