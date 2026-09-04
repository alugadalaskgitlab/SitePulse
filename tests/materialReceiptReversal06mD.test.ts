/**
 * Batch 06M-D — Material Receipt cancel/delete stock reversal safety.
 *
 * Layer 1: the tx-scoped storage bodies (_cancelMaterialReceiptWithinTx and
 * _deleteMaterialReceiptWithinTx) driven with a stub transaction — reversal
 * maths, compensating ledger entry, idempotency, sufficiency block,
 * cancelled-then-delete no-double-reversal (06M-B stub-tx pattern).
 *
 * Layer 2: route mapping with mocked storage — 409 responses for
 * already-cancelled and reversal-stock-unavailable on cancel/delete.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-user", isAdmin: true, isActive: true };
    req.authPermissions = {};
    req.session = { role: "admin", username: "test-user", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

const routeFx: { cancelError: any; deleteError: any } = { cancelError: null, deleteError: null };

vi.mock("../server/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/storage")>();
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getMaterialReceipt = vi.fn(async (id: number) => ({ id, materialId: 12, quantity: 600, uom: "Liters", isCancelled: false }));
  methods.cancelMaterialReceipt = vi.fn(async () => {
    if (routeFx.cancelError) throw routeFx.cancelError;
    return { id: 88, isCancelled: true };
  });
  methods.deleteMaterialReceipt = vi.fn(async () => {
    if (routeFx.deleteError) throw routeFx.deleteError;
    return true;
  });
  methods.logAudit = vi.fn(async () => ({}));
  methods.updateMaterialReceipt = vi.fn(async (id: number, input: any) => ({ id, ...input }));
  return { ...actual, storage: storageProxy };
});

// ---------------------------------------------------------------------------
// Layer 1 — stub-tx harness
// ---------------------------------------------------------------------------
type Fixture = {
  receipt: any;
  material: any;
  balance: number;
  hasReversalRow: boolean;
};

function stubTx(f: Fixture) {
  const calls = { ledgerInserts: [] as any[], balanceUpdates: [] as any[], deletes: 0, receiptUpdates: [] as any[] };
  const tx: any = {
    execute: vi.fn(async (query: any) => {
      const text = JSON.stringify((query?.queryChunks ?? []).map((c: any) => c?.value ?? ""));
      if (text.includes("material_receipts")) {
        return { rows: f.receipt ? [{ id: f.receipt.id, is_cancelled: f.receipt.isCancelled }] : [] };
      }
      if (text.includes("material_receipt_cancel_reversal")) {
        return { rows: f.hasReversalRow ? [{ id: 999 }] : [] };
      }
      // stock_balances FOR UPDATE
      return { rows: [{ id: 1, balance: f.balance, uom: "Liters" }] };
    }),
    select: vi.fn(() => ({
      from: (table: any) => ({
        where: () => ({
          limit: async () => {
            // material_receipts select vs plant_materials select — receipt first, then material
            if (!tx._selectedReceipt) { tx._selectedReceipt = true; return f.receipt ? [f.receipt] : []; }
            return f.material ? [f.material] : [];
          },
        }),
      }),
    })),
    insert: vi.fn(() => ({ values: (v: any) => { calls.ledgerInserts.push(v); return { returning: async () => [{ id: 5, ...v }] }; } })),
    update: vi.fn(() => ({ set: (v: any) => ({ where: () => ({ returning: async () => { calls.receiptUpdates.push(v); return [{ ...f.receipt, ...v }]; } }) }) })),
    delete: vi.fn(() => ({ where: async () => { calls.deletes++; } })),
  };
  // _adjustStockBalance uses tx.update(...).set(...).where(...) without returning
  const origUpdate = tx.update;
  tx.update = vi.fn(() => ({
    set: (v: any) => {
      const chain: any = {
        where: (..._a: any[]) => {
          calls.balanceUpdates.push(v);
          const p: any = Promise.resolve();
          p.returning = async () => { calls.receiptUpdates.push(v); return [{ ...f.receipt, ...v }]; };
          return p;
        },
      };
      return chain;
    },
  }));
  void origUpdate;
  return { tx, calls };
}

const RECEIPT = {
  id: 88,
  materialId: 12,
  quantity: 600,
  uom: "Liters",
  partyId: null,
  isPlantCommon: 1,
  isCancelled: false,
  tankNumber: null,
  invoiceDate: "2026-01-15",
  date: "2026-09-04",
};
const MATERIAL = { id: 12, name: "DIESEL", conversionFactor: null, conversionFromUom: null, conversionToUom: "Liters" };

let inst: any;
let ReceiptAlreadyCancelledError: any;
let InsufficientPlantStockError: any;
beforeAll(async () => {
  const mod = (await import("../server/storage")) as any;
  ReceiptAlreadyCancelledError = mod.ReceiptAlreadyCancelledError;
  InsufficientPlantStockError = mod.InsufficientPlantStockError;
  inst = Object.create(mod.DatabaseStorage.prototype);
});

describe("06M-D cancel reversal (tx body)", () => {
  it("B/C: cancel active receipt with sufficient stock → -600 balance write, compensating ledger entry, receipt flagged", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT }, material: MATERIAL, balance: 900, hasReversalRow: false });
    const updated = await inst._cancelMaterialReceiptWithinTx(tx, 88, 9, "duplicate entry");
    expect(updated.isCancelled).toBe(true);
    // balance updated to 300 (900 - 600)
    expect(calls.balanceUpdates.some((u) => u.balance === 300)).toBe(true);
    // compensating OUT ledger row, original IN untouched (no deletes)
    expect(calls.ledgerInserts).toHaveLength(1);
    expect(calls.ledgerInserts[0]).toMatchObject({
      date: "2026-01-15",
      transactionType: "material_receipt_cancel_reversal",
      referenceId: 88,
      quantityOut: 600,
      quantityIn: 0,
      balanceAfter: 300,
    });
    expect(calls.ledgerInserts[0].notes).toContain("Reason: duplicate entry");
    // one delete = the linked LDO flow reading; ledger rows are never deleted on cancel
    expect(calls.deletes).toBe(1);
  });

  it("REC-02: a legacy null invoice date keeps the original historical entry date on reversal", async () => {
    const receipt = { ...RECEIPT, invoiceDate: null, date: "2025-12-20" };
    const { tx, calls } = stubTx({ receipt, material: MATERIAL, balance: 765, hasReversalRow: false });
    await inst._cancelMaterialReceiptWithinTx(tx, 88, 9, "legacy duplicate");
    expect(calls.ledgerInserts[0].date).toBe("2025-12-20");
  });

  it("REC-02: a same-day duplicate reversal remains on that same invoice date", async () => {
    const receipt = { ...RECEIPT, quantity: 165, invoiceDate: "2026-09-04", date: "2026-09-04" };
    const { tx, calls } = stubTx({ receipt, material: MATERIAL, balance: 765, hasReversalRow: false });
    await inst._cancelMaterialReceiptWithinTx(tx, 88, 9, "duplicate 165 L");
    expect(calls.ledgerInserts[0]).toMatchObject({
      date: "2026-09-04",
      quantityOut: 165,
      balanceAfter: 600,
    });
  });

  it("D: already-cancelled receipt → ReceiptAlreadyCancelledError, no reversal writes", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT, isCancelled: true }, material: MATERIAL, balance: 900, hasReversalRow: true });
    await expect(inst._cancelMaterialReceiptWithinTx(tx, 88, 9, "again")).rejects.toBeInstanceOf(ReceiptAlreadyCancelledError);
    expect(calls.ledgerInserts).toHaveLength(0);
    expect(calls.balanceUpdates).toHaveLength(0);
  });

  it("D (belt & braces): existing reversal ledger row blocks a second reversal even if the flag lied", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT }, material: MATERIAL, balance: 900, hasReversalRow: true });
    await expect(inst._cancelMaterialReceiptWithinTx(tx, 88, 9, "again")).rejects.toBeInstanceOf(ReceiptAlreadyCancelledError);
    expect(calls.ledgerInserts).toHaveLength(0);
  });

  it("E/F/G: +600 received, 500 consumed (balance 100) → cancel BLOCKED, receipt stays active, stock unchanged", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT }, material: MATERIAL, balance: 100, hasReversalRow: false });
    await expect(inst._cancelMaterialReceiptWithinTx(tx, 88, 9, "late cancel")).rejects.toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      payload: { requestedQty: 600, availableQty: 100, shortageQty: 500 },
    });
    expect(calls.balanceUpdates).toHaveLength(0); // no partial reversal
    expect(calls.ledgerInserts).toHaveLength(0);
    expect(calls.receiptUpdates).toHaveLength(0); // not marked cancelled
  });

  it("conversion parity: receipt in supplier UOM reverses the CONVERTED stock quantity (2 Ton × 1000 = 2000 Kg)", async () => {
    const mat = { id: 30, name: "CEMENT", conversionFactor: 1000, conversionFromUom: "Ton", conversionToUom: "Kg" };
    const rec = { ...RECEIPT, id: 91, materialId: 30, quantity: 2, uom: "Ton" };
    const { tx, calls } = stubTx({ receipt: rec, material: mat, balance: 5000, hasReversalRow: false });
    await inst._cancelMaterialReceiptWithinTx(tx, 91, 9, "wrong entry");
    expect(calls.ledgerInserts[0]).toMatchObject({ quantityOut: 2000, balanceAfter: 3000, uom: "Kg" });
  });
});

describe("06M-D hard delete (tx body)", () => {
  it("I: delete ACTIVE receipt → reverses stock exactly once, removes ledger rows and receipt", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT }, material: MATERIAL, balance: 900, hasReversalRow: false });
    const ok = await inst._deleteMaterialReceiptWithinTx(tx, 88);
    expect(ok).toBe(true);
    expect(calls.balanceUpdates.some((u) => u.balance === 300)).toBe(true);
    expect(calls.deletes).toBeGreaterThanOrEqual(2); // ledger rows + receipt (+ldo readings)
  });

  it("H: delete of an ALREADY-CANCELLED receipt does NOT reverse again (net stock effect stays zero)", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT, isCancelled: true }, material: MATERIAL, balance: 300, hasReversalRow: true });
    const ok = await inst._deleteMaterialReceiptWithinTx(tx, 88);
    expect(ok).toBe(true);
    expect(calls.balanceUpdates).toHaveLength(0); // no second reversal
  });

  it("J: delete blocked when reversal stock is unavailable — nothing deleted", async () => {
    const { tx, calls } = stubTx({ receipt: { ...RECEIPT }, material: MATERIAL, balance: 100, hasReversalRow: false });
    await expect(inst._deleteMaterialReceiptWithinTx(tx, 88)).rejects.toBeInstanceOf(InsufficientPlantStockError);
    expect(calls.deletes).toBe(0);
    expect(calls.balanceUpdates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — routes
// ---------------------------------------------------------------------------
let app: express.Express;
beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json({ limit: "5mb" }));
  const server = createServer(app);
  await registerRoutes(server, app);
});

describe("06M-D route mapping", () => {
  it("cancel succeeds → 200, audit stockImpact records automatic reversal", async () => {
    routeFx.cancelError = null;
    const { storage } = await import("../server/storage");
    const res = await request(app).post("/api/plant-module/material-receipts/88/cancel").send({ reason: "duplicate" });
    expect(res.status).toBe(200);
    const audit = (storage as any).logAudit.mock.calls.at(-1)[0];
    expect(audit.stockImpact).toContain("stock reversed automatically");
  });

  it("D: repeated cancel → 409 RECEIPT_ALREADY_CANCELLED, clear message", async () => {
    const mod = (await import("../server/storage")) as any;
    routeFx.cancelError = new mod.ReceiptAlreadyCancelledError(88);
    const res = await request(app).post("/api/plant-module/material-receipts/88/cancel").send({ reason: "again" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_ALREADY_CANCELLED");
    routeFx.cancelError = null;
  });

  it("E (route): consumed-stock cancel → 409 with the §17 blocked-cancel message and figures", async () => {
    const mod = (await import("../server/storage")) as any;
    routeFx.cancelError = new mod.InsufficientPlantStockError({
      material: "DIESEL", source: "material_receipt_cancel", materialId: 12,
      requestedQty: 600, availableQty: 100, shortageQty: 500,
    });
    const res = await request(app).post("/api/plant-module/material-receipts/88/cancel").send({ reason: "late" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_REVERSAL_STOCK_UNAVAILABLE");
    expect(res.body.message).toContain("CANNOT CANCEL MATERIAL RECEIPT");
    expect(res.body.message).toContain("600");
    expect(res.body.message).toContain("100");
    expect(res.body.availableQty).toBe(100);
    routeFx.cancelError = null;
  });

  it("J (route): blocked hard delete → 409 with blocked-delete message", async () => {
    const mod = (await import("../server/storage")) as any;
    routeFx.deleteError = new mod.InsufficientPlantStockError({
      material: "DIESEL", source: "material_receipt_delete", materialId: 12,
      requestedQty: 600, availableQty: 100, shortageQty: 500,
    });
    const res = await request(app).delete("/api/plant-module/material-receipts/88");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_REVERSAL_STOCK_UNAVAILABLE");
    expect(res.body.message).toContain("CANNOT DELETE MATERIAL RECEIPT");
    routeFx.deleteError = null;
  });

  it("cancelled receipt is terminal: PUT edit → 409, no stock re-application possible", async () => {
    const { storage } = await import("../server/storage");
    (storage as any).getMaterialReceipt.mockResolvedValueOnce({ id: 88, materialId: 12, quantity: 600, uom: "Liters", isCancelled: true, documentStatus: "draft" });
    const res = await request(app).put("/api/plant-module/material-receipts/88").send({ quantity: 700 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_ALREADY_CANCELLED");
    expect((storage as any).updateMaterialReceipt).not.toHaveBeenCalled();
  });

  it("delete succeeds → 204 (admin-only rule untouched)", async () => {
    routeFx.deleteError = null;
    const res = await request(app).delete("/api/plant-module/material-receipts/88");
    expect(res.status).toBe(204);
  });
});
