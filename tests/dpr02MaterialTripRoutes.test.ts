import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const spies = vi.hoisted(() => ({
  getPermitted: vi.fn(),
  getSites: vi.fn(),
  getProject: vi.fn(),
  getItem: vi.fn(),
  getArrangement: vi.fn(),
  getArrangementsForItem: vi.fn(),
  getTrip: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, any> = {
    getUserPermittedSiteIds: spies.getPermitted, getSites: spies.getSites,
    getBoqProject: spies.getProject, getBoqItem: spies.getItem,
    getEarthworkArrangementById: spies.getArrangement,
    getEarthworkArrangementsForItem: spies.getArrangementsForItem,
    getSiteMaterialTripById: spies.getTrip, createSiteMaterialTrip: spies.createTrip,
    updateSiteMaterialTrip: spies.updateTrip,
  };
  return { StockShortageError: class extends Error {}, storage: new Proxy(base, {
    get(target, key: string) { return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([])); },
  }) };
});
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn().mockResolvedValue(undefined), sendTestPush: vi.fn() }));
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

const body = { date: "2026-08-30", site: "Site A", material: "Soil", quantity: 10, uom: "Cum", transportType: "agency_vendor", boqProjectId: 1, boqItemId: 10 };
let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});
beforeEach(() => {
  vi.clearAllMocks();
  spies.getPermitted.mockResolvedValue([1]);
  spies.getSites.mockResolvedValue([{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }]);
  spies.getProject.mockResolvedValue({ id: 1, siteId: 1 });
  spies.getItem.mockResolvedValue({ id: 10, boqProjectId: 1 });
  spies.getArrangementsForItem.mockResolvedValue([]);
  spies.createTrip.mockImplementation(async (value) => ({ id: 99, ...value }));
  spies.updateTrip.mockImplementation(async (_id, value) => ({ id: 99, ...value }));
  spies.getTrip.mockResolvedValue({ id: 99, ...body, programmeBarId: 3, earthworkArrangementId: 4 });
});

describe("DPR-02 site-material-trip route enforcement", () => {
  it("rejects a direct create missing required BOQ linkage", async () => {
    const res = await request(app).post("/api/site-material-trips").send({ ...body, boqItemId: undefined });
    expect(res.status).toBe(400);
    expect(spies.createTrip).not.toHaveBeenCalled();
  });
  it("rejects a direct cut-fill external delivery bypass", async () => {
    spies.getArrangementsForItem.mockResolvedValue([{ id: 4, boqProjectId: 1, boqItemId: 10, status: "submitted", arrangementType: "reused_excavated" }]);
    const res = await request(app).post("/api/site-material-trips").send(body);
    expect(res.status).toBe(400);
    expect(spies.createTrip).not.toHaveBeenCalled();
  });
  it("rejects a project from another site on create", async () => {
    spies.getProject.mockResolvedValue({ id: 1, siteId: 2 });
    const res = await request(app).post("/api/site-material-trips").send(body);
    expect(res.status).toBe(400);
  });
  it("rejects PATCH of a target outside the caller site scope", async () => {
    spies.getTrip.mockResolvedValue({ id: 99, ...body, site: "Site B" });
    const res = await request(app).patch("/api/site-material-trips/99").send({ notes: "x" });
    expect(res.status).toBe(403);
    expect(spies.updateTrip).not.toHaveBeenCalled();
  });
  it("allows a valid same-site create", async () => {
    const res = await request(app).post("/api/site-material-trips").send(body);
    expect(res.status).toBe(201);
    expect(spies.createTrip).toHaveBeenCalledOnce();
  });
  it("allows an atomic same-site BOQ reclassification that clears stale bar and arrangement", async () => {
    spies.getItem.mockResolvedValue({ id: 11, boqProjectId: 1 });
    const res = await request(app).patch("/api/site-material-trips/99").send({
      boqProjectId: 1, boqItemId: 11, programmeBarId: null, earthworkArrangementId: null,
    });
    expect(res.status).toBe(200);
    expect(spies.updateTrip).toHaveBeenCalledWith(99, expect.objectContaining({
      boqProjectId: 1, boqItemId: 11, programmeBarId: null, earthworkArrangementId: null,
    }));
  });
});