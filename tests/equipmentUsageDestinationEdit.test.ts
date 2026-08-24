/**
 * Equipment Usage — legacy free-text destination edit fix.
 *
 * Bug: PUT /api/plant-module/equipment-usage/:id validated the OLD persisted
 * destinationSite against active Site Master BEFORE honouring the user's newly
 * selected registered destination. Legacy records whose destination was stored
 * as free text (pre-dropdown, e.g. "THAKKADPALLY") could therefore never be
 * corrected.
 *
 * Fix under test (canonicaliseEquipmentDestinationSite in server/routes.ts):
 *  - When the persisted destination resolves to exactly ONE active registered
 *    site, behaviour is unchanged (owner-site authorization still enforced).
 *  - When it does NOT resolve AND the request explicitly supplies a new
 *    destination, the correction is allowed; the NEW destination is still
 *    validated against active Site Master and permission-checked.
 *  - When it does not resolve and NO replacement is supplied → clear 400
 *    asking the user to select a registered Destination Site.
 *  - No fuzzy matching, no auto-guessing, and edits stay PUT on the SAME id
 *    (createEquipmentUsage is never called from the update path).
 *
 * All tests exercise the REAL registered Express handlers (registerRoutes);
 * `storage` is mocked with controllable fixtures, auth is stubbed.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mutable fixture state
// ---------------------------------------------------------------------------

const fx = {
  canEdit: true,
  canCreate: true,
  isAdmin: true,
  permittedSiteIds: [1] as number[],
  /** Registered Site Master rows. */
  sites: [] as Array<{ id: number; name: string; isActive: number }>,
  /** The equipment_usage row returned by getEquipmentUsageById. */
  existing: null as null | Record<string, any>,
  /** Open usage rows for the open-today discovery test. */
  openUsage: [] as Array<Record<string, any>>,
};

const calls = {
  updates: [] as Array<{ id: number; input: Record<string, any> }>,
  creates: [] as Array<Record<string, any>>,
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
  assertCreate: vi.fn((_req: any, res: any, _perm: string) => {
    if (!fx.canCreate) {
      res.status(403).json({ message: "Create permission denied" });
      return false;
    }
    return true;
  }),
  assertView: vi.fn(() => true),
  assertAuthed: vi.fn(() => ({ id: 1, name: "test-admin" })),
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
      username: "test-user",
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

  methods.getSites = vi.fn(async () => fx.sites);
  methods.getUserPermittedSiteIds = vi.fn(async () => fx.permittedSiteIds);

  methods.getEquipmentUsageById = vi.fn(async () => fx.existing ?? undefined);
  methods.updateEquipmentUsage = vi.fn(async (id: number, input: Record<string, any>) => {
    calls.updates.push({ id, input });
    if (!fx.existing) return undefined;
    return { ...fx.existing, ...input, id };
  });
  methods.createEquipmentUsage = vi.fn(async (input: Record<string, any>) => {
    calls.creates.push(input);
    return { id: 9001, ...input };
  });
  methods.getOpenEquipmentUsageForDate = vi.fn(async () => fx.openUsage);

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
  calls.updates = [];
  calls.creates = [];

  fx.canEdit = true;
  fx.canCreate = true;
  fx.isAdmin = true;
  fx.permittedSiteIds = [1];

  fx.sites = [
    { id: 1, name: "Takkadpally-sirur", isActive: 1 },
    { id: 2, name: "Site B", isActive: 1 },
  ];

  // Legacy record: free-text destination saved before the dropdown existed.
  fx.existing = {
    id: 301,
    equipmentId: 42,
    equipmentName: "JCB-3DX",
    date: "2026-08-23",
    openingReading: 1200,
    dieselIssued: 20,
    dieselIncluded: false,
    dieselSource: "direct_purchase",
    destinationSite: "THAKKADPALLY",
    status: "open",
  };

  fx.openUsage = [];

  (storage.updateEquipmentUsage as any).mockClear();
  (storage.createEquipmentUsage as any).mockClear();
});

// ---------------------------------------------------------------------------
// A. Legacy destination + explicit valid replacement → PUT succeeds, same id
// ---------------------------------------------------------------------------

