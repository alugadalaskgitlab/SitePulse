/**
 * Task #1419 — real-handler regression tests for Shape C (layer correction)
 * of PATCH /api/progress-entries/:id/overlap-resolution.
 *
 * All tests exercise the REAL registered Express handler (registerRoutes);
 * `storage` is mocked with controllable fixtures, auth is stubbed.
 *
 * Coverage:
 *  1  — layer-capable + site-authorised → calls updateProgressEntryLayer with
 *         correct id/layer only, logs audit, returns updated entry.
 *  2  — not-capable + null existing layer → 422, does not update or audit.
 *  3  — existing non-null layer (history) on non-capable item → allowed,
 *         calls updateProgressEntryLayer, logs audit.
 *  4  — invalid layerNo values (0, -1, 1.5, "2") → 400 before mutation.
 *  5  — site denial (restricted user, different site) → 403, no mutation.
 *  6  — no edit permission (assertEdit returns false) → 403, no mutation.
 *  7  — cancelled DPR → 409, no mutation.
 *  8  — deleted DPR → 409, no mutation.
 *  9  — superseded DPR → 409, no mutation.
 * 10  — layerNo mixed with another shape key → 400 (mutual exclusion).
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mutable fixture state — every test resets what it needs
// ---------------------------------------------------------------------------

const fx = {
  /** Whether assertEdit returns true (edit permission granted). */
  canEdit: true,
  /** Whether the requesting user is an admin (null = all sites, list = restricted). */
  isAdmin: true,
  /** Simulated permitted site IDs for non-admin users. */
  permittedSiteIds: [1] as number[],
  /** The entry returned by getProgressEntryWithDpr. null = entry not found. */
  entryRecord: null as null | {
    entry: any;
    dprId: number;
    dprSite: string;
    dprStatus: string;
    dprIsCancelled: boolean;
    dprIsDeleted: boolean;
    dprIsSuperseded: boolean;
  },
  /** The BOQ item returned by getBoqItem — controls capability check. */
  boqItem: null as null | { id: number; description: string; unit: string; workCategory?: string | null; layerConfig?: any },
  /** The row returned by updateProgressEntryLayer — falsy = entry not found. */
  updatedEntry: null as null | Record<string, unknown>,
};

const calls = {
  updateLayer: [] as Array<{ id: number; layerNo: number }>,
  audits: [] as any[],
};

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: vi.fn(() => true),
  assertEdit: vi.fn((_req: any, res: any, _perm: string) => {
    if (!fx.canEdit) {
      res.status(403).json({ message: "Edit permission denied" });
      return false;
    }
    return true;
  }),
  assertView: vi.fn(() => true),
  assertAuthed: vi.fn(() => ({ id: 1, name: "test-admin" })),
  assertCreate: vi.fn(() => true),
  currentUserName: vi.fn(() => "test-admin"),
  claimUnlockOrLockedRow: vi.fn().mockResolvedValue({ locked: false }),
  lockNewRow: vi.fn().mockResolvedValue(undefined),
  relockResource: vi.fn().mockResolvedValue(undefined),
  assertWritable: vi.fn().mockResolvedValue(true),
  LOCKABLE_TABLE_NAMES: {},
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = {
      id: 7,
      username: "test-admin",
      isAdmin: fx.isAdmin,
      isOwner: false,
      isActive: true,
    };
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

  // Prevent the background seedDatabase() from racing with tests.
  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  methods.createNotification = vi.fn(async () => ({}));

  // Site-access support.
  methods.getUserPermittedSiteIds = vi.fn(async () => fx.permittedSiteIds);
  methods.getSites = vi.fn(async () => [
    { id: 1, name: "Site A" },
    { id: 2, name: "Site B" },
  ]);

  // Entry + DPR header.
  methods.getProgressEntryWithDpr = vi.fn(async () => fx.entryRecord ?? undefined);

  // BOQ item capability lookup.
  methods.getBoqItem = vi.fn(async () => fx.boqItem);

  // Layer update — records args, returns fx.updatedEntry.
  methods.updateProgressEntryLayer = vi.fn(async (id: number, layerNo: number) => {
    calls.updateLayer.push({ id, layerNo });
    return fx.updatedEntry ?? undefined;
  });

  // Classification update (Shapes A/B — should never be called in layer tests).
  methods.updateProgressEntryClassification = vi.fn(async () => undefined);

  // Audit logging.
  methods.logAudit = vi.fn(async (entry: any) => {
    calls.audits.push(entry);
  });

  return {
    StockShortageError: class StockShortageError extends Error {},
    storage: storageProxy,
  };
});

