/**
 * DPR-04 Fix 2 — a re-resolved BOQ project may not block a DPR which has no
 * BOQ-linked work, while every real child reference keeps the mismatch guard.
 *
 * The route cases intentionally use the same mocked registerRoutes pattern as
 * the Guided DPR lifecycle tests.  This exercises the parsed request payload,
 * both mismatch endpoints, and the canonical project handed to storage.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { createDprRequestSchema } from "../shared/schema";
import { hasDprBoqReferences, hasPreservedDprBoqReferences } from "../shared/dprBoqReferences";

const PROJECT_A = 940001;
const PROJECT_B = 940002;
const DRAFT_ID = 940101;

const fx = vi.hoisted(() => ({
  drafts: new Map<number, any>(),
  nextId: 940101,
  created: [] as any[],
  updated: [] as any[],
  submitted: [] as any[],
  recoveryProjectSite: "DPR-04 TEST SITE",
}));

vi.mock("../server/push", () => ({
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/db", () => {
  const query: any = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    limit: async () => [{ siteName: fx.recoveryProjectSite }],
  };
  return {
    db: {
      // The accepted-recovery route test reaches only the ownership lookup.
      select: vi.fn(() => query),
    },
  };
});

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = { id: 1, username: "dpr04-test-admin", isAdmin: true, isActive: true, sessionPolicy: "sticky" };
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

  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  methods.getBoqItem = vi.fn(async () => null);
  methods.getProjectScopeSegments = vi.fn(async () => []);
  methods.getProjectScopeVersionToken = vi.fn(async () => "");
  methods.getSubmittedChainageEntries = vi.fn(async () => []);
  methods.getDpr = vi.fn(async (id: number) => fx.drafts.get(id));
  methods.createDpr = vi.fn(async (input: any) => {
    const id = fx.nextId++;
    const dpr = { id, ...input };
    fx.created.push(input);
    fx.drafts.set(id, dpr);
    return dpr;
  });
  methods.updateDraftDpr = vi.fn(async (id: number, input: any) => {
    fx.updated.push(input);
    const dpr = { ...(fx.drafts.get(id) ?? {}), ...input, id };
    fx.drafts.set(id, dpr);
    return dpr;
  });
  methods.submitDraftDpr = vi.fn(async (id: number, input: any) => {
    fx.submitted.push(input);
    const dpr = { ...(fx.drafts.get(id) ?? {}), ...input, id, dprStatus: "submitted" };
    fx.drafts.set(id, dpr);
    return dpr;
  });
  methods.createNotification = vi.fn(async () => ({}));

  return {
    storage: storageProxy,
    // The route only needs this class for instanceof handling.  No test case
    // reaches storage's transaction-level mismatch guard.
    DprProjectMismatchError: class DprProjectMismatchError extends Error {},
  };
});

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

function noBoqPayload(projectId: number, asDraft = true): any {
  return {
    date: "2026-09-10",
    site: "DPR-04 TEST SITE",
    engineer: "TEST ENGINEER",
    role: "engineer",
    workType: "road",
    boqProjectId: projectId,
    ...(asDraft ? { dprStatus: "draft" } : {}),
    progress: [{
      activity: "SIDE DRAIN RESTORATION",
      noSiteWork: true,
      noSiteWorkDescription: "ACCESS BLOCKED",
      boqItemId: null,
    }],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
    structureItems: [],
  };
}

function reset() {
  fx.drafts.clear();
  fx.nextId = DRAFT_ID;
  fx.created.length = 0;
  fx.updated.length = 0;
  fx.submitted.length = 0;
}

beforeEach(reset);

describe("DPR-04 Fix 2 — no-BOQ mismatch carve-out", () => {
  it("unit: parsed nested segment, legacy allocation, and labour refs are retained and detected", () => {
    const parsed = createDprRequestSchema.parse({
      ...noBoqPayload(PROJECT_A),
      equipment: [{
        machine: "JCB",
        activitySegments: [{
          startTime: "08:00",
          endTime: "09:00",
          boqItems: [{ boqItemId: 701, programmeBarId: null }],
        }],
        activityAllocations: [{
          boqItemId: 702,
          programmeBarId: null,
          startTime: "09:00",
          endTime: "10:00",
        }],
      }],
      labour: [{ category: "Skilled", count: 2, boqItemId: 703 }],
    });

    expect(parsed.equipment?.[0].activitySegments?.[0].boqItems[0].boqItemId).toBe(701);
    expect(parsed.equipment?.[0].activityAllocations?.[0].boqItemId).toBe(702);
    expect(parsed.labour?.[0].boqItemId).toBe(703);
    expect(hasDprBoqReferences(parsed)).toBe(true);
    expect(hasDprBoqReferences(noBoqPayload(PROJECT_A))).toBe(false);
    expect(hasPreservedDprBoqReferences(
      { equipment: [{ id: 77, activitySegments: [{ boqItems: [{ boqItemId: 704 }] }] }] },
      { equipment: [{ persistedId: 77, machine: "JCB" }] },
    )).toBe(true);
    expect(hasPreservedDprBoqReferences(
      { equipment: [{ id: 77, activitySegments: [{ boqItems: [{ boqItemId: 704 }] }] }] },
      { equipment: [{ persistedId: 77, machine: "JCB", activitySegments: [] }] },
    )).toBe(false);
    expect(createDprRequestSchema.parse({
      ...noBoqPayload(PROJECT_A),
      boqProjectRecoveryConfirmed: true,
    }).boqProjectRecoveryConfirmed).toBe(true);
  });

  it("B/D: PATCH allows a project mismatch only for a no-BOQ draft and canonicalizes the saved project", async () => {
    const created = await request(app).post("/api/dprs").send(noBoqPayload(PROJECT_A));
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/dprs/${created.body.id}/draft`)
      .send(noBoqPayload(PROJECT_B));

    expect(patched.status).toBe(200);
    expect(fx.updated).toHaveLength(1);
    expect(fx.updated[0].boqProjectId).toBe(PROJECT_A);
    expect(patched.body.boqProjectId).toBe(PROJECT_A);
  });

  it("requires an explicit confirmation before a saved null-project draft can be attached", async () => {
    fx.drafts.set(DRAFT_ID, {
      ...noBoqPayload(PROJECT_A),
      id: DRAFT_ID,
      boqProjectId: null,
      dprStatus: "draft",
    });

    const rejected = await request(app)
      .patch(`/api/dprs/${DRAFT_ID}/draft`)
      .send(noBoqPayload(PROJECT_B));

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("DPR_PROJECT_RECOVERY_CONFIRMATION_REQUIRED");
    expect(fx.updated).toHaveLength(0);
  });

  it("does not treat a confirmation as permission to move a saved null-project DPR to another site", async () => {
    fx.drafts.set(DRAFT_ID, {
      ...noBoqPayload(PROJECT_A),
      id: DRAFT_ID,
      boqProjectId: null,
      dprStatus: "draft",
    });

    const rejected = await request(app)
      .patch(`/api/dprs/${DRAFT_ID}/draft`)
      .send({
        ...noBoqPayload(PROJECT_B),
        site: "OTHER SITE",
        boqProjectRecoveryConfirmed: true,
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("DPR_PROJECT_RECOVERY_CONFIRMATION_REQUIRED");
    expect(fx.updated).toHaveLength(0);
  });

  it("rejects confirmed recovery when the saved null-project draft already has BOQ evidence", async () => {
    fx.drafts.set(DRAFT_ID, {
      ...noBoqPayload(PROJECT_A),
      id: DRAFT_ID,
      boqProjectId: null,
      dprStatus: "draft",
      materials: [{ material: "CEMENT", boqItemId: 703 }],
    });

    const rejected = await request(app)
      .patch(`/api/dprs/${DRAFT_ID}/draft`)
      .send({
        ...noBoqPayload(PROJECT_B),
        boqProjectRecoveryConfirmed: true,
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("DPR_PROJECT_RECOVERY_CONFIRMATION_REQUIRED");
    expect(fx.updated).toHaveLength(0);
  });

  it("accepts a confirmed saved-null recovery together with a newly chosen target-project item", async () => {
    fx.drafts.set(DRAFT_ID, {
      ...noBoqPayload(PROJECT_A),
      id: DRAFT_ID,
      boqProjectId: null,
      dprStatus: "draft",
    });

    const recovered = await request(app)
      .patch(`/api/dprs/${DRAFT_ID}/draft`)
      .send({
        ...noBoqPayload(PROJECT_B),
        boqProjectRecoveryConfirmed: true,
        progress: [{ activity: "NEW TARGET-PROJECT WORK", boqItemId: 707 }],
      });

    expect(recovered.status).toBe(200);
    expect(fx.updated).toHaveLength(1);
    expect(fx.updated[0]).toMatchObject({
      boqProjectId: PROJECT_B,
      boqProjectRecoveryConfirmed: true,
      progress: [expect.objectContaining({ boqItemId: 707 })],
    });
  });

  it("B: submit allows a project mismatch only for a no-BOQ draft and preserves the saved project", async () => {
    const created = await request(app).post("/api/dprs").send(noBoqPayload(PROJECT_A));
    expect(created.status).toBe(201);

    const submitted = await request(app)
      .post(`/api/dprs/${created.body.id}/submit`)
      .send(noBoqPayload(PROJECT_B, false));

    expect(submitted.status).toBe(200);
    expect(fx.submitted).toHaveLength(1);
    expect(fx.submitted[0].boqProjectId).toBe(PROJECT_A);
    expect(submitted.body.boqProjectId).toBe(PROJECT_A);
  });

  it("C: submit still rejects mixed real BOQ refs, including no-site-work, legacy equipment, normalized segments, allocations, and labour", async () => {
    const created = await request(app).post("/api/dprs").send(noBoqPayload(PROJECT_A));
    expect(created.status).toBe(201);

    const mixed = {
      ...noBoqPayload(PROJECT_B, false),
      progress: [{
        activity: "NO SITE WORK WITH HISTORICAL BOQ LINK",
        noSiteWork: true,
        noSiteWorkDescription: "ACCESS BLOCKED",
        boqItemId: 701,
      }],
      equipment: [{
        machine: "JCB",
        boqItemId: 702,
        activityAllocations: [{
          boqItemId: 703,
          programmeBarId: null,
          startTime: "08:00",
          endTime: "09:00",
        }],
        activitySegments: [{
          startTime: "09:00",
          endTime: "10:00",
          boqItems: [{ boqItemId: 704, programmeBarId: null }],
        }],
      }],
      labour: [{ category: "Skilled", count: 2, boqItemId: 705 }],
    };

    const rejected = await request(app)
      .post(`/api/dprs/${created.body.id}/submit`)
      .send(mixed);

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("DPR_PROJECT_MISMATCH");
    expect(fx.submitted).toHaveLength(0);
  });

  it("C: PATCH also rejects a real labour/equipment BOQ reference", async () => {
    const created = await request(app).post("/api/dprs").send(noBoqPayload(PROJECT_A));
    expect(created.status).toBe(201);

    const rejected = await request(app)
      .patch(`/api/dprs/${created.body.id}/draft`)
      .send({
        ...noBoqPayload(PROJECT_B),
        equipment: [{ machine: "JCB", boqItemId: 707 }],
        labour: [{ category: "Skilled", count: 1, boqItemId: 708 }],
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("DPR_PROJECT_MISMATCH");
    expect(fx.updated).toHaveLength(0);
  });

  it("does not allow a PATCH to bypass the guard by omitting stored equipment child refs", async () => {
    const created = await request(app).post("/api/dprs").send(noBoqPayload(PROJECT_A));
    expect(created.status).toBe(201);
    const stored = fx.drafts.get(created.body.id);
    stored.equipment = [{
      id: 77,
      machine: "JCB",
      activitySegments: [{
        startTime: "08:00",
        endTime: "09:00",
        boqItems: [{ boqItemId: 706, programmeBarId: null }],
      }],
    }];

    const rejected = await request(app)
      .patch(`/api/dprs/${created.body.id}/draft`)
      .send({
        ...noBoqPayload(PROJECT_B),
        equipment: [{ persistedId: 77, machine: "JCB" }],
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("DPR_PROJECT_MISMATCH");
    expect(fx.updated).toHaveLength(0);
  });
});
