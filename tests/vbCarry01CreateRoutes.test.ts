import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const roleState = vi.hoisted(() => ({ admin: true }));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 99, username: "test-admin", isAdmin: roleState.admin, isActive: true };
    req.authPermissions = {};
    req.session = { role: "admin", username: "test-admin", userId: 99 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storage = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  class TestStorageError extends Error {}
  return {
    storage,
    StockShortageError: TestStorageError,
    EquipmentIncomingConflictError: TestStorageError,
    InsufficientPlantStockError: TestStorageError,
    InvalidDieselPhysicalStockError: TestStorageError,
    InvalidStockTransferQuantityError: TestStorageError,
    InvalidDieselSourceError: TestStorageError,
    DieselReceiptExceedsRemainingError: TestStorageError,
    InvalidLinkedDieselRequirementError: TestStorageError,
    CutFillInsufficientAvailabilityError: TestStorageError,
    CutFillValidationError: TestStorageError,
    AttachmentReferenceError: TestStorageError,
    InitialScopeCorrectionBlockedError: TestStorageError,
    ScopeChangedDuringPlanningError: TestStorageError,
    DprProjectMismatchError: TestStorageError,
    PushSubscriptionOwnershipError: TestStorageError,
    PurchaseIndentRouteCorrectionConflictError: TestStorageError,
    assertValidDieselPhysicalStock: vi.fn(),
  };
});

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

const routes = [
  {
    label: "party",
    path: "/api/plant-module/parties",
    method: "createParty",
    serverOwnedField: "createdAt",
    body: { name: "SYNTHETIC PARTY", notes: "screen note" },
  },
  {
    label: "plant material",
    path: "/api/plant-module/materials",
    method: "createPlantMaterial",
    serverOwnedField: "conversionFactor",
    body: {
      name: "SYNTHETIC MATERIAL",
      category: "Aggregate",
      defaultUom: "Ton",
      procurementRoute: "stores",
      bulkDensity: null,
      conversionFromUom: "CFT",
    },
  },
  {
    label: "mix type",
    path: "/api/plant-module/mix-types",
    method: "createMixType",
    serverOwnedField: "createdAt",
    body: { name: "SYNTHETIC MIX" },
  },
  {
    label: "equipment master",
    path: "/api/plant-module/equipment",
    method: "createEquipment",
    serverOwnedField: "createdAt",
    body: {
      name: "SYNTHETIC EXCAVATOR",
      registrationNumber: "SYN-001",
      equipmentType: "Excavator",
      ownership: "owned",
      hireBillingBasis: null,
      hireRate: null,
      hireStartDate: null,
      hireEndDate: null,
      hireDieselResponsibility: null,
      hireOperatorResponsibility: null,
      hireAgreementRemarks: null,
      hireBreakdownDeductionEnabled: false,
      hireMonthlyDivisorType: null,
      hireMonthlyDivisor: null,
      meterType: "hour_meter",
      consumptionNorm: null,
      plantName: "Main Plant",
      standardOutputs: [{ unit: "MT", outputPerHr: 2 }],
      outputEfficiency: null,
    },
  },
  {
    label: "truck dispatch",
    path: "/api/plant-module/dispatches",
    method: "createTruckDispatchWithStockDeduction",
    serverOwnedField: "adjustedBy",
    body: {
      date: "2026-10-17",
      time: "08:00",
      partyId: 1,
      mixTemplateId: 2,
      truckNumber: "SYN-TRUCK",
      loadWeight: 20,
      deliveryLocation: "SYNTHETIC SITE",
      ownerName: null,
      driverName: null,
      actualBitumenPercent: null,
      actualLdoQty: null,
      bitumenTankNumber: 1,
      ldoTankNumber: 1,
      transportEquipmentId: null,
      allowHlcFallback: true,
    },
  },
  {
    label: "generator log",
    path: "/api/plant-module/generator-logs",
    method: "createGeneratorLog",
    serverOwnedField: "createdAt",
    body: {
      date: "2026-10-17",
      generatorName: "600 KVA",
      startTime: "08:00",
      endTime: "16:00",
      hoursRun: 8,
      openingDiesel: 100,
      dieselIssued: 20,
      closingDiesel: 80,
    },
  },
  {
    label: "store item",
    path: "/api/stores/items",
    method: "createStoreItem",
    serverOwnedField: "createdAt",
    body: { name: "SYNTHETIC ITEM", category: "Tools", uom: "NOS", minStockQty: 2, isActive: 1 },
  },
  {
    label: "planning equipment type",
    path: "/api/planning/equipment-types",
    method: "createPlanningEquipmentType",
    serverOwnedField: "sortOrder",
    body: {
      name: "SYNTHETIC PLANNING EQUIPMENT",
      category: "General",
      standardOutputs: [{ unit: "MT", outputPerHr: 2 }],
      fuelType: "Diesel",
      consumptionNorm: 5,
      isActive: true,
    },
  },
  {
    label: "planning labour type",
    path: "/api/planning/labour-types",
    method: "createPlanningLabourType",
    serverOwnedField: "sortOrder",
    body: {
      designation: "SYNTHETIC OPERATOR",
      skillTier: "Skilled",
      standardOutputs: [{ unit: "MT", outputPerDay: 10 }],
      isActive: true,
    },
  },
] as const;

let agent: request.SuperTest<request.Test>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
  agent = request(app) as any;
});

beforeEach(() => {
  roleState.admin = true;
  for (const route of routes) {
    const method = (storage as any)[route.method] as ReturnType<typeof vi.fn>;
    method.mockReset().mockImplementation(async (input: any) => ({ id: 700, ...input }));
  }
  (storage as any).createNotification.mockReset().mockResolvedValue({ id: 1 });
  (storage as any).createTruckDispatchWithStockDeduction.mockReset().mockResolvedValue({
    dispatch: { id: 700, date: "2026-10-17", loadWeight: 20 },
    shortages: [],
  });
});

describe("VB-CARRY-01 create-route request validation", () => {
  it.each(routes)("accepts the current screen payload for $label", async (route) => {
    const response = await agent.post(route.path).send(route.body);
    expect(response.status).toBe(201);
    expect((storage as any)[route.method]).toHaveBeenCalledTimes(1);
  });

  it("accepts the Purchase Indents store-item payload without changing that screen", async () => {
    const response = await agent.post("/api/stores/items").send({
      name: "SYNTHETIC MATERIAL",
      category: "Aggregate",
      defaultUom: "CFT",
      isActive: 1,
    });

    expect(response.status).toBe(201);
    expect((storage as any).createStoreItem).toHaveBeenCalledWith({
      name: "SYNTHETIC MATERIAL",
      category: "Aggregate",
      uom: "CFT",
      isActive: 1,
    });
  });

  it.each(routes)("refuses a client id for $label and does not call storage", async (route) => {
    const response = await agent.post(route.path).send({ ...route.body, id: 500 });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid request body");
    expect(JSON.stringify(response.body.errors)).toContain("'id'");
    expect((storage as any)[route.method]).not.toHaveBeenCalled();
  });

  it.each(routes)("refuses the server-owned $serverOwnedField field for $label", async (route) => {
    const response = await agent.post(route.path).send({
      ...route.body,
      [route.serverOwnedField]: route.serverOwnedField.endsWith("At") ? "2026-10-17T00:00:00.000Z" : 999,
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.errors)).toContain(route.serverOwnedField);
    expect((storage as any)[route.method]).not.toHaveBeenCalled();
  });
});
