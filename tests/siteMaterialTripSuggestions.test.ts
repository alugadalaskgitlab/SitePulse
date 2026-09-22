import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";
import {
  buildSiteTripSuggestions,
  normalizeSiteTripHistorySite,
  normalizeSiteTripSupplier,
  normalizeSiteTripVehicle,
  SITE_TRIP_HISTORY_SCAN_LIMIT,
  SITE_TRIP_SUGGESTION_LIMIT,
} from "../shared/siteTripHistory";
import { insertSiteMaterialTripSchema, vendorBillItems } from "../shared/schema";

const spies = vi.hoisted(() => ({
  getPermitted: vi.fn(),
  getSites: vi.fn(),
  getSuggestions: vi.fn(),
  hasActiveVehicle: vi.fn(),
  correctAssociation: vi.fn(),
  bulkAssignMaterialSource: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, any> = {
    getUserPermittedSiteIds: spies.getPermitted,
    getSites: spies.getSites,
    getSiteMaterialTripSuggestions: spies.getSuggestions,
    hasActiveSiteMaterialTripVehicle: spies.hasActiveVehicle,
    correctVehicleSupplierAssociation: spies.correctAssociation,
    bulkAssignSiteMaterialTripMaterialSource: spies.bulkAssignMaterialSource,
    logAudit: spies.logAudit,
  };
  return {
    StockShortageError: class extends Error {},
    storage: new Proxy(base, {
      get(target, key: string) {
        return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([]));
      },
    }),
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(),
  sendPushToAudience: vi.fn(),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn(),
}));

vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const mode = String(req.headers["x-test-auth"] || "view");
    if (mode === "none") {
      (req as any).authUser = undefined;
      (req as any).authPermissions = undefined;
    } else {
      (req as any).authUser = {
        id: 7,
        isAdmin: mode === "admin",
        isOwner: mode === "owner",
      };
      (req as any).authPermissions = mode === "create"
        ? { site_materials: { create: true } }
        : mode === "edit"
          ? { site_materials: { edit: true } }
          : mode === "other"
            ? { site_dprs: { view: true } }
            : { site_materials: { view: true } };
    }
    next();
  },
  isPublicApiPath: () => false,
  isOptionalAuthPath: () => false,
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertCreate: () => true,
  assertEdit: (req: Request, res: Response) => {
    if (!(req as any).authUser) {
      res.status(401).json({ message: "Authentication required" });
      return false;
    }
    const user = (req as any).authUser;
    if (user.isAdmin || user.isOwner || (req as any).authPermissions?.site_materials?.edit) return true;
    res.status(403).json({ message: "Forbidden" });
    return false;
  },
  assertAdmin: () => true,
  assertView: () => true,
  assertAuthed: () => true,
  assertCreateOrEdit: () => true,
  assertCreateEither: () => true,
  assertApprove: () => true,
  assertDeleteOrCancel: () => true,
  currentUserName: () => "tester",
}));

import { registerRoutes } from "../server/routes";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

describe("site trip history suggestion normalization", () => {
  it("accepts the nullable material-source field", () => {
    const trip = insertSiteMaterialTripSchema.parse({
      date: "2026-01-01",
      site: "SITE A",
      material: "SOIL",
      quantity: 600,
      uom: "CFT",
      materialSourceSupplier: "BORROW OWNER",
    });
    expect(trip.materialSourceSupplier).toBe("BORROW OWNER");
  });

  it("normalizes canonical site keys without changing site identity", () => {
    expect(normalizeSiteTripHistorySite("  site   a  ")).toBe("SITE A");
    expect(normalizeSiteTripHistorySite("Site A – Edited by Manager – 2026-01-01")).toBe("SITE A");
    expect(normalizeSiteTripHistorySite("Site A Extension")).not.toBe("SITE A");
  });

  it("normalizes suppliers and preserves the recent vehicle display shape", () => {
    expect(normalizeSiteTripSupplier("  Acme   Haulage ")).toBe("ACME HAULAGE");
    expect(normalizeSiteTripVehicle(" ka 01  ab - 1234 ")).toBe("KA 01 AB-1234");
  });

  it("deduplicates by normalized field and keeps the most recent casing/display", () => {
    expect(buildSiteTripSuggestions([
      { vehicleNumber: "ka01ab-1234", supplier: " Acme   Haulage " },
      { vehicleNumber: "KA 01 AB - 1234", supplier: "ACME HAULAGE" },
      { vehicleNumber: "TS 09 XX 1", supplier: "Other Supplier" },
      { vehicleNumber: "   ", supplier: null },
    ])).toEqual({
      vehicles: ["KA01AB-1234", "TS 09 XX 1"],
      suppliers: ["ACME HAULAGE", "OTHER SUPPLIER"],
      materialSourceSuppliers: [],
    });
  });

  it("keeps material-source suggestions independent from transporter suppliers", () => {
    expect(buildSiteTripSuggestions([
      { supplier: "Transport A", materialSourceSupplier: "Borrow Owner" },
      { supplier: "Transport B", materialSourceSupplier: " borrow   owner " },
      { supplier: "Borrow Owner", materialSourceSupplier: "Quarry B" },
    ])).toEqual({
      vehicles: [],
      suppliers: ["TRANSPORT A", "TRANSPORT B", "BORROW OWNER"],
      materialSourceSuppliers: ["BORROW OWNER", "QUARRY B"],
    });
  });

  it("caps each field independently at the contract limit", () => {
    const rows = Array.from({ length: SITE_TRIP_SUGGESTION_LIMIT + 5 }, (_, i) => ({
      vehicleNumber: `KA-${i}`,
      supplier: `Supplier ${i}`,
    }));
    const result = buildSiteTripSuggestions(rows);
    expect(result.vehicles).toHaveLength(SITE_TRIP_SUGGESTION_LIMIT);
    expect(result.suppliers).toHaveLength(SITE_TRIP_SUGGESTION_LIMIT);
  });
});

