import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import request from "supertest";

const state = vi.hoisted(() => ({
  order: null as any,
  queued: [] as any[],
  user: { id: 1, fullName: "Test Owner", isOwner: true, isAdmin: true, isActive: true },
}));

vi.mock("../server/auth", () => {
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = state.user;
    req.authPermissions = {};
    req.authFeatureAccess = { rolesConfigured: false };
    next();
  };
  return {
    requireAuth: inject,
    optionalAuth: inject,
    requireAdmin: inject,
    isPublicApiPath: () => false,
    isOptionalAuthPath: () => false,
    lookupSessionFromCookie: async () => null,
    loadUserPermissionsMatrix: async () => ({}),
  };
});

vi.mock("../server/db", () => ({
  db: { select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })) },
  pool: { connect: vi.fn(), query: vi.fn() },
}));

vi.mock("../server/storage", () => {
  const storage = new Proxy({} as Record<string, any>, {
    get(target, key: string) {
      if (!(key in target)) target[key] = async () => [];
      return target[key];
    },
  });
  return {
    storage,
    StockShortageError: class extends Error {},
    EquipmentIncomingConflictError: class extends Error {},
    InsufficientPlantStockError: class extends Error {},
    InvalidDieselPhysicalStockError: class extends Error {},
    InvalidStockTransferQuantityError: class extends Error {},
    InvalidDieselSourceError: class extends Error {},
    DieselReceiptExceedsRemainingError: class extends Error {},
    InvalidLinkedDieselRequirementError: class extends Error {},
    CutFillInsufficientAvailabilityError: class extends Error {},
    CutFillValidationError: class extends Error {},
    AttachmentReferenceError: class extends Error {},
    InitialScopeCorrectionBlockedError: class extends Error {},
    ScopeChangedDuringPlanningError: class extends Error {},
    DprProjectMismatchError: class extends Error {},
    PushSubscriptionOwnershipError: class extends Error {},
    PurchaseIndentRouteCorrectionConflictError: class extends Error {},
    assertValidDieselPhysicalStock: () => {},
    isRecipeManualOverrideError: () => false,
  };
});

vi.mock("../server/plantSupplyOrderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/plantSupplyOrderService")>();
  return {
    ...actual,
    createPlantSupplyOrder: vi.fn(async (input: any) => {
      state.order = { ...input, id: 91, orderNo: input.orderNo ?? "PO-91", status: "open", partyName: "North party", siteName: "Test road" };
      return state.order;
    }),
    getPlantSupplyOrder: vi.fn(async () => state.order),
    editPlantSupplyOrder: vi.fn(async (_id: number, input: any) => {
      state.order = { ...state.order, ...input };
      return state.order;
    }),
    changeSupplyOrderMix: vi.fn(async () => ({ order: state.order, versionId: 12 })),
    setSupplyOrderStatus: vi.fn(async (_id: number, status: string) => {
      state.order = { ...state.order, status };
      return state.order;
    }),
    hasSupplyRole: vi.fn(async () => false),
  };
});

vi.mock("../server/dispatchProOutbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/dispatchProOutbox")>();
  return {
    ...actual,
    enqueueSupplyOrderDispatchPro: vi.fn(async (order: any) => {
      state.queued.push({
        id: order.id,
        status: order.status,
        orderNo: order.orderNo,
        lines: order.lines,
      });
      return { queued: true };
    }),
  };
});

import { registerRoutes } from "../server/routes";

describe("SP-DP-LINK-01 supply order routes", () => {
  let app: express.Express;
  let server: Server;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    server = createServer(app);
    await registerRoutes(server, app);
  }, 60_000);

  beforeEach(() => {
    state.order = null;
    state.queued.length = 0;
    state.user = { id: 1, fullName: "Test Owner", isOwner: true, isAdmin: true, isActive: true };
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server?.close(() => resolve()));
  });

  it("queues order creation, edits and close/reopen status snapshots", async () => {
    const created = await request(app).post("/api/plant-module/supply-orders").send({
      partyId: 7,
      siteId: 18,
      orderNo: "PO-91",
      periodFrom: "2026-11-01",
      periodTo: "2026-11-30",
      lines: [{ mixTemplateId: 4, orderedMt: 100, plannedMtPerDay: 10 }],
    });
    expect(created.status).toBe(201);
    expect(state.queued.at(-1)).toMatchObject({ status: "open", orderNo: "PO-91" });

    const edited = await request(app).patch("/api/plant-module/supply-orders/91").send({
      orderNo: "PO-91",
      periodFrom: "2026-11-01",
      periodTo: "2026-12-15",
      workName: null,
      division: null,
      mandal: null,
      district: null,
      agreementEstimateRef: null,
      estimateSorYear: null,
      mtPerCumFactor: 2.3,
      remarks: null,
      lines: [{ mixTemplateId: 4, enteredQuantity: 120, enteredUnit: "MT", plannedMtPerDay: 12 }],
    });
    expect(edited.status).toBe(200);
    expect(state.queued.at(-1)).toMatchObject({ status: "open", lines: [{ enteredQuantity: 120 }] });

    const mixChanged = await request(app)
      .post("/api/plant-module/supply-orders/91/lines/4/mix-versions")
      .send({
        bitumenPercent: 5.3,
        components: [{ materialId: 12, aggregateSharePercent: 100 }],
        effectiveAt: new Date().toISOString(),
        reason: "Revised plant mix",
      });
    expect(mixChanged.status).toBe(200);
    expect(state.queued.at(-1)).toMatchObject({ status: "open", orderNo: "PO-91" });

    const closed = await request(app).patch("/api/plant-module/supply-orders/91/status").send({ status: "closed" });
    expect(closed.status).toBe(200);
    expect(state.queued.at(-1)).toMatchObject({ status: "closed" });

    const reopened = await request(app).patch("/api/plant-module/supply-orders/91/status").send({ status: "open" });
    expect(reopened.status).toBe(200);
    expect(state.queued.at(-1)).toMatchObject({ status: "open" });
    expect(state.queued).toHaveLength(5);
  });

  it("keeps the site-link conflict choice Owner-only", async () => {
    state.user = { id: 2, fullName: "Engineer", isOwner: false, isAdmin: false, isActive: true };
    const response = await request(app)
      .post("/api/plant-module/supply-orders/91/dispatchpro/link-choice")
      .send({ choice: "replace" });
    expect(response.status).toBe(403);
  });

  it("retries DispatchPro using the current order details", async () => {
    state.order = {
      id: 91,
      partyId: 7,
      partyName: "Ashok Contractor",
      siteId: 18,
      siteName: "Current site",
      orderNo: "PO-CURRENT",
      periodFrom: "2026-11-01",
      periodTo: "2026-12-15",
      status: "open",
      lines: [{ mixTemplateId: 4, mixName: "Current template", orderedMt: 225 }],
    };

    const response = await request(app)
      .post("/api/plant-module/supply-orders/91/dispatchpro/retry")
      .send({});

    expect(response.status).toBe(200);
    expect(state.queued.at(-1)).toMatchObject({
      id: 91,
      orderNo: "PO-CURRENT",
      lines: [{ mixTemplateId: 4, mixName: "Current template", orderedMt: 225 }],
    });
  });
});
