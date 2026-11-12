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
  getTrips: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  bulkConfirmRoles: vi.fn(),
  previewSourceTransport: vi.fn(),
  applySourceTransport: vi.fn(),
  getMaterialReceipt: vi.fn(),
  markMaterialSlipShared: vi.fn(),
  markSiteTripSlipShared: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, any> = {
    getUserPermittedSiteIds: spies.getPermitted, getSites: spies.getSites,
    getBoqProject: spies.getProject, getBoqItem: spies.getItem,
    getEarthworkArrangementById: spies.getArrangement,
    getEarthworkArrangementsForItem: spies.getArrangementsForItem,
    getSiteMaterialTripById: spies.getTrip, createSiteMaterialTrip: spies.createTrip,
    getSiteMaterialTrips: spies.getTrips,
    updateSiteMaterialTrip: spies.updateTrip,
    bulkConfirmSiteMaterialTripRoles: spies.bulkConfirmRoles,
    getMaterialReceipt: spies.getMaterialReceipt,
    markMaterialReceiptSlipShared: spies.markMaterialSlipShared,
    markSiteMaterialTripSlipShared: spies.markSiteTripSlipShared,
  };
  return { StockShortageError: class extends Error {}, storage: new Proxy(base, {
    get(target, key: string) { return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([])); },
  }) };
});
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn().mockResolvedValue(undefined), sendTestPush: vi.fn() }));
vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as any).authUser = { id: 7, fullName: "Test User", isAdmin: false }; next(); },
  isPublicApiPath: () => false, isOptionalAuthPath: () => false, optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(), loadUserPermissionsMatrix: vi.fn(),
}));
vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(), assertCreate: () => true, assertEdit: () => true,
  assertAdmin: () => true, assertView: () => true, assertAuthed: () => true,
  assertCreateOrEdit: () => true, assertCreateEither: () => true, assertApprove: () => true,
  assertDeleteOrCancel: () => true, currentUserName: () => "tester",
}));
vi.mock("../server/siteMaterialTripSourceTransport", () => ({
  previewSiteMaterialTripSourceTransport: spies.previewSourceTransport,
  applySiteMaterialTripSourceTransport: spies.applySourceTransport,
}));

import { registerRoutes } from "../server/routes";
import { sendPushToSection } from "../server/push";

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
  spies.createTrip.mockImplementation(async (value) => ({ id: 99, ...value, createdAt: new Date("2026-08-30T12:00:00.000Z") }));
  spies.updateTrip.mockImplementation(async (_id, value) => ({ id: 99, ...value }));
  spies.bulkConfirmRoles.mockResolvedValue({ updatedCount: 2, role: "different_parties" });
  spies.previewSourceTransport.mockResolvedValue({ rows: [], excluded: [], sourcePlaceSuggestions: [], vendors: [] });
  spies.applySourceTransport.mockResolvedValue({ updatedCount: 1 });
  spies.getTrip.mockResolvedValue({ id: 99, ...body, programmeBarId: 3, earthworkArrangementId: 4 });
  spies.getMaterialReceipt.mockResolvedValue({ id: 77, createdAt: new Date("2026-11-01T10:00:00Z") });
  spies.markMaterialSlipShared.mockResolvedValue({ id: 77, slipSharedAt: new Date("2026-11-01T10:10:00Z") });
  spies.markSiteTripSlipShared.mockResolvedValue({ id: 99, slipSharedAt: new Date("2026-11-01T10:10:00Z") });
});