describe("site trip suggestion route authorization", () => {
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
    spies.getSuggestions.mockResolvedValue({ vehicles: ["KA 01 AB-1234"], suppliers: ["ACME HAULAGE"] });
    spies.hasActiveVehicle.mockResolvedValue(true);
    spies.correctAssociation.mockResolvedValue({
      status: "linked",
      supplier: "ACME HAULAGE",
      version: "next-version",
    });
    spies.bulkAssignMaterialSource.mockResolvedValue({ updatedCount: 2 });
    spies.logAudit.mockResolvedValue(undefined);
  });

  it("requires authentication and a site_materials view/create/edit grant", async () => {
    expect((await request(app)
      .get("/api/site-material-trips/suggestions?site=Site%20A")
      .set("x-test-auth", "none")).status).toBe(401);
    expect((await request(app)
      .get("/api/site-material-trips/suggestions?site=Site%20A")
      .set("x-test-auth", "other")).status).toBe(403);
    expect((await request(app)
      .get("/api/site-material-trips/suggestions?site=Site%20A")
      .set("x-test-auth", "create")).status).toBe(200);
    expect((await request(app)
      .get("/api/site-material-trips/suggestions?site=Site%20A")
      .set("x-test-auth", "edit")).status).toBe(200);
  });

  it("denies a non-permitted site and deny-all users before querying history", async () => {
    const denied = await request(app)
      .get("/api/site-material-trips/suggestions?site=Site%20B")
      .set("x-test-auth", "view");
    expect(denied.status).toBe(403);
    expect(spies.getSuggestions).not.toHaveBeenCalled();

    spies.getPermitted.mockResolvedValue([]);
    const denyAll = await request(app)
      .get("/api/site-material-trips/suggestions?site=Site%20A")
      .set("x-test-auth", "view");
    expect(denyAll.status).toBe(403);
    expect(spies.getSuggestions).not.toHaveBeenCalled();
  });

  it("normalizes the authorized site key and returns the agreed response shape", async () => {
    const response = await request(app)
      .get("/api/site-material-trips/suggestions?site=%20site%20%20a%20")
      .set("x-test-auth", "view");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      vehicles: ["KA 01 AB-1234"],
      suppliers: ["ACME HAULAGE"],
    });
    expect(spies.getSuggestions).toHaveBeenCalledWith("SITE A");
  });

  it("authorizes correction by authentication, permission, and permitted-site history", async () => {
    const body = {
      site: "Site A",
      vehicleNumber: "KA 01 AB-1234",
      supplier: "Acme Haulage",
      expectedVersion: null,
      expectedSupplier: null,
    };
    expect((await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "none")
      .send(body)).status).toBe(401);
    expect((await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "view")
      .send(body)).status).toBe(403);
    expect((await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "edit")
      .send({ ...body, expectedSupplier: undefined })).status).toBe(400);

    const deniedSite = await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "edit")
      .send({ ...body, site: "Site B" });
    expect(deniedSite.status).toBe(403);
    expect(spies.hasActiveVehicle).not.toHaveBeenCalled();

    spies.getPermitted.mockResolvedValue([]);
    const denyAll = await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "edit")
      .send(body);
    expect(denyAll.status).toBe(403);
    expect(spies.hasActiveVehicle).not.toHaveBeenCalled();
  });

  it("allows site-material editors and admins, but returns optimistic conflicts", async () => {
    const body = {
      site: "Site A",
      vehicleNumber: "KA 01 AB-1234",
      supplier: "Acme Haulage",
      expectedVersion: null,
      expectedSupplier: null,
    };
    const edited = await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "edit")
      .send(body);
    expect(edited.status).toBe(200);
    expect(spies.correctAssociation).toHaveBeenCalledWith(expect.objectContaining({
      site: "SITE A",
      expectedVersion: null,
      actor: expect.objectContaining({ userId: 7, userName: "tester" }),
    }));
    expect(spies.logAudit).not.toHaveBeenCalled();

    spies.correctAssociation.mockRejectedValueOnce(Object.assign(new Error("stale"), {
      code: "VEHICLE_SUPPLIER_ASSOCIATION_VERSION_CONFLICT",
      currentVersion: "newer-version",
    }));
    const conflict = await request(app)
      .patch("/api/site-material-trips/vehicle-supplier")
      .set("x-test-auth", "admin")
      .send({ ...body, expectedVersion: "stale-version" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.currentVersion).toBe("newer-version");
    expect(spies.logAudit).not.toHaveBeenCalled();
  });

  it("requires an explicit filter and edit/site scope for material-source bulk assignment", async () => {
    const unfiltered = await request(app)
      .post("/api/site-material-trips/material-source/bulk")
      .set("x-test-auth", "edit")
      .send({ materialSourceSupplier: "Borrow Owner" });
    expect(unfiltered.status).toBe(400);
    expect(spies.bulkAssignMaterialSource).not.toHaveBeenCalled();

    const denied = await request(app)
      .post("/api/site-material-trips/material-source/bulk")
      .set("x-test-auth", "edit")
      .send({ site: "Site B", onlyUnassigned: true, materialSourceSupplier: "Borrow Owner" });
    expect(denied.status).toBe(403);
    expect(spies.bulkAssignMaterialSource).not.toHaveBeenCalled();

    const assigned = await request(app)
      .post("/api/site-material-trips/material-source/bulk")
      .set("x-test-auth", "edit")
      .send({
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        material: "Soil",
        onlyUnassigned: true,
        materialSourceSupplier: "Borrow Owner",
      });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toEqual({ updatedCount: 2 });
    expect(spies.bulkAssignMaterialSource).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      material: "Soil",
      onlyUnassigned: true,
      materialSourceSupplier: "Borrow Owner",
      permittedSiteNames: ["Site A"],
      actor: expect.objectContaining({ userId: 7, userName: "tester" }),
    }));
  });
});

