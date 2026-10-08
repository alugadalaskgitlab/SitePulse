/**
 * The arrangement POST must forward the scope token captured before request
 * validation to the atomic storage write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import request from "supertest";

const fx = vi.hoisted(() => ({
  getProjectScopeVersionToken: vi.fn(),
  createEarthworkArrangement: vi.fn(),
  getDprs: vi.fn(),
  createNotification: vi.fn(),
  getEarthworkArrangementById: vi.fn(),
  updateEarthworkArrangement: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {
    getProjectScopeVersionToken: fx.getProjectScopeVersionToken,
    createEarthworkArrangement: fx.createEarthworkArrangement,
    getDprs: fx.getDprs,
    createNotification: fx.createNotification,
    getEarthworkArrangementById: fx.getEarthworkArrangementById,
    updateEarthworkArrangement: fx.updateEarthworkArrangement,
  };
  const storage = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
      return target[key];
    },
  });
  class GenericError extends Error {}
  return {
    storage,
    InitialScopeCorrectionBlockedError: GenericError,
    DprProjectMismatchError: GenericError,
    ScopeChangedDuringPlanningError: GenericError,
    StockShortageError: GenericError,
    EquipmentIncomingConflictError: GenericError,
    InsufficientPlantStockError: GenericError,
    InvalidDieselPhysicalStockError: GenericError,
    InvalidStockTransferQuantityError: GenericError,
    InvalidDieselSourceError: GenericError,
    DieselReceiptExceedsRemainingError: GenericError,
    CutFillInsufficientAvailabilityError: GenericError,
    CutFillValidationError: GenericError,
    AttachmentReferenceError: GenericError,
    assertValidDieselPhysicalStock: vi.fn(),
  };
});

const query = () => {
  const builder: any = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    groupBy: () => builder,
    limit: () => builder,
    for: () => builder,
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve([]).then(resolve, reject),
  };
  return builder;
};

vi.mock("../server/db", () => ({
  db: {
    select: vi.fn(() => query()),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })),
    transaction: vi.fn(),
  },
}));

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = { id: 17, fullName: "Scope Admin", role: "admin", isAdmin: true, isOwner: false };
    (req as any).authPermissions = {};
    next();
  },
  isPublicApiPath: vi.fn().mockReturnValue(false),
  isOptionalAuthPath: vi.fn().mockReturnValue(false),
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: () => true,
  assertEdit: () => true,
  assertView: () => true,
  assertViewEither: () => true,
  assertAuthed: () => true,
  assertCreate: () => true,
  assertCreateOrEdit: () => true,
  assertCreateEither: () => true,
  assertApprove: () => true,
  assertDeleteOrCancel: () => true,
  currentUserName: () => "Scope Admin",
}));

import { registerRoutes, setEarthworkSchemaReady } from "../server/routes";

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  fx.getProjectScopeVersionToken.mockResolvedValue("scope-token-77");
  fx.getDprs.mockResolvedValue([{ id: 1 }]);
  fx.getEarthworkArrangementById.mockResolvedValue({id:1201,boqProjectId:77,status:"draft",allocatedQty:10,boqItemId:900,tripRates:null});
  fx.updateEarthworkArrangement.mockImplementation(async (id,patch)=>({id,...patch}));
  fx.createEarthworkArrangement.mockResolvedValue({
    id: 1201,
    boqProjectId: 77,
    materialLabel: "Imported",
  });
  app = express();
  app.use(express.json());
  setEarthworkSchemaReady(true);
  await registerRoutes(createServer(), app);
});

describe("POST earthwork arrangement scope handoff", () => {
  const tripRates=[600,800,1000].map(quantity=>({quantity,uom:"CFT",rate:quantity*2}));
  it("passes three flat rates unchanged to storage, leaving agreedRate independent", async () => {
    const response=await request(app).post("/api/boq/projects/77/earthwork-arrangements")
      .send({materialLabel:"Imported earth",boqItemId:900,allocatedQty:10,agreedRate:7,tripRates});
    expect(response.status).toBe(201);
    expect(fx.createEarthworkArrangement).toHaveBeenCalledWith(expect.objectContaining({tripRates,agreedRate:7}),"scope-token-77");
  });
  it("supports rate-only draft edits, removal and clear without touching agreedRate", async () => {
    for(const rows of [tripRates,tripRates.slice(0,2),[]]){
      const response=await request(app).patch("/api/earthwork-arrangements/1201").send({tripRates:rows});
      expect(response.status).toBe(200);
      expect(response.body.tripRates).toEqual(rows.length?rows:null);
      const patch=fx.updateEarthworkArrangement.mock.lastCall![1];
      expect(patch).not.toHaveProperty("agreedRate");
    }
  });
  it.each([
    [tripRates[0],{...tripRates[0],uom:" cft "}],
    [{quantity:0,uom:"CFT",rate:1}],
    [{quantity:600,uom:"CFT",rate:-1}],
  ])("rejects invalid trip rates on POST and PATCH without a write", async (...rows) => {
    for(const method of ["post","patch"] as const){
      const response=await request(app)[method](method==="post"?"/api/boq/projects/77/earthwork-arrangements":"/api/earthwork-arrangements/1201")
        .send({tripRates:rows});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_TRIP_RATES");
      expect(response.body.message).toBeTruthy();
    }
    expect(fx.createEarthworkArrangement).not.toHaveBeenCalled();
    expect(fx.updateEarthworkArrangement).not.toHaveBeenCalled();
  });
  it("forwards the captured token to the atomic arrangement write", async () => {
    const response = await request(app)
      .post("/api/boq/projects/77/earthwork-arrangements")
      .send({
        materialLabel: "Imported earth",
        boqItemId: 900,
        allocatedQty: 10,
      });

    expect(response.status).toBe(201);
    expect(fx.getProjectScopeVersionToken).toHaveBeenCalledWith(77);
    expect(fx.createEarthworkArrangement).toHaveBeenCalledWith(
      expect.objectContaining({ boqProjectId: 77, boqItemId: 900 }),
      "scope-token-77",
    );
  });
});