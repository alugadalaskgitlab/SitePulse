/**
 * Regression tests: DPR mutation endpoints (/version, /clone) must enforce
 * site-scope for restricted users.
 *
 * A restricted user whose permitted sites do NOT include the DPR's site must
 * receive 403 and the storage mutation (createVersionDpr / cloneDpr) must
 * never be called.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import { createServer } from "http";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted spies
// ---------------------------------------------------------------------------

const {
  getDprSpy,
  getUserPermittedSiteIdsSpy,
  getSitesSpy,
  createVersionDprSpy,
  cloneDprSpy,
} = vi.hoisted(() => ({
  getDprSpy: vi.fn(),
  getUserPermittedSiteIdsSpy: vi.fn(),
  getSitesSpy: vi.fn(),
  createVersionDprSpy: vi.fn(),
  cloneDprSpy: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, ReturnType<typeof vi.fn>> = {
    getDpr: getDprSpy,
    getUserPermittedSiteIds: getUserPermittedSiteIdsSpy,
    getSites: getSitesSpy,
    createVersionDpr: createVersionDprSpy,
    cloneDpr: cloneDprSpy,
  };
  const proxy = new Proxy(base, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  return {
    StockShortageError: class StockShortageError extends Error {
      constructor(msg: string) { super(msg); this.name = "StockShortageError"; }
    },
    storage: proxy,
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

// Inject a non-admin restricted user for all requests
vi.mock("../server/auth", () => ({
  requireAuth: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = { id: 42, name: "restricted-user", role: "engineer", isAdmin: false };
    next();
  }),
  isPublicApiPath: vi.fn().mockReturnValue(false),
  parseCookie: vi.fn(),
  signToken: vi.fn(),
  verifySignedToken: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  setDeviceCookie: vi.fn(),
  clearDeviceCookie: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
  setUserPermissions: vi.fn(),
  userHasPermission: vi.fn(),
  toSafeUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByPhone: vi.fn(),
  ensureBootstrapAdmin: vi.fn(),
  backfillSplitPermissions: vi.fn(),
  migrateEmailPhoneSchema: vi.fn(),
  backfillPlantSubPermissions: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: vi.fn().mockReturnValue(true),
  assertEdit: vi.fn().mockReturnValue(true),
  assertView: vi.fn().mockReturnValue(true),
  assertAuthed: vi.fn().mockReturnValue({ id: 42, name: "restricted-user", role: "engineer" }),
  assertCreate: vi.fn().mockReturnValue(true),
  currentUserName: vi.fn().mockReturnValue("restricted-user"),
  claimUnlockOrLockedRow: vi.fn().mockResolvedValue({ locked: false }),
  lockNewRow: vi.fn().mockResolvedValue(undefined),
  relockResource: vi.fn().mockResolvedValue(undefined),
  assertWritable: vi.fn().mockResolvedValue(true),
  LOCKABLE_TABLE_NAMES: {},
}));

import { registerRoutes } from "../server/routes";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A DPR belonging to "Site B" — outside the permitted set */
const DPR_OTHER_SITE = {
  id: 99,
  site: "Site B",
  date: "2025-01-01",
  equipment: [],
  isSuperseded: false,
};

/** The user is only allowed to access site ID 100 ("Site A") */
const PERMITTED_SITE_ID = 100;
const PERMITTED_SITE_NAME = "Site A";

const MINIMAL_VERSION_BODY = {
  data: { site: "Site B", date: "2025-01-01", equipment: [] },
};

let app: express.Express;

beforeAll(async () => {
  // Default mock behaviour: restricted to Site A only
  getUserPermittedSiteIdsSpy.mockResolvedValue([PERMITTED_SITE_ID]);
  getSitesSpy.mockResolvedValue([{ id: PERMITTED_SITE_ID, name: PERMITTED_SITE_NAME }]);
  getDprSpy.mockResolvedValue(DPR_OTHER_SITE);
  createVersionDprSpy.mockResolvedValue({ id: 200 });
  cloneDprSpy.mockResolvedValue({ id: 201, site: "Site B", date: "2025-01-01" });

  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DPR /version site-scope enforcement", () => {
  it("returns 403 when restricted user targets a DPR on a non-permitted site", async () => {
    const res = await request(app)
      .post("/api/dprs/99/version")
      .send(MINIMAL_VERSION_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(403);
    expect(createVersionDprSpy).not.toHaveBeenCalled();
  });

  it("does NOT call createVersionDpr when site check fails", async () => {
    createVersionDprSpy.mockClear();

    await request(app)
      .post("/api/dprs/99/version")
      .send(MINIMAL_VERSION_BODY)
      .set("Content-Type", "application/json");

    expect(createVersionDprSpy).not.toHaveBeenCalled();
  });
});

describe("DPR /clone site-scope enforcement", () => {
  it("returns 403 when restricted user targets a DPR on a non-permitted site", async () => {
    const res = await request(app)
      .post("/api/dprs/99/clone")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(403);
  });

  it("does NOT call cloneDpr when site check fails", async () => {
    cloneDprSpy.mockClear();

    await request(app)
      .post("/api/dprs/99/clone")
      .send({})
      .set("Content-Type", "application/json");

    expect(cloneDprSpy).not.toHaveBeenCalled();
  });
});