// ---------------------------------------------------------------------------
// App setup — registers the real routes once
// ---------------------------------------------------------------------------

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

let agent: request.SuperTest<request.Test>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  agent = request(app) as any;
});

beforeEach(() => {
  // Reset call records between every test.
  calls.updateLayer = [];
  calls.audits = [];

  // Default: full-admin, edit permitted, layer-capable item, active DPR on Site A.
  fx.canEdit = true;
  fx.isAdmin = true;
  fx.permittedSiteIds = [1];

  fx.entryRecord = {
    entry: { id: 501, boqItemId: 10, layerNo: null, dprId: 99, isIncidental: false, incidentalDescription: null, chainageOverrideReason: null },
    dprId: 99,
    dprSite: "Site A",
    dprStatus: "submitted",
    dprIsCancelled: false,
    dprIsDeleted: false,
    dprIsSuperseded: false,
  };

  // WMM — definitively layer-capable via description.
  fx.boqItem = { id: 10, description: "Wet Mix Macadam (WMM)", unit: "Cum" };

  // Default successful update result.
  fx.updatedEntry = { id: 501, boqItemId: 10, layerNo: 2, dprId: 99, isIncidental: false };

  // Reset storage spies (vi.clearAllMocks clears call counts but not return values).
  (storage.updateProgressEntryLayer as any).mockClear();
  (storage.updateProgressEntryClassification as any).mockClear();
  (storage.logAudit as any).mockClear();
});

// ---------------------------------------------------------------------------
// 1. Layer-capable + site-authorised → calls updateProgressEntryLayer only
// ---------------------------------------------------------------------------

describe("1: allowed layer-capable correction", () => {
  it("returns 200, calls updateProgressEntryLayer with correct id and layer", async () => {
    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(200);
    expect(calls.updateLayer).toHaveLength(1);
    expect(calls.updateLayer[0]).toEqual({ id: 501, layerNo: 2 });
    // Must NOT call classification update.
    expect((storage.updateProgressEntryClassification as any).mock.calls).toHaveLength(0);
  });

  it("response body is the entry returned by updateProgressEntryLayer", async () => {
    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.body.layerNo).toBe(2);
    expect(res.body.id).toBe(501);
  });

  it("logs audit with action=overlap_resolution, correct old/new layerNo", async () => {
    // Entry has layerNo: null → old value should be null.
    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 3 });

    expect(res.status).toBe(200);
    expect(calls.audits).toHaveLength(1);
    const audit = calls.audits[0];
    expect(audit.action).toBe("overlap_resolution");
    expect(audit.module).toBe("progress_entries");
    expect(audit.transactionId).toBe(501);
    expect(audit.oldValues.layerNo).toBeNull();
    expect(audit.newValues.layerNo).toBe(2); // from fx.updatedEntry.layerNo
  });

  it("correcting an existing layer (layerNo already 2 → set to 4) is also allowed", async () => {
    // Entry already has a layer — this is still layer-capable WMM.
    fx.entryRecord!.entry.layerNo = 2;
    fx.updatedEntry = { ...fx.updatedEntry!, layerNo: 4 };

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 4 });

    expect(res.status).toBe(200);
    expect(calls.updateLayer[0]).toEqual({ id: 501, layerNo: 4 });
    expect(calls.audits[0].oldValues.layerNo).toBe(2);
    expect(calls.audits[0].newValues.layerNo).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 2. Non-capable item + null existing layer → 422, no mutation
// ---------------------------------------------------------------------------

describe("2: non-capable item with null existing layer rejected", () => {
  it("returns 422 when item is non-layer-capable and entry has no prior layerNo", async () => {
    // Reinforcement steel — definitively not layer-capable.
    fx.boqItem = { id: 10, description: "Reinforcement steel HYSD bars", unit: "MT" };
    fx.entryRecord!.entry.layerNo = null;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 1 });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/not layer-capable/);
    expect(calls.updateLayer).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });

  it("null BOQ item with null existing layer also rejected (no item, no prior layer)", async () => {
    fx.boqItem = null;
    fx.entryRecord!.entry.layerNo = null;
    fx.entryRecord!.entry.boqItemId = null;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 1 });

    expect(res.status).toBe(422);
    expect(calls.updateLayer).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Non-capable item BUT existing non-null layer → historical correction allowed
// ---------------------------------------------------------------------------

