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

const spies = vi.hoisted(() => ({
  getPermitted: vi.fn(),
  getSites: vi.fn(),
  getSuggestions: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, any> = {
    getUserPermittedSiteIds: spies.getPermitted,
    getSites: spies.getSites,
    getSiteMaterialTripSuggestions: spies.getSuggestions,
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
      (req as any).authUser = { id: 7, isAdmin: false, isOwner: false };
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
  assertEdit: () => true,
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
});