describe("DPR-02 site-material-trip route enforcement", () => {
  it("passes trip list filters through with existing site scope and ignores blank values", async () => {
    spies.getTrips.mockResolvedValue([]);
    expect((await request(app).get("/api/site-material-trips?vehicleNumber=%20ab-12%20&supplier=%20Carrier%20&onlyUnassigned=true")).status).toBe(200);
    expect(spies.getTrips).toHaveBeenLastCalledWith(expect.objectContaining({vehicleNumber:"ab-12",supplier:"Carrier",onlyUnassigned:true,permittedSiteNames:["Site A"]}));
    await request(app).get("/api/site-material-trips?vehicleNumber=%20&supplier=%20&onlyUnassigned=false");
    expect(spies.getTrips).toHaveBeenLastCalledWith(expect.objectContaining({vehicleNumber:undefined,supplier:undefined,onlyUnassigned:false}));
  });
  it("requires explicit unique trip IDs and forwards the bulk role with site scope", async () => {
    const res = await request(app)
      .post("/api/site-material-trips/roles/bulk-confirm")
      .send({ tripIds: [11, 12], role: "different_parties" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updatedCount: 2, role: "different_parties" });
    expect(spies.bulkConfirmRoles).toHaveBeenCalledWith({
      tripIds: [11, 12],
      role: "different_parties",
      permittedSiteNames: ["Site A"],
      actor: { userId: 7, userName: "tester", userRole: "manager" },
    });

    const duplicateIds = await request(app)
      .post("/api/site-material-trips/roles/bulk-confirm")
      .send({ tripIds: [11, 11], role: "different_parties" });
    expect(duplicateIds.status).toBe(400);
    expect(spies.bulkConfirmRoles).toHaveBeenCalledOnce();
  });
  it("previews selected source/transport roles read-only and carries site scope", async () => {
    const preview = { rows: [{ trip: { id: 11 }, fingerprint: "preview-v1" }], excluded: [], sourcePlaceSuggestions: ["Bodapally"], vendors: [] };
    spies.previewSourceTransport.mockResolvedValueOnce(preview);
    const res = await request(app)
      .post("/api/site-material-trips/source-transport/preview")
      .send({ tripIds: [11] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(preview);
    expect(spies.previewSourceTransport).toHaveBeenCalledWith([11], ["Site A"]);
    expect(spies.updateTrip).not.toHaveBeenCalled();
  });
  it("applies one bulk request, emits one notification, and never patches trips one by one", async () => {
    const res = await request(app)
      .post("/api/site-material-trips/source-transport/apply")
      .send({
        tripIds: [11],
        materialSource: { type: "own_source", label: "Bodapally borrow area" },
        transport: { type: "agency_vendor" },
        equipmentByTripId: { "11": 29 },
        reason: "Confirmed from supplier records",
        expectedFingerprints: { "11": "preview-v1" },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updatedCount: 1 });
    expect(spies.applySourceTransport).toHaveBeenCalledWith(expect.objectContaining({
      tripIds: [11],
      materialSource: { type: "own_source", label: "Bodapally borrow area" },
      transport: { type: "agency_vendor" },
      equipmentByTripId: { "11": 29 },
      expectedFingerprints: { "11": "preview-v1" },
      permittedSiteNames: ["Site A"],
      actor: { userId: 7, userName: "tester", userRole: "manager" },
    }));
    expect(sendPushToSection).toHaveBeenCalledTimes(1);
    expect(sendPushToSection).toHaveBeenCalledWith(
      "site_materials",
      "Material trip roles updated",
      "1 trips updated: source and transport",
      "/site/material-trips/review",
    );
    expect(spies.updateTrip).not.toHaveBeenCalled();
  });
  it("requires verify permission before assigning a Vendor Master material source", async () => {
    const res = await request(app)
      .post("/api/site-material-trips/source-transport/apply")
      .send({
        tripIds: [11],
        materialSource: { type: "vendor", vendorId: 9 },
        transport: { type: "agency_vendor" },
        equipmentByTripId: {},
        reason: "Source identity confirmed",
        expectedFingerprints: { "11": "preview-v1" },
      });
    expect(res.status).toBe(403);
    expect(spies.applySourceTransport).not.toHaveBeenCalled();
    expect(sendPushToSection).not.toHaveBeenCalled();
  });
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
  it("marks a visible site trip shared using the session user, ignoring request fields", async () => {
    const res = await request(app)
      .post("/api/site-material-trips/99/slip-shared")
      .send({ slipSharedByUserId: 999, slipSharedAt: "2000-01-01T00:00:00Z" });
    expect(res.status).toBe(200);
    expect(spies.markSiteTripSlipShared).toHaveBeenCalledWith(99, 7);
  });
  it("rejects slip sharing for a site trip outside the caller's site scope", async () => {
    spies.getTrip.mockResolvedValue({ id: 99, ...body, site: "Site B" });
    const res = await request(app).post("/api/site-material-trips/99/slip-shared");
    expect(res.status).toBe(403);
    expect(spies.markSiteTripSlipShared).not.toHaveBeenCalled();
  });
  it("marks a visible plant receipt shared using the session user, ignoring request fields", async () => {
    const res = await request(app)
      .post("/api/material-receipts/77/slip-shared")
      .send({ slipSharedByUserId: 999, slipSharedAt: "2000-01-01T00:00:00Z" });
    expect(res.status).toBe(200);
    expect(spies.markMaterialSlipShared).toHaveBeenCalledWith(77, 7);
  });
  it("allows a valid same-site create", async () => {
    const res = await request(app).post("/api/site-material-trips").send({
      ...body, enteredByUserId: 999, driverName: " Ravi ",
    });
    expect(res.status).toBe(201);
    expect(spies.createTrip).toHaveBeenCalledOnce();
    expect(spies.createTrip.mock.calls[0][0]).toMatchObject({
      enteredByUserId: 7,
      driverName: "Ravi",
    });
    expect(res.body.enteredByUserName).toBe("Test User");
    expect(res.body.latestEditAt).toBeNull();
  });
  it("allows an atomic same-site BOQ reclassification that clears stale bar and arrangement", async () => {
    spies.getItem.mockResolvedValue({ id: 11, boqProjectId: 1 });
    const res = await request(app).patch("/api/site-material-trips/99").send({
      boqProjectId: 1, boqItemId: 11, programmeBarId: null, earthworkArrangementId: null,
      enteredByUserId: 999,
    });
    expect(res.status).toBe(200);
    expect(spies.updateTrip).toHaveBeenCalledWith(99, expect.objectContaining({
      boqProjectId: 1, boqItemId: 11, programmeBarId: null, earthworkArrangementId: null,
    }), { userId: 7, userName: "tester", userRole: "manager" }, undefined);
    expect(spies.updateTrip.mock.calls[0][1]).not.toHaveProperty("enteredByUserId");
  });
});