describe("3: existing non-null layer allows correction despite non-capable metadata", () => {
  it("allows correction when entry already has a layerNo even if BOQ item is not capable", async () => {
    // Concrete item — not layer-capable by description.
    fx.boqItem = { id: 10, description: "PCC M15 footing concrete", unit: "Cum" };
    // Entry has a historical layerNo → correction permitted.
    fx.entryRecord!.entry.layerNo = 1;
    fx.updatedEntry = { ...fx.updatedEntry!, layerNo: 2 };

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(200);
    expect(calls.updateLayer).toHaveLength(1);
    expect(calls.updateLayer[0]).toEqual({ id: 501, layerNo: 2 });
    expect(calls.audits).toHaveLength(1);
    // Old layer preserved in audit.
    expect(calls.audits[0].oldValues.layerNo).toBe(1);
  });

  it("null BOQ item but existing layerNo → historical correction allowed", async () => {
    fx.boqItem = null;
    fx.entryRecord!.entry.layerNo = 3;
    fx.updatedEntry = { ...fx.updatedEntry!, layerNo: 5 };

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 5 });

    expect(res.status).toBe(200);
    expect(calls.updateLayer[0].layerNo).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 4. Invalid layerNo → 400 before any mutation
// ---------------------------------------------------------------------------

describe("4: invalid layerNo values rejected before mutation", () => {
  const invalids = [
    { body: { layerNo: 0 }, desc: "zero" },
    { body: { layerNo: -1 }, desc: "negative" },
    { body: { layerNo: 1.5 }, desc: "non-integer float" },
    { body: { layerNo: "2" }, desc: "string value" },
    { body: { layerNo: null }, desc: "null" },
  ];

  for (const { body, desc } of invalids) {
    it(`${desc} is rejected with 400`, async () => {
      const res = await agent
        .patch("/api/progress-entries/501/overlap-resolution")
        .send(body);

      expect(res.status).toBe(400);
      expect(calls.updateLayer).toHaveLength(0);
      expect(calls.audits).toHaveLength(0);
    });
  }

  it("layerNo combined with isIncidental → 400 mutual-exclusion", async () => {
    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2, isIncidental: true, incidentalDescription: "x" });

    expect(res.status).toBe(400);
    expect(calls.updateLayer).toHaveLength(0);
  });

  it("layerNo combined with chainageOverrideReason → 400 mutual-exclusion", async () => {
    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2, chainageOverrideReason: "some reason" });

    expect(res.status).toBe(400);
    expect(calls.updateLayer).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Site denial — restricted user on a different site
// ---------------------------------------------------------------------------

describe("5: site-scope denial", () => {
  it("returns 403 when restricted user targets entry on a non-permitted site", async () => {
    fx.isAdmin = false;
    fx.permittedSiteIds = [1]; // Only Site A (id=1)
    fx.entryRecord!.dprSite = "Site B"; // Entry is on Site B

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(403);
    expect(calls.updateLayer).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });

  it("does not call updateProgressEntryLayer on site denial", async () => {
    fx.isAdmin = false;
    fx.permittedSiteIds = [2]; // Site B only
    fx.entryRecord!.dprSite = "Site A"; // Entry on Site A

    await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(storage.updateProgressEntryLayer as any).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. No edit permission
// ---------------------------------------------------------------------------

describe("6: edit permission denied", () => {
  it("returns 403 when assertEdit denies the request", async () => {
    fx.canEdit = false;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(403);
    expect(calls.updateLayer).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. DPR state guards — cancelled / deleted / superseded
// ---------------------------------------------------------------------------

describe("7/8/9: DPR state guards", () => {
  it("returns 409 when DPR is cancelled", async () => {
    fx.entryRecord!.dprIsCancelled = true;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(409);
    expect(calls.updateLayer).toHaveLength(0);
  });

  it("returns 409 when DPR is deleted", async () => {
    fx.entryRecord!.dprIsDeleted = true;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(409);
    expect(calls.updateLayer).toHaveLength(0);
  });

  it("returns 409 when DPR is superseded", async () => {
    fx.entryRecord!.dprIsSuperseded = true;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(409);
    expect(calls.updateLayer).toHaveLength(0);
  });

  it("does not call audit on any DPR-state rejection", async () => {
    fx.entryRecord!.dprIsCancelled = true;
    await agent.patch("/api/progress-entries/501/overlap-resolution").send({ layerNo: 2 });
    expect(calls.audits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Entry not found
// ---------------------------------------------------------------------------

describe("10: entry not found", () => {
  it("returns 404 when getProgressEntryWithDpr returns undefined", async () => {
    fx.entryRecord = null;

    const res = await agent
      .patch("/api/progress-entries/501/overlap-resolution")
      .send({ layerNo: 2 });

    expect(res.status).toBe(404);
    expect(calls.updateLayer).toHaveLength(0);
  });
});