describe("A: legacy free-text destination corrected via explicit new selection", () => {
  it('legacy "THAKKADPALLY" + selected "Takkadpally-sirur" → 200, same id, canonical value saved', async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally-sirur", operator: "Ramesh" });

    expect(res.status).toBe(200);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].id).toBe(301);
    expect(calls.updates[0].input.destinationSite).toBe("Takkadpally-sirur");
    expect(res.body.id).toBe(301);
  });

  it("canonicalises case: selecting 'takkadpally-SIRUR' saves the Site Master casing", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "takkadpally-SIRUR" });

    expect(res.status).toBe(200);
    expect(calls.updates[0].input.destinationSite).toBe("Takkadpally-sirur");
  });

  it("no fuzzy matching: replacement that matches no registered site exactly → 400", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally" }); // partial — must NOT auto-resolve

    expect(res.status).toBe(400);
    expect(calls.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B. Legacy invalid destination + no replacement → clear validation error
// ---------------------------------------------------------------------------

describe("B: unresolvable legacy destination without replacement is a clear error", () => {
  it("PUT without destinationSite in body → 400 asking to select a registered site", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ closingReading: 1250 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/registered/i);
    expect(res.body.message).toMatch(/Select a registered Destination Site/i);
    expect(calls.updates).toHaveLength(0);
  });

  it("PUT re-sending the same unresolvable legacy value → 400, no update", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "THAKKADPALLY" });

    expect(res.status).toBe(400);
    expect(calls.updates).toHaveLength(0);
  });

  it("explicitly clearing the destination of a dispatched record → 400", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot be cleared/i);
    expect(calls.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C. New valid dispatch (create) works normally
// ---------------------------------------------------------------------------

describe("C: create path unchanged", () => {
  it("POST with a registered destination → 201 and canonical value", async () => {
    const res = await agent
      .post("/api/plant-module/equipment-usage")
      .send({ equipmentId: 42, date: "2026-08-23", openingReading: 100, destinationSite: "site b" });

    expect(res.status).toBe(201);
    expect(calls.creates).toHaveLength(1);
    expect(calls.creates[0].destinationSite).toBe("Site B");
  });

  it("POST with an unregistered destination → 400", async () => {
    const res = await agent
      .post("/api/plant-module/equipment-usage")
      .send({ equipmentId: 42, date: "2026-08-23", destinationSite: "Nowhere" });

    expect(res.status).toBe(400);
    expect(calls.creates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D. Site-scoped discovery — Site A dispatch never appears in Site B DPR
// ---------------------------------------------------------------------------

describe("D: open-today discovery stays destination-site scoped", () => {
  it("only records dispatched to the queried site are returned", async () => {
    fx.openUsage = [
      { id: 1, equipmentId: 42, destinationSite: "Takkadpally-sirur" },
      { id: 2, equipmentId: 43, destinationSite: "Site B" },
      { id: 3, equipmentId: 44, destinationSite: null }, // plant-internal
    ];

    const resA = await agent.get(
      "/api/plant-module/equipment-usage/open-today?date=2026-08-23&site=Takkadpally-sirur",
    );
    expect(resA.status).toBe(200);
    expect(resA.body.map((u: any) => u.id)).toEqual([1]);

    const resB = await agent.get(
      "/api/plant-module/equipment-usage/open-today?date=2026-08-23&site=Site B",
    );
    expect(resB.status).toBe(200);
    expect(resB.body.map((u: any) => u.id)).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// E. Never creates a duplicate record from the update path
// ---------------------------------------------------------------------------

describe("E: PUT never creates a second equipment_usage", () => {
  it("successful legacy correction does not call createEquipmentUsage", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally-sirur" });

    expect(res.status).toBe(200);
    expect(calls.creates).toHaveLength(0);
    expect((storage.createEquipmentUsage as any).mock.calls).toHaveLength(0);
  });

  it("404 when the record does not exist — never falls back to create", async () => {
    fx.existing = null;
    const res = await agent
      .put("/api/plant-module/equipment-usage/999")
      .send({ destinationSite: "Site B" });

    expect(res.status).toBe(404);
    expect(calls.creates).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 06X-HF4. Destination and diesel source change together on one PUT
// ---------------------------------------------------------------------------

describe("06X-HF4: combined destination-site and diesel-source update", () => {
  it("returns 200, keeps the same id, and saves both changes without creating a duplicate", async () => {
    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({
        destinationSite: "Site B",
        dieselSource: "plant_stock",
        dieselIncluded: false,
        dieselIssued: 20,
      });

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(500);
    expect(res.body).toMatchObject({
      id: 301,
      destinationSite: "Site B",
      dieselSource: "plant_stock",
      dieselIssued: 20,
    });
    expect(calls.updates).toEqual([
      {
        id: 301,
        input: expect.objectContaining({
          destinationSite: "Site B",
          dieselSource: "plant_stock",
          dieselIssued: 20,
        }),
      },
    ]);
    expect(calls.creates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Security regressions — resolvable-owner path unchanged
// ---------------------------------------------------------------------------

describe("security: normal authorization preserved", () => {
  it("resolvable existing owner still blocks restricted users without access (403)", async () => {
    fx.isAdmin = false;
    fx.permittedSiteIds = [2]; // Site B only
    fx.existing!.destinationSite = "Takkadpally-sirur"; // resolvable owner (site 1)

    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Site B" });

    expect(res.status).toBe(403);
    expect(calls.updates).toHaveLength(0);
  });

  it("legacy unresolvable owner: replacement site must still be permitted (403 otherwise)", async () => {
    fx.isAdmin = false;
    fx.permittedSiteIds = [2]; // Site B only — NOT Takkadpally-sirur

    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally-sirur" });

    expect(res.status).toBe(403);
    expect(calls.updates).toHaveLength(0);
  });

  it("legacy unresolvable owner: permitted replacement by restricted user succeeds", async () => {
    fx.isAdmin = false;
    fx.permittedSiteIds = [1]; // Takkadpally-sirur permitted

    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally-sirur" });

    expect(res.status).toBe(200);
    expect(calls.updates[0].input.destinationSite).toBe("Takkadpally-sirur");
  });

  it("edit permission denied → 403 before any destination logic", async () => {
    fx.canEdit = false;

    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally-sirur" });

    expect(res.status).toBe(403);
    expect(calls.updates).toHaveLength(0);
  });

  it("inactive registered site is not a valid replacement (400)", async () => {
    fx.sites = [
      { id: 1, name: "Takkadpally-sirur", isActive: 0 }, // deactivated
      { id: 2, name: "Site B", isActive: 1 },
    ];

    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ destinationSite: "Takkadpally-sirur" });

    expect(res.status).toBe(400);
    expect(calls.updates).toHaveLength(0);
  });

  it("plant-internal record (no destination, none supplied) updates normally", async () => {
    fx.existing!.destinationSite = null;

    const res = await agent
      .put("/api/plant-module/equipment-usage/301")
      .send({ closingReading: 1250 });

    expect(res.status).toBe(200);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].input.destinationSite).toBeUndefined();
  });
});