describe("site trip suggestion storage contract", () => {
  it("uses a bounded, active-row, exact normalized-site query", () => {
    const storage = read("server/storage.ts");
    const block = storage.slice(
      storage.indexOf("async getSiteMaterialTripSuggestions"),
      storage.indexOf("async createSiteMaterialTrip", storage.indexOf("async getSiteMaterialTripSuggestions")),
    );
    expect(block).toContain("eq(siteMaterialTrips.isCancelled, false)");
    expect(block).toContain("eq(siteMaterialTrips.isDeleted, false)");
    expect(block).toContain("regexp_replace(trim(${siteMaterialTrips.site})");
    expect(block).toContain(".limit(SITE_TRIP_HISTORY_SCAN_LIMIT)");
    expect(block).toContain("buildSiteTripSuggestions(rows)");
    expect(SITE_TRIP_HISTORY_SCAN_LIMIT).toBe(1000);
  });

  it("keeps source-vendor billing separately source-qualified and concurrency guarded", () => {
    const storage = read("server/storage.ts");
    expect(storage).toContain('sourceType: "site_material_trip_material"');
    expect(storage).toContain("vendorMatchSql(siteMaterialTrips.materialSourceSupplier)");
    expect(storage).toContain("assertSiteMaterialTripItemsAvailable");
    expect(storage).toContain("pg_advisory_xact_lock(1432, hashtext");
    expect(storage).toContain("inArray(vendorBillItems.source, sources)");
    expect(storage).toContain("materialSourceSupplier: siteMaterialTrips.materialSourceSupplier");

    const migration = read("migrations/0033_site_material_trip_material_source.sql");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS material_source_supplier text");
    expect(migration).not.toContain("vendor_bill_items");
    expect("sourceType" in vendorBillItems).toBe(false);
    expect("sourceId" in vendorBillItems).toBe(false);
  });
});