import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import request from "supertest";

const state = vi.hoisted(() => ({
  order: null as any,
  queued: [] as any[],
  parties: [] as any[],
  partyAudits: [] as any[],
  openOrderIds: [] as number[],
  ordersById: {} as Record<number, any>,
  listedOrders: [] as any[],
  scopeUpdates: [] as any[],
  permissions: {} as Record<string, any>,
  user: { id: 1, fullName: "Test Owner", isOwner: true, isAdmin: true, isActive: true },
}));

vi.mock("../server/auth", () => {
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = state.user;
    req.authPermissions = state.permissions;
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
      if (key === "getParties") return async () => state.parties;
      if (key === "createParty") return async (input: any) => {
        const party = { ...input, id: state.parties.length + 1, name: input.name.toUpperCase() };
        state.parties.push(party);
        return party;
      };
      if (key === "updateParty") return async (id: number, input: any) => {
        const index = state.parties.findIndex(party => party.id === id);
        if (index < 0) return undefined;
        state.parties[index] = { ...state.parties[index], ...input };
        return state.parties[index];
      };
      if (key === "logAudit") return async (entry: any) => { state.partyAudits.push(entry); };
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
    getPlantSupplyOrder: vi.fn(async (id: number) => state.ordersById[id] ?? state.order),
    listPlantSupplyOrders: vi.fn(async () => state.listedOrders),
    getOpenPlantSupplyOrderIdsForParty: vi.fn(async (partyId: number) =>
      state.parties.some(party => party.id === partyId) ? state.openOrderIds : []),
    createPlantSupplyOrder: vi.fn(async (input: any) => {
      state.order = { ...input, id: 91, orderNo: input.orderNo ?? "PO-91", status: "open", partyName: "North party", siteName: "Test road" };
      return state.order;
    }),
    editPlantSupplyOrder: vi.fn(async (_id: number, input: any) => {
      state.order = { ...state.order, ...input };
      return state.order;
    }),
    updateSupplyOrderScope: vi.fn(async (orderId: number, materialId: number, scope: "hlc" | "party", actor: any) => {
      if (state.order?.status !== "open") throw new Error("Only an open order can be changed.");
      const update = {
        orderId,
        materialId,
        scope,
        actor,
        audit: {
          oldValues: { materialId, scope: "hlc" },
          newValues: { materialId, scope },
        },
      };
      state.scopeUpdates.push(update);
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
        partyName: order.partyName,
        partyPanNo: order.partyPanNo,
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
    state.parties.length = 0;
    state.partyAudits.length = 0;
    state.openOrderIds.length = 0;
    state.ordersById = {};
    state.listedOrders = [];
    state.scopeUpdates.length = 0;
    state.permissions = {};
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
    Object.assign(state.order, {
      workName: "Legacy typed work",
      division: "Legacy division",
      mtPerCumFactor: "2.356",
    });

    const edited = await request(app).patch("/api/plant-module/supply-orders/91").send({
      orderNo: "PO-91",
      periodFrom: "2026-11-01",
      periodTo: "2026-12-15",
      remarks: null,
      lines: [{ mixTemplateId: 4, enteredQuantity: 120, enteredUnit: "MT", plannedMtPerDay: 12 }],
    });
    expect(edited.status).toBe(200);
    expect(state.queued.at(-1)).toMatchObject({ status: "open", lines: [{ enteredQuantity: 120 }] });
    expect(state.order).toMatchObject({
      workName: "Legacy typed work",
      division: "Legacy division",
      mtPerCumFactor: "2.356",
    });

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

  it("returns allowance and actual fields only to users with norm-vs-actual permission", async () => {
    state.order = {
      id: 91,
      status: "open",
      lines: [{
        id: 2,
        mixVersions: [{ versionId: 11, materialUsage: [{ materialId: 9, allowance: 10, actual: 9, variance: -1 }] }],
      }],
      materialUsage: [{ materialId: 9, allowance: 10, actual: 9, variance: -1 }],
    };
    state.user = { id: 2, fullName: "Engineer", isOwner: false, isAdmin: false, isActive: true };
    state.permissions = {
      plant_supply_orders: { view: true },
      plant_norm_vs_actual: { view: false },
    };
    const restricted = await request(app).get("/api/plant-module/supply-orders/91");
    expect(restricted.status).toBe(200);
    expect(restricted.body).not.toHaveProperty("materialUsage");
    expect(restricted.body.lines[0].mixVersions[0]).not.toHaveProperty("materialUsage");

    state.permissions.plant_norm_vs_actual.view = true;
    const allowed = await request(app).get("/api/plant-module/supply-orders/91");
    expect(allowed.status).toBe(200);
    expect(allowed.body.materialUsage).toEqual(state.order.materialUsage);
    expect(allowed.body.lines[0].mixVersions[0].materialUsage).toEqual(state.order.lines[0].mixVersions[0].materialUsage);

    state.permissions.plant_norm_vs_actual.view = false;
    state.listedOrders = [state.order];
    const restrictedList = await request(app).get("/api/plant-module/supply-orders");
    expect(restrictedList.status).toBe(200);
    expect(restrictedList.body[0]).not.toHaveProperty("materialUsage");
    expect(restrictedList.body[0].lines[0].mixVersions[0]).not.toHaveProperty("materialUsage");
  });

  it("keeps supplier changes on the existing open-order audit path", async () => {
    state.order = { id: 91, status: "open", materials: [{ materialId: 9 }] };
    const updated = await request(app).patch("/api/plant-module/supply-orders/91/material-scope")
      .send({ materialId: 9, scope: "party" });
    expect(updated.status).toBe(200);
    expect(state.scopeUpdates.at(-1)).toMatchObject({
      orderId: 91,
      materialId: 9,
      scope: "party",
      actor: { userId: 1, name: "Test Owner" },
      audit: { oldValues: { scope: "hlc" }, newValues: { scope: "party" } },
    });

    state.order.status = "closed";
    const closed = await request(app).patch("/api/plant-module/supply-orders/91/material-scope")
      .send({ materialId: 9, scope: "hlc" });
    expect(closed.status).toBe(400);
    expect(state.scopeUpdates).toHaveLength(1);
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

  it("normalizes GST and PAN, allows blanks, and gives plain format errors", async () => {
    const badGst = await request(app).post("/api/plant-module/parties").send({
      name: "Format test", gstNo: "bad", panNo: "ABCDE1234F",
    });
    expect(badGst.status).toBe(400);
    expect(badGst.body.message).toBe("GST no. must be 15 letters or digits.");

    const badPan = await request(app).post("/api/plant-module/parties").send({
      name: "Format test", gstNo: "36ABCDE1234F1Z5", panNo: "bad",
    });
    expect(badPan.status).toBe(400);
    expect(badPan.body.message).toBe("PAN no. must be 5 letters, 4 digits and 1 letter.");

    const created = await request(app).post("/api/plant-module/parties").send({
      name: "Format test", gstNo: " 36abcde1234f1z5 ", panNo: " abcde1234f ",
    });
    expect(created.status).toBe(201);
    expect(state.parties[0]).toMatchObject({ gstNo: "36ABCDE1234F1Z5", panNo: "ABCDE1234F" });
    expect(state.partyAudits.at(-1).newValues).toMatchObject({ gstNo: "36ABCDE1234F1Z5", panNo: "ABCDE1234F" });

    const blank = await request(app).post("/api/plant-module/parties").send({
      name: "Blank identifiers", gstNo: " ", panNo: "",
    });
    expect(blank.status).toBe(201);
    expect(state.parties.at(-1)).toMatchObject({ gstNo: null, panNo: null });
  });

  it("re-queues open order details after a Party master edit and skips orders that closed meanwhile", async () => {
    state.parties.push({
      id: 7, name: "OLD PARTY", contactPerson: null, mobile: null, gstNo: null, panNo: null, address: null,
    });
    state.openOrderIds.push(91, 92);
    state.ordersById[91] = {
      id: 91, partyId: 7, partyName: "NEW PARTY", siteId: 18, siteName: "Test road",
      orderNo: "PO-91", status: "open", partyPanNo: "ABCDE1234F", lines: [],
    };
    state.ordersById[92] = {
      id: 92, partyId: 7, partyName: "NEW PARTY", siteId: 19, siteName: "Closed road",
      orderNo: "PO-92", status: "closed", lines: [],
    };

    const response = await request(app).patch("/api/plant-module/parties/7").send({
      name: "New party",
      contactPerson: "New contact",
      mobile: null,
      gstNo: null,
      panNo: "abcde1234f",
      address: null,
    });

    expect(response.status).toBe(200);
    expect(response.body.dispatchProRequeue).toEqual({ queued: 1, skipped: 1, failed: 0 });
    expect(state.queued).toEqual([
      expect.objectContaining({ id: 91, status: "open", partyPanNo: "ABCDE1234F" }),
    ]);
    expect(state.partyAudits.at(-1)).toMatchObject({
      module: "party_master",
      action: "edit",
      oldValues: expect.objectContaining({ panNo: null }),
      newValues: expect.objectContaining({ panNo: "ABCDE1234F" }),
    });
  });
});
