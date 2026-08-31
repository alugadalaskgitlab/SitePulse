/**
 * Batch 06M-C — Daily Diesel Purchase: Receipt Pending + linked Material
 * Receipt + variance control.
 *
 * Layer 1: shared/dieselReceiptStatus.ts — the single derived-state seam
 * (Purchased/Received/Pending/Variance/status + cancelled-receipt disclosure).
 * Layer 2: routes with mocked storage (028B pattern) — the receipt-status
 * endpoint aggregates ONLY linked receipts, and purchase completion sends the
 * existing section push without touching stock.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import {
  computeDieselReceiptState,
  isValidLinkedReceipt,
  DIESEL_RECEIPT_STATUS_LABELS,
  CANCELLED_RECEIPT_STOCK_NOTE,
} from "@shared/dieselReceiptStatus";

// ---------------------------------------------------------------------------
// Mocks (registered before route import)
// ---------------------------------------------------------------------------
const pushCalls: any[] = [];
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn((...args: any[]) => { pushCalls.push(args); return Promise.resolve(); }),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-user", isAdmin: fx.auth.isAdmin, isActive: true };
    req.authPermissions = fx.auth.permissions;
    req.session = { role: "admin", username: "test-user", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

const fx: {
  requirement: any;
  linkedReceipts: any[];
  adjustCalls: any[];
  receipt: any;
  auth: { isAdmin: boolean; permissions: any };
} = {
  requirement: { id: 77, status: "purchased", qtyPurchased: 600, supplier: "ABC FUELS", items: [] },
  linkedReceipts: [],
  adjustCalls: [],
  receipt: {
    id: 501, materialId: 12, quantity: 100, uom: "Liters", date: "2026-08-15",
    documentStatus: "draft", linkedDieselRequirementId: 77,
  },
  auth: { isAdmin: true, permissions: {} },
};

vi.mock("../server/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/storage")>();
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getDieselRequirement = vi.fn(async (id: number) => (id === fx.requirement.id ? fx.requirement : undefined));
  methods.getDieselRequirementReceipts = vi.fn(async (ids: number[]) =>
    fx.linkedReceipts.filter((r) => ids.includes(r.linkedDieselRequirementId)));
  methods.updateDieselPurchase = vi.fn(async (id: number, data: any) => ({ ...fx.requirement, ...data, id }));
  methods.createNotification = vi.fn(async () => ({}));
  methods.createMaterialReceipt = vi.fn(async (input: any) => {
    const created = { id: 501, isCancelled: false, isDeleted: false, ...input };
    if (input.linkedDieselRequirementId != null) {
      fx.linkedReceipts = fx.linkedReceipts.filter((r) => r.id !== created.id);
      fx.linkedReceipts.push(created);
    }
    return created;
  });
  methods.getAllPlantMaterials = vi.fn(async () => [
    { id: 12, name: "DIESEL", defaultUom: "Liters" },
    { id: 30, name: "20MM AGGREGATE", defaultUom: "Ton" },
  ]);
  methods.getMaterialReceipt = vi.fn(async (id: number) => fx.receipt ? { ...fx.receipt, id } : undefined);
  methods.updateMaterialReceipt = vi.fn(async (id: number, input: any) => ({ id, ...input }));
  methods.logAudit = vi.fn(async () => ({}));
  return { ...actual, storage: storageProxy };
});

let app: express.Express;
beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json({ limit: "5mb" }));
  const server = createServer(app);
  await registerRoutes(server, app);
});

const R = (id: number, quantity: number, extra: any = {}) => ({
  id, quantity, uom: "Liters", date: "2026-08-15", time: null, supplier: "ABC FUELS",
  challanNumber: "CH-1", receiptNo: null, isCancelled: false, isDeleted: false,
  finalSubmittedBy: null, linkedDieselRequirementId: 77, ...extra,
});

// ---------------------------------------------------------------------------
// Layer 1 — derived state
// ---------------------------------------------------------------------------
describe("06M-C derived receipt state (shared/dieselReceiptStatus)", () => {
  it("B: purchase with no receipts → Receipt Pending, Pending = full qty (purchase adds NO stock)", () => {
    const s = computeDieselReceiptState(600, []);
    expect(s).toMatchObject({ purchasedQty: 600, receivedQty: 0, pendingQty: 600, status: "receipt_pending" });
    expect(DIESEL_RECEIPT_STATUS_LABELS[s.status]).toBe("Receipt Pending");
  });

  it("E: 600 purchased, 400 received → Partly Received, Pending 200", () => {
    const s = computeDieselReceiptState(600, [R(1, 400)]);
    expect(s).toMatchObject({ receivedQty: 400, pendingQty: 200, status: "partly_received" });
  });

  it("F/G: multiple partial receipts accumulate; 400+200 → Fully Received, Pending 0", () => {
    const s = computeDieselReceiptState(600, [R(1, 400), R(2, 200)]);
    expect(s).toMatchObject({ receivedQty: 600, pendingQty: 0, overReceiptQty: 0, status: "fully_received", validReceiptCount: 2 });
  });

  it("H: cancelled receipt excluded from Received AND flagged for the Section-14 stock-divergence note", () => {
    const s = computeDieselReceiptState(600, [R(1, 500), R(2, 100, { isCancelled: true })]);
    expect(s).toMatchObject({ receivedQty: 500, pendingQty: 100, status: "partly_received", cancelledReceiptCount: 1 });
    expect(CANCELLED_RECEIPT_STOCK_NOTE).toContain("may not have been automatically reversed");
    expect(isValidLinkedReceipt({ quantity: 100, isCancelled: true })).toBe(false);
  });

  it("I: edited receipt quantity recalculates (570 after edit → Pending 30)", () => {
    const s = computeDieselReceiptState(600, [R(1, 570)]);
    expect(s).toMatchObject({ receivedQty: 570, pendingQty: 30, status: "partly_received" });
  });

  it("K: over-receipt shows explicit variance, never clamped (620 vs 600 → +20)", () => {
    const s = computeDieselReceiptState(600, [R(1, 620)]);
    expect(s).toMatchObject({ receivedQty: 620, pendingQty: 0, overReceiptQty: 20, status: "fully_received" });
  });

  it("J/15: purchase qty edited below received → variance surfaces, receipts untouched (500 vs 570 → +70)", () => {
    const s = computeDieselReceiptState(500, [R(1, 570)]);
    expect(s).toMatchObject({ overReceiptQty: 70, status: "fully_received" });
  });

  it("deleted rows never counted; numeric strings coerced (pg numeric)", () => {
    const s = computeDieselReceiptState("600", [R(1, "400" as any), R(2, 50, { isDeleted: true })]);
    expect(s).toMatchObject({ receivedQty: 400, pendingQty: 200 });
  });

  it("Q: historical purchase with zero linked records is simply Receipt Pending — nothing inferred", () => {
    const s = computeDieselReceiptState(300, []);
    expect(s.validReceiptCount).toBe(0);
    expect(s.status).toBe("receipt_pending");
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — routes
// ---------------------------------------------------------------------------
describe("06M-C receipt-status endpoint", () => {
  it("O/P: aggregates ONLY receipts linked to the requested purchase", async () => {
    fx.linkedReceipts = [R(1, 400), R(2, 170)];
    const res = await request(app).get("/api/diesel-requirements/receipt-status?ids=77");
    expect(res.status).toBe(200);
    expect(res.body["77"]).toMatchObject({ purchasedQty: 600, receivedQty: 570, pendingQty: 30, status: "partly_received" });
    expect(res.body["77"].receipts).toHaveLength(2);
  });

  it("H (route): cancelled linked receipt drops out of Received and is flagged", async () => {
    fx.linkedReceipts = [R(1, 600), R(2, 100, { isCancelled: true })];
    const res = await request(app).get("/api/diesel-requirements/receipt-status?ids=77");
    expect(res.body["77"]).toMatchObject({ receivedQty: 600, status: "fully_received", cancelledReceiptCount: 1 });
  });

  it("ignores unknown ids and rejects garbage safely", async () => {
    const res = await request(app).get("/api/diesel-requirements/receipt-status?ids=999,abc");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe("06M-C purchase completion", () => {
  it("A/R: purchase-update records purchase, sends RECEIPT PENDING push to Material Receipt authority, and never touches stock", async () => {
    pushCalls.length = 0;
    const { storage } = await import("../server/storage");
    const res = await request(app)
      .patch("/api/diesel-requirements/77/purchase-update")
      .send({ qtyPurchased: 600, supplier: "ABC FUELS" });
    expect(res.status).toBe(200);
    const push = pushCalls.find((c) => c[1]?.includes("RECEIPT PENDING"));
    expect(push).toBeTruthy();
    expect(push![0]).toBe("plant_materials"); // existing section-based recipient resolver
    expect(push![3]).toBe("/plant/diesel-requirements");
    // no stock mutation from a purchase: only updateDieselPurchase was called
    expect((storage as any).createMaterialReceipt).not.toHaveBeenCalled();
  });

  it("payment-only edit (no qtyPurchased) sends no receipt-pending push", async () => {
    pushCalls.length = 0;
    await request(app).patch("/api/diesel-requirements/77/purchase-update").send({ paymentMode: "upi" });
    expect(pushCalls.find((c) => c[1]?.includes("RECEIPT PENDING"))).toBeUndefined();
  });
});

describe("06M-C linked material receipt", () => {
  it("links qualifying diesel purchase evidence to the newly created receipt", async () => {
    const { storage } = await import("../server/storage");
    fx.linkedReceipts = [];
    await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "Liters",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect((storage as any).linkDieselPurchaseEvidenceToMaterialReceipt)
      .toHaveBeenCalledWith(77, 501, 9);
  });

  it("keeps a successfully created receipt successful when optional evidence linking fails", async () => {
    const { storage } = await import("../server/storage");
    fx.linkedReceipts = [];
    (storage as any).linkDieselPurchaseEvidenceToMaterialReceipt.mockRejectedValueOnce(new Error("link unavailable"));
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "Liters",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(501);
  });

  it("D/T/22: creating a LINKED receipt notifies partial progress with derived figures (stock-IN via existing receipt path)", async () => {
    pushCalls.length = 0;
    fx.linkedReceipts = [];
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 400, uom: "Liters",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(201);
    expect(res.body.linkedDieselRequirementId).toBe(77);
    const push = pushCalls.find((c) => c[1] === "DIESEL PARTLY RECEIVED");
    expect(push).toBeTruthy();
    expect(push![2]).toContain("Purchased: 600 L");
    expect(push![2]).toContain("Received: 400 L");
    expect(push![2]).toContain("Pending: 200 L");
  });

  it("G (route): cumulative receipts reaching purchased qty notify FULLY RECEIVED", async () => {
    pushCalls.length = 0;
    fx.linkedReceipts = [R(1, 400)];
    await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 200, uom: "Liters",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect(pushCalls.find((c) => c[1] === "DIESEL FULLY RECEIVED")).toBeTruthy();
  });

  it("link validation: linking to a non-existent or non-purchased requirement is rejected 400", async () => {
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "Liters",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 9999,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not found or not a completed purchase");
  });

  it("U: linking a NON-Diesel material receipt to a diesel purchase is rejected 400", async () => {
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 30, quantity: 100, uom: "Ton",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LINKED_DIESEL_MATERIAL_MISMATCH");
    expect(res.body.message).toContain("Only Diesel receipts");
  });

  it("rejects linked diesel receipts with a non-Liters UOM", async () => {
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "L",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LINKED_DIESEL_UOM_INVALID");
  });

  it("14/immutability: normal receipt edit can never change or strip the purchase link", async () => {
    const { storage } = await import("../server/storage");
    fx.linkedReceipts = [R(501, 100)];
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({
      quantity: 570, linkedDieselRequirementId: 12345,
    });
    expect(res.status).toBe(200);
    const passed = (storage as any).updateMaterialReceipt.mock.calls.at(-1)[1];
    expect("linkedDieselRequirementId" in passed).toBe(false);
    expect(passed.quantity).toBe(570);
  });

  it("requires and consumes the matching approved request for a non-direct submitted correction", async () => {
    const { storage } = await import("../server/storage");
    fx.linkedReceipts = [R(501, 100)];
    fx.auth = { isAdmin: false, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "submitted" };
    (storage as any).checkActiveEditPermission.mockResolvedValueOnce({
      id: 88, requestedBy: 9, recordType: "material_receipt", recordId: 501, status: "approved",
    });
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({
      quantity: 570, editPermissionRequestId: 88,
    });
    expect(res.status).toBe(200);
    expect((storage as any).consumeEditPermission).toHaveBeenLastCalledWith(88);
    expect((storage as any).updateMaterialReceipt.mock.calls.at(-1)[1].editPermissionRequestId).toBeUndefined();
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "draft" };
  });

  it("rejects a submitted correction without its approved request", async () => {
    fx.auth = { isAdmin: false, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "submitted" };
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({ quantity: 570 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("APPROVED_EDIT_PERMISSION_REQUIRED");
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "draft" };
  });

  it("rejects a direct submitted correction that changes a linked receipt material", async () => {
    const { storage } = await import("../server/storage");
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "submitted", linkedDieselRequirementId: 77 };
    const updateCalls = (storage as any).updateMaterialReceipt.mock.calls.length;
    const consumeCalls = (storage as any).consumeEditPermission.mock.calls.length;
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({
      materialId: 30, editPermissionRequestId: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LINKED_DIESEL_MATERIAL_MISMATCH");
    expect((storage as any).updateMaterialReceipt.mock.calls).toHaveLength(updateCalls);
    expect((storage as any).consumeEditPermission.mock.calls).toHaveLength(consumeCalls);
    fx.receipt = { ...fx.receipt, documentStatus: "draft" };
  });

  it("rejects an approved-request correction that changes a linked receipt UOM", async () => {
    const { storage } = await import("../server/storage");
    fx.auth = { isAdmin: false, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "submitted", linkedDieselRequirementId: 77 };
    (storage as any).checkActiveEditPermission.mockResolvedValueOnce({
      id: 89, requestedBy: 9, recordType: "material_receipt", recordId: 501, status: "approved",
    });
    const updateCalls = (storage as any).updateMaterialReceipt.mock.calls.length;
    const consumeCalls = (storage as any).consumeEditPermission.mock.calls.length;
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({
      uom: "L", editPermissionRequestId: 89,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LINKED_DIESEL_UOM_INVALID");
    expect((storage as any).updateMaterialReceipt.mock.calls).toHaveLength(updateCalls);
    expect((storage as any).consumeEditPermission.mock.calls).toHaveLength(consumeCalls);
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = { ...fx.receipt, documentStatus: "draft" };
  });

  it("L/P: an authorised UNLINKED Diesel exception triggers no diesel-purchase push", async () => {
    pushCalls.length = 0;
    await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "Liters",
      partyId: null, isPlantCommon: 1, dieselExceptionReason: "Emergency delivery pending requirement regularisation",
    });
    expect(pushCalls.find((c) => String(c[1]).startsWith("DIESEL "))).toBeUndefined();
  });

  it("rejects an ordinary unlinked Diesel receipt without an exception reason", async () => {
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "Liters",
      partyId: null, isPlantCommon: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DIESEL_EXCEPTION_REASON_REQUIRED");
  });

  it("rejects a standalone Diesel exception from a user without Owner/Admin/PM authority", async () => {
    fx.auth = { isAdmin: false, permissions: { plant_materials: { create: true } } };
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 100, uom: "Liters",
      partyId: null, isPlantCommon: 1, dieselExceptionReason: "Not authorised",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DIESEL_STANDALONE_NOT_AUTHORISED");
    fx.auth = { isAdmin: true, permissions: {} };
  });

  it("rejects a linked receipt above the valid remaining purchased quantity", async () => {
    fx.linkedReceipts = [R(1, 570), R(2, 25, { isCancelled: true }), R(3, 20, { isDeleted: true })];
    const res = await request(app).post("/api/plant-module/material-receipts").send({
      date: "2026-08-15", materialId: 12, quantity: 40, uom: "Liters",
      partyId: null, isPlantCommon: 1, linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "DIESEL_RECEIPT_EXCEEDS_REMAINING",
      requestedQty: 40,
      remainingQty: 30,
      excessQty: 10,
    });
  });

  it("allows an authorised edit to regularise an exceptional receipt by linking it", async () => {
    const { storage } = await import("../server/storage");
    fx.linkedReceipts = [];
    fx.receipt = { ...fx.receipt, linkedDieselRequirementId: null, dieselExceptionReason: "Emergency delivery" };
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({
      linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(200);
    expect((storage as any).updateMaterialReceipt.mock.calls.at(-1)[1]).toMatchObject({
      linkedDieselRequirementId: 77,
      dieselExceptionReason: "Emergency delivery",
    });
    fx.receipt = { ...fx.receipt, linkedDieselRequirementId: 77 };
  });

  it("grandfathers a legacy unlinked Diesel receipt on an ordinary plant-material edit", async () => {
    const { storage } = await import("../server/storage");
    fx.auth = { isAdmin: false, permissions: { plant_materials: { edit: true } } };
    fx.receipt = {
      ...fx.receipt,
      linkedDieselRequirementId: null,
      dieselExceptionReason: null,
      documentStatus: "draft",
    };
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({ supplier: "CORRECTED SUPPLIER" });
    expect(res.status).toBe(200);
    expect((storage as any).updateMaterialReceipt.mock.calls.at(-1)[1]).toMatchObject({
      supplier: "CORRECTED SUPPLIER",
      dieselExceptionReason: null,
    });
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = { ...fx.receipt, linkedDieselRequirementId: 77, dieselExceptionReason: undefined };
  });

  it("blocks ordinary plant-material editors from regularising legacy or exceptional Diesel receipts", async () => {
    fx.auth = { isAdmin: false, permissions: { plant_materials: { edit: true } } };
    fx.receipt = {
      ...fx.receipt,
      linkedDieselRequirementId: null,
      dieselExceptionReason: null,
      documentStatus: "draft",
    };
    fx.linkedReceipts = [];
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({
      linkedDieselRequirementId: 77,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DIESEL_REGULARISATION_NOT_AUTHORISED");
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = { ...fx.receipt, linkedDieselRequirementId: 77, dieselExceptionReason: undefined };
  });

  it("maps an atomically blocked Diesel receipt credit reduction to the standard stock 409", async () => {
    const storageModule = await import("../server/storage");
    const { storage, InsufficientPlantStockError } = storageModule as any;
    fx.auth = { isAdmin: true, permissions: {} };
    fx.receipt = {
      ...fx.receipt,
      materialId: 12,
      quantity: 100,
      linkedDieselRequirementId: 77,
      documentStatus: "draft",
    };
    fx.linkedReceipts = [R(501, 100)];
    storage.updateMaterialReceipt.mockRejectedValueOnce(new InsufficientPlantStockError({
      material: "DIESEL",
      source: "material_receipt_update",
      materialId: 12,
      partyId: null,
      requestedQty: 20,
      availableQty: 10,
      shortageQty: 10,
    }));
    const res = await request(app).put("/api/plant-module/material-receipts/501").send({ quantity: 80 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      requestedQty: 20,
      availableQty: 10,
      shortageQty: 10,
    });
  });
});
