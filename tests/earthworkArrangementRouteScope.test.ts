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
}));

vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {
    getProjectScopeVersionToken: fx.getProjectScopeVersionToken,
    createEarthworkArrangement: fx.createEarthworkArrangement,
    getDprs: fx.getDprs,
    createNotification: fx.createNotification,
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