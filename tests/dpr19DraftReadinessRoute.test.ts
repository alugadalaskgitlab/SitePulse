import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const spies = vi.hoisted(() => ({
  getPermitted: vi.fn(), getSites: vi.fn(), getDprs: vi.fn(), select: vi.fn(),
}));
vi.mock("../server/storage", () => ({
  storage: new Proxy({
    getUserPermittedSiteIds: spies.getPermitted, getSites: spies.getSites,
    getDprsWithDetails: spies.getDprs,
  } as Record<string, any>, {
    get(target, key: string) { return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([])); },
  }),
}));
vi.mock("../server/db", () => ({ db: { select: spies.select } }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn(), sendTestPush: vi.fn() }));
vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as any).authUser = { id: 7, isAdmin: false }; next(); },
  isPublicApiPath: () => false, isOptionalAuthPath: () => false, optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(), loadUserPermissionsMatrix: vi.fn(),
}));
vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(), assertCreate: () => true, assertEdit: () => true,
  assertAdmin: () => true, assertView: () => true, assertAuthed: () => true,
  assertCreateOrEdit: () => true, assertCreateEither: () => true, assertApprove: () => true,
  assertDeleteOrCancel: () => true, currentUserName: () => "tester",
}));
import { registerRoutes } from "../server/routes";

let app: express.Express;
beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});
beforeEach(() => {
  vi.clearAllMocks();
  spies.getPermitted.mockResolvedValue([1]);
  spies.getSites.mockResolvedValue([{ id: 1, name: "Road Site" }, { id: 2, name: "Other Site" }]);
  spies.select.mockImplementation((columns: any) => {
    const chain: any = {
      from: () => chain, leftJoin: () => chain,
      where: async () => "unit" in columns
        ? [{ id: 11, boqProjectId: 4, description: "ROADWAY EXCAVATION", unit: "CUM", itemName: null, displayName: null, mappingStatus: null, snlShortLabel: null, snlMappedBy: null, snlMappingIsAuto: null, snlConfidence: null }]
        : [{ id: 4, siteName: "Road Site" }],
    };
    return chain;
  });
});
const draft = (id: number, site = "Road Site") => ({
  id, date: "2026-09-15", site, boqProjectId: 4, workType: "road", dprStatus: "draft",
  isCancelled: false, isDeleted: false, isSuperseded: false,
  progress: [{ boqItemId: 11, entryKey: `cut-${id}`, activity: "Excavation", quantity: 100 }],
  equipment: [], labour: [], materials: [], structureItems: [],
});

describe("DPR-19 with-details batch/read permissions", () => {
  it("computes only permitted active drafts and bounds BOQ queries regardless of draft count", async () => {
    for (const count of [1, 25]) {
      spies.select.mockClear();
      spies.getDprs.mockResolvedValue([
        ...Array.from({ length: count }, (_, index) => draft(index + 1)),
        draft(90, "Other Site"),
        { ...draft(91), dprStatus: "submitted" },
        { ...draft(92), isCancelled: true },
      ]);
      const response = await request(app).get("/api/dprs/with-details");
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(count + 2);
      expect(response.body.filter((row: any) => row.draftReadiness)).toHaveLength(count);
      expect(response.body.some((row: any) => row.id === 90)).toBe(false);
      expect(response.body.find((row: any) => row.id === 91).draftReadiness).toBeUndefined();
      expect(response.body.find((row: any) => row.id === 92).draftReadiness).toBeUndefined();
      expect(spies.select).toHaveBeenCalledTimes(2);
      expect(response.body[0].progress[0].boqItem).not.toHaveProperty("unit");
      expect(response.body[0].progress[0].boqItem).not.toHaveProperty("boqProjectId");
    }
  });
  it("does not load BOQ context or emit readiness for inaccessible drafts", async () => {
    spies.getPermitted.mockResolvedValue([]);
    spies.getDprs.mockResolvedValue([draft(90, "Other Site")]);
    const response = await request(app).get("/api/dprs/with-details");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(spies.select).not.toHaveBeenCalled();
  });
});