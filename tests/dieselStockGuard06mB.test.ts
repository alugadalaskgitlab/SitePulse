/**
 * Batch 06M-B — Diesel plant-stock sufficiency guard.
 *
 * Layer 1: the shared row-locked balance helper (_adjustStockBalance) with the
 * new guard option — sufficiency maths, structured shortage payload, floor
 * behavior, net-additional edit semantics, FOR UPDATE concurrency seam.
 * Uses a stub tx so the maths are covered without a live DB.
 *
 * Layer 2: route mapping — a thrown InsufficientPlantStockError becomes a 409
 * with the structured payload on the DPR create/draft/submit and Equipment
 * Usage create/update routes (real handlers, mocked storage, 028B pattern).
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

// ---------------------------------------------------------------------------
// Layer 2 mocks must be registered before the imports they intercept.
// ---------------------------------------------------------------------------
const fx: { role: string } = { role: "admin" };

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-user", isAdmin: fx.role === "admin", isActive: true };
    req.authPermissions = {};
    req.session = { role: fx.role, username: "test-user", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/storage")>();
  const shortage = () =>
    new actual.InsufficientPlantStockError({
      material: "Diesel",
      source: "plant_stock",
      materialId: 12,
      requestedQty: 200,
      availableQty: 100,
      shortageQty: 100,
    });
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.createEquipmentUsage = vi.fn(async () => { throw shortage(); });
  methods.updateEquipmentUsage = vi.fn(async () => { throw shortage(); });
  methods.createMaterialIssue = vi.fn(async () => { throw shortage(); });
  methods.updateMaterialIssue = vi.fn(async () => { throw shortage(); });
  methods.createIrnIssueVoucher = vi.fn(async () => { throw shortage(); });
  methods.reconcileEquipmentUsageLedger = vi.fn(async () => { throw shortage(); });
  methods.updateMaterialReturn = vi.fn(async () => { throw shortage(); });
  methods.deleteMaterialReturn = vi.fn(async () => { throw shortage(); });
  methods.updateMaterialOpeningStock = vi.fn(async () => { throw shortage(); });
  methods.deleteMaterialOpeningStock = vi.fn(async () => { throw shortage(); });
  methods.getAllPlantMaterials = vi.fn(async () => [
    { id: 12, name: "DIESEL", isActive: 1 },
    { id: 30, name: "20MM AGGREGATE", isActive: 1 },
  ]);
  methods.postStockCorrection = vi.fn(async (data: any) => ({ adjustment: data.physicalQty, newBalance: data.physicalQty }));
  methods.reconcileStockBalancesFromLedger = vi.fn(async () => ({ updated: 1, created: 0, errors: 0 }));
  methods.reprocessRmcMissedDeductions = vi.fn(async () => ({ batchesScanned: 0, deductionsApplied: [], warnings: [] }));
  methods.rebuildDispatchLedgerForTemplate = vi.fn(async () => ({ dispatches: 0, errors: [] }));
  methods.createTruckDispatchWithStockDeduction = vi.fn(async () => {
    throw new actual.StockShortageError({
      needsConfirmation: true,
      ownerPartyId: 2,
      ownerPartyName: "Owner",
      fallbackPartyId: 1,
      fallbackPartyName: "HLC",
      shortages: [{ materialId: 30, materialName: "20MM", required: 20, available: 10, shortfall: 10, uom: "Ton" }],
    });
  });
  methods.executeLedgerReassignment = vi.fn(async () => ({ moved: 1, totalIn: 0, totalOut: 1, reconciled: { updated: 2, created: 0, errors: 0 } }));
  methods.createStockTransfer = vi.fn(async () => ({ outEntry: { id: 1 }, inEntry: { id: 2 }, reconciled: { updated: 2, created: 0, errors: 0 } }));
  return { ...actual, storage: storageProxy };
});

// ---------------------------------------------------------------------------
// Layer 1 — the shared guard helper, tested directly with a stub tx.
// ---------------------------------------------------------------------------
let InsufficientPlantStockError: any;
let DieselReceiptExceedsRemainingError: any;
let DatabaseStorage: any;
let dieselStockSufficiencyGuard: any;
let isPlantStockEquipmentUsage: any;
let dprDieselMigrationNetDelta: any;
let isDprDieselMigrationCandidate: any;
let selectCanonicalDieselMaterial: any;
let stockCreditCorrectionDeltas: any;
let ldoTankIssueBackfillGuard: any;
let isLdoRepairMaterial: any;
let stockLedgerReassignmentDeltas: any;
let assertValidDieselPhysicalStock: any;
let assertNonnegativeDieselLedgerNet: any;
let selectCanonicalLdoMaterial: any;
let isIntendedSixMmDownMaterial: any;
let isVerifiedNonFuelCleanupMaterial: any;
let assertValidStockTransferQuantity: any;
let InvalidStockTransferQuantityError: any;

/** Stub tx exposing a stock_balances row with the given balance. */
function stubTx(balance: number | null) {
  const calls: { sqlTexts: string[]; updates: any[] } = { sqlTexts: [], updates: [] };
  const tx = {
    execute: vi.fn(async (query: any) => {
      const text = query?.queryChunks ? JSON.stringify(query.queryChunks.map((c: any) => c?.value ?? "")) : String(query);
      calls.sqlTexts.push(text);
      return { rows: balance === null ? [] : [{ id: 1, balance, uom: "Liters" }] };
    }),
    update: vi.fn(() => ({ set: (v: any) => ({ where: async () => { calls.updates.push(v); } }) })),
    insert: vi.fn(() => ({ values: (v: any) => ({ returning: async () => { calls.updates.push(v); return [{ id: 2, ...v }]; } }) })),
  };
  return { tx, calls };
}

const GUARD = { material: "Diesel", source: "plant_stock" };

async function adjust(storageInst: any, balance: number | null, delta: number, guarded = true) {
  const { tx, calls } = stubTx(balance);
  const result = await storageInst._adjustStockBalance(tx, 12, 3, delta, "Liters", guarded ? GUARD : undefined);
  return { result, calls };
}

beforeAll(async () => {
  const mod = await import("../server/storage");
  InsufficientPlantStockError = mod.InsufficientPlantStockError;
  DieselReceiptExceedsRemainingError = mod.DieselReceiptExceedsRemainingError;
  dieselStockSufficiencyGuard = mod.dieselStockSufficiencyGuard;
  isPlantStockEquipmentUsage = mod.isPlantStockEquipmentUsage;
  dprDieselMigrationNetDelta = mod.dprDieselMigrationNetDelta;
  isDprDieselMigrationCandidate = mod.isDprDieselMigrationCandidate;
  selectCanonicalDieselMaterial = mod.selectCanonicalDieselMaterial;
  stockCreditCorrectionDeltas = mod.stockCreditCorrectionDeltas;
  ldoTankIssueBackfillGuard = mod.ldoTankIssueBackfillGuard;
  isLdoRepairMaterial = mod.isLdoRepairMaterial;
  stockLedgerReassignmentDeltas = mod.stockLedgerReassignmentDeltas;
  assertValidDieselPhysicalStock = mod.assertValidDieselPhysicalStock;
  assertNonnegativeDieselLedgerNet = mod.assertNonnegativeDieselLedgerNet;
  selectCanonicalLdoMaterial = mod.selectCanonicalLdoMaterial;
  isIntendedSixMmDownMaterial = mod.isIntendedSixMmDownMaterial;
  isVerifiedNonFuelCleanupMaterial = mod.isVerifiedNonFuelCleanupMaterial;
  assertValidStockTransferQuantity = mod.assertValidStockTransferQuantity;
  InvalidStockTransferQuantityError = mod.InvalidStockTransferQuantityError;
  DatabaseStorage = (mod.storage && Object.getPrototypeOf(mod.storage)) || null;
});

describe("06M-B shared sufficiency guard (_adjustStockBalance)", () => {
  // We instantiate the real class prototype's method against a stub tx.
  let inst: any;
  beforeAll(async () => {
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    inst = RealClass ? Object.create(RealClass.prototype) : null;
  });

  it("A: 500 L available, issue 200 L → allowed, balance 300 L", async () => {
    const { result } = await adjust(inst, 500, -200);
    expect(result.newBalance).toBe(300);
  });

  it("B/C: 100 L available, issue 200 L → blocked with structured shortage (required 200, available 100, short 100)", async () => {
    await expect(adjust(inst, 100, -200)).rejects.toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      payload: { material: "Diesel", source: "plant_stock", requestedQty: 200, availableQty: 100, shortageQty: 100 },
    });
  });

  it("B: blocked issue writes NO partial deduction (no update/insert executed)", async () => {
    const { tx, calls } = stubTx(100);
    await expect(inst._adjustStockBalance(tx, 12, 3, -200, "Liters", GUARD)).rejects.toBeInstanceOf(InsufficientPlantStockError);
    expect(calls.updates).toHaveLength(0);
  });

  it("missing balance row + guarded issue → blocked (available 0), not a negative insert", async () => {
    await expect(adjust(inst, null, -50)).rejects.toMatchObject({
      payload: { requestedQty: 50, availableQty: 0, shortageQty: 50 },
    });
  });

  it("D/E: receipt (+300) then retry of the same 200 L issue succeeds", async () => {
    const receipt = await adjust(inst, 100, 300); // receipts are never blocked
    expect(receipt.result.newBalance).toBe(400);
    const retry = await adjust(inst, 400, -200);
    expect(retry.result.newBalance).toBe(200);
  });

  it("J: edit 100→120 validates only the net additional 20 L (allowed when 50 L available)", async () => {
    // equipment-usage edit path passes -dieselDiff = -20, not -120
    const { result } = await adjust(inst, 50, -20);
    expect(result.newBalance).toBe(30);
  });

  it("I: restores/reversals (positive delta) are never guarded even below-zero history", async () => {
    const { result } = await adjust(inst, -30, 100); // legacy negative balance healing
    expect(result.newBalance).toBe(70);
  });

  it("G/H: unguarded callers (direct purchase has none; other materials) keep legacy behavior — may go negative", async () => {
    const { result } = await adjust(inst, 100, -200, false);
    expect(result.newBalance).toBe(-100);
  });

  it("K: sufficiency is decided on the FOR UPDATE-locked row (server-side, concurrency-safe)", async () => {
    const { calls } = await adjust(inst, 500, -200);
    expect(calls.sqlTexts.some((t) => t.includes("FOR UPDATE"))).toBe(true);
  });
});

describe("Task #1433 receipt remaining-quantity storage lock", () => {
  let inst: any;
  beforeAll(async () => {
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    inst = Object.create(RealClass.prototype);
  });

  function receiptQtyTx(purchased: number, received: number) {
    const sqlTexts: string[] = [];
    let queryNumber = 0;
    const tx = {
      execute: vi.fn(async (query: any) => {
        const flatten = (chunk: any): string =>
          typeof chunk?.value === "string" ? chunk.value :
          Array.isArray(chunk?.value) ? chunk.value.map(flatten).join("") :
          typeof chunk === "string" ? chunk :
          Array.isArray(chunk?.queryChunks) ? chunk.queryChunks.map(flatten).join("") : "";
        const text = query?.queryChunks ? query.queryChunks.map(flatten).join("") : String(query);
        sqlTexts.push(text);
        queryNumber++;
        return queryNumber === 1
          ? { rows: [{ id: 77, status: "purchased", qty_purchased: purchased }] }
          : { rows: [{ received }] };
      }),
    };
    return { tx, sqlTexts };
  }

  it("locks the purchased requirement and sums only valid linked receipt quantities", async () => {
    const { tx, sqlTexts } = receiptQtyTx(600, 570);
    await inst._assertDieselReceiptWithinPurchasedQuantity(tx, 77, 30);
    expect(sqlTexts[0]).toContain("FOR UPDATE");
    expect(sqlTexts[1]).toContain("COALESCE(SUM(quantity), 0)");
    expect(sqlTexts[1]).toContain("is_cancelled");
    expect(sqlTexts[1]).toContain("is_deleted");
  });

  it("throws a structured overrun error from the transaction after calculating remaining quantity", async () => {
    const { tx } = receiptQtyTx(600, 570);
    await expect(inst._assertDieselReceiptWithinPurchasedQuantity(tx, 77, 40)).rejects.toBeInstanceOf(DieselReceiptExceedsRemainingError);
    await expect(inst._assertDieselReceiptWithinPurchasedQuantity(receiptQtyTx(600, 570).tx, 77, 40)).rejects.toMatchObject({
      code: "DIESEL_RECEIPT_EXCEEDS_REMAINING",
      payload: { requestedQty: 40, remainingQty: 30, excessQty: 10, linkedDieselRequirementId: 77 },
    });
  });

  it("excludes the receipt being edited from the locked received sum", async () => {
    const { tx, sqlTexts } = receiptQtyTx(600, 570);
    // The stubbed 570 is the sum AFTER excluding receipt #501; it leaves 30 L
    // available, so a correction to 30 L succeeds.
    await inst._assertDieselReceiptWithinPurchasedQuantity(tx, 77, 30, 501);
    expect(sqlTexts[1]).toContain("id <>");
  });
});

describe("Task #1433 guarded stock-credit corrections", () => {
  let inst: any;
  beforeAll(async () => {
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    inst = Object.create(RealClass.prototype);
  });

  it("uses one net delta for a same-bucket receipt edit, avoiding a false full-reversal failure", async () => {
    expect(stockCreditCorrectionDeltas(
      { materialId: 12, partyId: 1, quantity: 100 },
      { materialId: 12, partyId: 1, quantity: 120 },
    )).toEqual([{ materialId: 12, partyId: 1, delta: 20 }]);
    const result = await adjust(inst, 5, 20);
    expect(result.result.newBalance).toBe(25);
    expect(result.calls.updates).toHaveLength(1);
  });

  it("blocks a consumed same-bucket credit reduction atomically with no balance write", async () => {
    const [change] = stockCreditCorrectionDeltas(
      { materialId: 12, partyId: 1, quantity: 100 },
      { materialId: 12, partyId: 1, quantity: 80 },
    );
    const { tx, calls } = stubTx(10);
    await expect(inst._adjustStockBalance(tx, change.materialId, change.partyId, change.delta, "Liters", GUARD))
      .rejects.toMatchObject({ payload: { requestedQty: 20, availableQty: 10, shortageQty: 10 } });
    expect(calls.updates).toHaveLength(0);
  });

  it("uses guarded old-bucket reversal plus new-bucket credit for bucket changes", () => {
    expect(stockCreditCorrectionDeltas(
      { materialId: 12, partyId: 1, quantity: 100 },
      { materialId: 12, partyId: 2, quantity: 100 },
    )).toEqual([
      { materialId: 12, partyId: 1, delta: -100 },
      { materialId: 12, partyId: 2, delta: 100 },
    ]);
  });

  it("preserves unguarded non-Diesel credit-reduction behavior", async () => {
    expect(dieselStockSufficiencyGuard("20MM AGGREGATE", "material_return_delete")).toBeUndefined();
    const result = await adjust(inst, 10, -20, false);
    expect(result.result.newBalance).toBe(-10);
  });
});

describe("Task #1433 tank-issue backfill stock guard", () => {
  let inst: any;
  beforeAll(async () => {
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    inst = Object.create(RealClass.prototype);
  });

  it.each(["DIESEL", " hsd "])("blocks insufficient exact %s stock without any balance write", async (name) => {
    const { tx, calls } = stubTx(10);
    await expect(inst._applyLdoTankIssueBackfillDeduction(
      tx, { material_id: 12, material_name: name, is_plant_common: false, party_id: 1 }, 20, "Liters",
    )).rejects.toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      payload: { source: "ldo_tank_issue_backfill", requestedQty: 20, availableQty: 10, shortageQty: 10 },
    });
    expect(calls.updates).toHaveLength(0);
  });

  it.each(["LDO", "FURNACE OIL", null])("preserves unguarded legacy behavior for %s", async (name) => {
    expect(ldoTankIssueBackfillGuard(name)).toBeUndefined();
    const { tx, calls } = stubTx(10);
    const newBalance = await inst._applyLdoTankIssueBackfillDeduction(
      tx, { material_id: 9, material_name: name, is_plant_common: false, party_id: 1 }, 20, "Liters",
    );
    expect(newBalance).toBe(-10);
    expect(calls.updates).toHaveLength(1);
  });

  it("locks the source issue before the ledger idempotency recheck", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async backfillLdoTankIssueLedger"), src.indexOf("async fixLdoDataIssues"));
    const sourceLock = method.indexOf("SELECT id FROM material_issues");
    const ledgerRecheck = method.indexOf("SELECT id FROM stock_ledger");
    expect(sourceLock).toBeGreaterThan(0);
    expect(method.slice(sourceLock, ledgerRecheck)).toContain("FOR UPDATE");
    expect(ledgerRecheck).toBeGreaterThan(sourceLock);
  });
});

describe("Task #1433 final startup-writer audit", () => {
  it("strictly limits the LDO repair to exact LDO, excluding DIESEL and HSD", () => {
    expect(isLdoRepairMaterial("LDO")).toBe(true);
    expect(isLdoRepairMaterial(" ldo ")).toBe(true);
    expect(isLdoRepairMaterial("DIESEL")).toBe(false);
    expect(isLdoRepairMaterial("HSD")).toBe(false);
    expect(isLdoRepairMaterial("LDO OIL")).toBe(false);
  });

  it("models ledger reassignment as source restoration plus guarded target deduction", async () => {
    expect(stockLedgerReassignmentDeltas(63)).toEqual({ restoreSource: 63, deductTarget: -63 });
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    const inst = Object.create(RealClass.prototype);
    const { tx, calls } = stubTx(50);
    await expect(inst._adjustStockBalance(
      tx, 12, 1, -63, "Liters",
      dieselStockSufficiencyGuard("DIESEL", "bad_stock_ledger_reassignment"),
    )).rejects.toMatchObject({
      payload: { requestedQty: 63, availableQty: 50, shortageQty: 13 },
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("uses actual ledger buckets and contains no hardcoded stock-balance update in the one-off repair", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async fixBadStockBalanceEntries"), src.indexOf("// ====== MIX ESTIMATES"));
    expect(method).toContain("FOR UPDATE");
    expect(method).toContain("badOpening.material_id");
    expect(method).toContain("misplaced.material_id");
    expect(method).not.toContain("WHERE id = 1");
    expect(method).not.toContain("stockBalances.id, 12");
    expect(method).not.toContain("stockBalances.id, 13");
  });
});

describe("Task #1433 physical correction and ledger-reconcile boundaries", () => {
  it("rejects negative and non-finite exact Diesel/HSD physical stock at the storage validation boundary", () => {
    expect(() => assertValidDieselPhysicalStock("DIESEL", -1)).toThrowError(expect.objectContaining({
      code: "INVALID_DIESEL_PHYSICAL_STOCK",
    }));
    expect(() => assertValidDieselPhysicalStock("HSD", Number.NaN)).toThrowError(expect.objectContaining({
      code: "INVALID_DIESEL_PHYSICAL_STOCK",
    }));
    expect(() => assertValidDieselPhysicalStock("20MM AGGREGATE", -1)).not.toThrow();
  });

  it("blocks a negative Diesel/HSD ledger net with total in/out details while preserving other materials", () => {
    expect(() => assertNonnegativeDieselLedgerNet({
      materialName: "HSD", materialId: 12, partyId: 1, totalIn: 100, totalOut: 125, balance: -25,
    })).toThrowError(expect.objectContaining({
      code: "INSUFFICIENT_PLANT_STOCK",
      payload: expect.objectContaining({ requestedQty: 125, availableQty: 100, shortageQty: 25 }),
    }));
    expect(() => assertNonnegativeDieselLedgerNet({
      materialName: "DIESEL", materialId: 12, partyId: 1, totalIn: 125, totalOut: 100, balance: 25,
    })).not.toThrow();
    expect(() => assertNonnegativeDieselLedgerNet({
      materialName: "AGGREGATE", materialId: 30, partyId: 1, totalIn: 100, totalOut: 125, balance: -25,
    })).not.toThrow();
  });

  it("preflights guarded fuel buckets before any reconciliation balance write", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async reconcileStockBalancesFromLedger"), src.indexOf("async applyLedgerGapFix427"));
    expect(method.indexOf("assertNonnegativeDieselLedgerNet")).toBeGreaterThan(0);
    expect(method.indexOf("assertNonnegativeDieselLedgerNet")).toBeLessThan(method.indexOf("await tx.update(stockBalances)"));
    expect(method).toContain("db.transaction(reconcile)");
  });

  it("validates Diesel physical quantity inside storage before any balance or ledger write", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async postStockCorrection");
    const method = src.slice(start, src.indexOf("// ── Physical Stock Reconciliation", start));
    const validation = method.indexOf("assertValidDieselPhysicalStock");
    expect(validation).toBeGreaterThan(0);
    expect(validation).toBeLessThan(method.indexOf("await tx.update(stockBalances)"));
    expect(validation).toBeLessThan(method.indexOf("await tx.insert(stockLedger)"));
  });
});

describe("Task #1433 dispatch and RMC deduction behavior", () => {
  let inst: any;
  beforeAll(async () => {
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    inst = Object.create(RealClass.prototype);
  });

  it.each(["DIESEL", " hsd "])("blocks insufficient %s dispatch components without a write", async (name) => {
    const { tx, calls } = stubTx(10);
    await expect(inst._deductDispatchComponentStock(tx, 12, 1, 20, "Liters", name))
      .rejects.toMatchObject({ payload: { source: "truck_dispatch", requestedQty: 20, availableQty: 10 } });
    expect(calls.updates).toHaveLength(0);
  });

  it("preserves non-Diesel dispatch component deduction behavior", async () => {
    const { tx, calls } = stubTx(10);
    expect(await inst._deductDispatchComponentStock(tx, 30, 1, 20, "Ton", "20MM AGGREGATE")).toBe(-10);
    expect(calls.updates).toHaveLength(1);
  });

  it.each([["DIESEL", "rmc_batch_create_or_update"], ["HSD", "rmc_batch_reprocess"]])
  ("blocks insufficient %s RMC deductions with source %s", async (name, source) => {
    const { tx, calls } = stubTx(10);
    await expect(inst._adjustRmcMaterialStock(tx, { id: 12, name }, -20, "Ton", source))
      .rejects.toMatchObject({ payload: { source, requestedQty: 20, availableQty: 10 } });
    expect(calls.updates).toHaveLength(0);
  });

  it("preserves non-Diesel RMC deduction behavior", async () => {
    const { tx, calls } = stubTx(10);
    expect(await inst._adjustRmcMaterialStock(tx, { id: 30, name: "CEMENT" }, -20, "Ton", "rmc_batch_reprocess")).toBe(-10);
    expect(calls.updates).toHaveLength(1);
  });

  it("wires the guarded seams into dispatch, normal RMC, and RMC reprocess", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const dispatch = src.slice(src.indexOf("const deductFromSource"), src.indexOf("// Resolve materials we need"));
    expect(dispatch).toContain("_deductDispatchComponentStock");
    const rmc = src.slice(src.indexOf("private async _deductRmcMaterials"), src.indexOf("async deleteRmcBatchRecord"));
    expect(rmc).toContain("rmc_batch_create_or_update");
    expect(rmc).toContain("rmc_batch_reprocess");
  });
});

describe("Task #1433 atomic dispatch rebuild and LDO identity", () => {
  it("selects exact LDO dynamically and never treats id 9 DIESEL/HSD as LDO", () => {
    expect(selectCanonicalLdoMaterial([{ id: 9, name: "DIESEL" }, { id: 10, name: "LDO" }])?.id).toBe(10);
    expect(selectCanonicalLdoMaterial([{ id: 9, name: "HSD" }])).toBeUndefined();
    expect(selectCanonicalLdoMaterial([{ id: 9, name: "LDO OIL" }])).toBeUndefined();
    expect(selectCanonicalLdoMaterial([{ id: 9, name: " ldo " }])?.id).toBe(9);
  });

  it("keeps all rebuild ledger writes and guarded reconciliation in one rollback boundary", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async rebuildDispatchLedgerForTemplate"), src.indexOf("async recalculateAllDispatchConsumption"));
    const atomicStart = method.indexOf("await db.transaction");
    const guardedReconcile = method.indexOf("reconcileStockBalancesFromLedger(tx)");
    const transactionEnd = method.indexOf("Ancillary derived fields");
    expect(atomicStart).toBeGreaterThan(0);
    expect(guardedReconcile).toBeGreaterThan(atomicStart);
    expect(guardedReconcile).toBeLessThan(transactionEnd);
    const callbackBody = method.slice(method.indexOf("const qdb = tx") + "const qdb = tx".length, transactionEnd);
    expect(callbackBody).not.toMatch(/(^|[^\w])db\./m);
    expect(callbackBody).toContain("await qdb.");
  });

  it("contains no executable material-id 9 assumption in LDO startup writers", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async fixLdoDataIssues");
    const end = src.indexOf("// ── One-time: stamp tank_number=1", start);
    const repairs = src.slice(start, end);
    expect(repairs).toContain("UPPER(TRIM(${plantMaterials.name})) = 'LDO'");
    expect(repairs).not.toMatch(/material_id\s*=\s*9|VALUES\s*\([^)]*,\s*9\s*,/);
    expect(repairs).toContain("exact LDO material not found, skipping");
  });
});

describe("Task #1433 remaining public and maintenance writers", () => {
  it("recognizes only the intended normalized 6MM DOWN identity", () => {
    expect(isIntendedSixMmDownMaterial("6MM Down")).toBe(true);
    expect(isIntendedSixMmDownMaterial(" 6mm   down ")).toBe(true);
    expect(isIntendedSixMmDownMaterial("DIESEL")).toBe(false);
    expect(isIntendedSixMmDownMaterial("HSD")).toBe(false);
    expect(isIntendedSixMmDownMaterial("6MM DOWN AGGREGATE")).toBe(false);
  });

  it("identity-checks material ID 3 before any ledger-gap mutation", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async applyLedgerGapFix427"), src.indexOf("async migrateOrphanStockToHLC"));
    const identity = method.indexOf("isIntendedSixMmDownMaterial");
    expect(identity).toBeGreaterThan(0);
    expect(identity).toBeLessThan(method.indexOf("await db.insert(stockLedger)"));
    expect(identity).toBeLessThan(method.indexOf("await db.update(stockLedger)"));
  });

  it("routes public balance adjustment through the guarded locked helper", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async updateStockBalance");
    const method = src.slice(start, src.indexOf("// Stock Ledger", start));
    expect(method).toContain("return db.transaction");
    expect(method).toContain("dieselStockSufficiencyGuard(material.name, \"update_stock_balance\")");
    expect(method).toContain("this._adjustStockBalance");
    expect(method).not.toMatch(/db\.(?:update|insert)\(stockBalances\)/);
  });

  it("keeps orphan ledger reassignment and guarded reconcile in one transaction", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async migrateOrphanStockToHLC"), src.indexOf("async cleanupSupersededDprDieselLedger"));
    const qdbStart = method.indexOf("const qdb = tx");
    const reconcile = method.indexOf("reconcileStockBalancesFromLedger(tx)");
    const callbackEnd = method.indexOf("});", reconcile);
    expect(qdbStart).toBeGreaterThan(0);
    expect(reconcile).toBeGreaterThan(qdbStart);
    expect(method.slice(qdbStart, callbackEnd)).not.toMatch(/(^|[^\w])db\./m);
    expect(method).toContain("if (err instanceof InsufficientPlantStockError) throw err");
  });

  it("excludes exact Diesel/HSD and unverified materials from orphan-adjustment startup cleanup", () => {
    const src = require("fs").readFileSync("server/index.ts", "utf8");
    const marker = src.indexOf("fixOrphanAdjustmentLedger");
    const statementStart = src.lastIndexOf("UPDATE stock_ledger", marker);
    const statement = src.slice(statementStart, marker);
    expect(statementStart).toBeGreaterThan(0);
    expect(statement).toContain("EXISTS (");
    expect(statement).toContain("pm.id = stock_ledger.material_id");
    expect(statement).toContain("UPPER(TRIM(pm.name)) NOT IN ('DIESEL', 'HSD')");
    expect(statement.indexOf("UPPER(TRIM(pm.name))")).toBeLessThan(statement.indexOf("`);"));
  });

  it("keeps the Task #427 script as a secured storage delegation only", () => {
    const src = require("fs").readFileSync("scripts/fix-ledger-gap-427.ts", "utf8");
    expect(src).toContain('import { storage } from "../server/storage"');
    expect(src).toContain("storage.applyLedgerGapFix427()");
    expect(src).not.toMatch(/from ["']\.\.\/server\/db["']/);
    expect(src).not.toMatch(/\b(?:stockLedger|stockBalances)\b/);
    expect(src).not.toMatch(/\bdb\.(?:select|insert|update|delete|execute)\b/);
    expect(src).not.toMatch(/\bmaterialId\s*:\s*\d+|material_id\s*=\s*\d+/);
  });
});

describe("Task #1433 note-pattern reversal cleanup identity", () => {
  it("keeps verified nonfuel eligible while excluding exact fuel and missing identity", () => {
    expect(isVerifiedNonFuelCleanupMaterial("20MM AGGREGATE")).toBe(true);
    expect(isVerifiedNonFuelCleanupMaterial("LDO")).toBe(true);
    expect(isVerifiedNonFuelCleanupMaterial(" DIESEL ")).toBe(false);
    expect(isVerifiedNonFuelCleanupMaterial("hsd")).toBe(false);
    expect(isVerifiedNonFuelCleanupMaterial(null)).toBe(false);
    expect(isVerifiedNonFuelCleanupMaterial("")).toBe(false);
  });

  it.each([
    ["async reconcileEquipmentUsageLedger", "async purgeOrphanedDeletionReversals"],
    ["async purgeOrphanedDeletionReversals", "// Reconcile stock balances from ledger entries"],
  ])("requires verified nonfuel identity in selection and deletion for %s", (startMarker, endMarker) => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf(startMarker), src.indexOf(endMarker, src.indexOf(startMarker)));
    expect(method).toContain(".innerJoin(plantMaterials");
    expect(method).toContain("UPPER(TRIM(${plantMaterials.name})) NOT IN ('DIESEL', 'HSD')");
    expect(method).toContain("isVerifiedNonFuelCleanupMaterial");
    expect(method).toContain("EXISTS (");
    expect(method).toContain("UPPER(TRIM(pm.name)) NOT IN ('DIESEL', 'HSD')");
  });
});

describe("Task #1433 generic ledger mutation boundaries", () => {
  it("removes the unused public raw ledger insertion API", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    expect(src).not.toContain("addStockLedgerEntry(");
  });

  it("keeps transfer balances, both ledger rows, recompute, and reconcile in one transaction", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async createStockTransfer"), src.indexOf("// Rewrites the running", src.indexOf("async createStockTransfer")));
    expect(method).toContain("return db.transaction");
    expect(method).toContain('dieselStockSufficiencyGuard(material.name, "stock_transfer")');
    expect(method).toContain("balanceAfter: String(source.newBalance)");
    expect(method).toContain("balanceAfter: String(destination.newBalance)");
    expect(method).toContain("reconcileStockBalancesFromLedger(tx)");
    expect(method.slice(method.indexOf("async (tx) => {") + "async (tx) => {".length)).not.toMatch(/(^|[^\w])db\./m);
  });

  it("rejects invalid transfer quantities before opening the transaction", () => {
    for (const quantity of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertValidStockTransferQuantity(quantity)).toThrowError(expect.objectContaining({
        code: "INVALID_STOCK_TRANSFER_QUANTITY",
      }));
    }
    expect(() => assertValidStockTransferQuantity(0.001)).not.toThrow();
    expect(new InvalidStockTransferQuantityError(-1).message).toBe(
      "Stock transfer quantity must be a finite number greater than zero",
    );

    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async createStockTransfer");
    const method = src.slice(start, src.indexOf("// Rewrites the running", start));
    expect(method.indexOf("assertValidStockTransferQuantity(quantity)")).toBeGreaterThan(0);
    expect(method.indexOf("assertValidStockTransferQuantity(quantity)")).toBeLessThan(method.indexOf("db.transaction"));
  });

  it("keeps ledger reassignment, balance-after recompute, and guarded reconcile in one transaction", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const method = src.slice(src.indexOf("async executeLedgerReassignment"), src.indexOf("// Create a forward inter-party", src.indexOf("async executeLedgerReassignment")));
    expect(method).toContain("return db.transaction");
    expect(method).toContain("await qdb.update(stockLedger)");
    expect(method).toContain("UPDATE stock_ledger sl SET balance_after");
    expect(method).toContain("reconcileStockBalancesFromLedger(tx)");
    const callback = method.slice(method.indexOf("const qdb = tx"));
    expect(callback).not.toMatch(/(^|[^\w])db\./m);
  });

  it("models fuel credit/out reassignment conflicts as blocked negative destination/source buckets", () => {
    for (const data of [
      { materialName: "DIESEL", materialId: 12, partyId: 1, totalIn: 0, totalOut: 20, balance: -20 },
      { materialName: "HSD", materialId: 12, partyId: 2, totalIn: 5, totalOut: 10, balance: -5 },
    ]) {
      expect(() => assertNonnegativeDieselLedgerNet(data)).toThrowError(expect.objectContaining({
        code: "INSUFFICIENT_PLANT_STOCK",
      }));
    }
  });
});

describe("Task #1433 DPR invalid-source route audit", () => {
  it.each([
    ['app.patch("/api/dprs/:id/draft"', 'app.post("/api/dprs/:id/submit"'],
    ['app.post("/api/dprs/:id/submit"', "// Export all data"],
    ['app.post("/api/dprs/:id/version"', 'app.post("/api/dprs/:id/clone"'],
    ['app.post("/api/dprs/:id/clone"', 'app.delete("/api/dprs/:id"'],
  ])("maps InvalidDieselSourceError in mutation block %s", (startMarker, endMarker) => {
    const src = require("fs").readFileSync("server/routes.ts", "utf8");
    const start = src.indexOf(startMarker);
    const block = src.slice(start, src.indexOf(endMarker, start));
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("err instanceof InvalidDieselSourceError");
    expect(block).toContain("res.status(400)");
    expect(block).toContain("field: err.field");
  });
});

describe("Task #1433 secured 6MM Down UOM startup migration", () => {
  it("rejects a Diesel/HSD row 19 identity before either migration update", () => {
    expect(isIntendedSixMmDownMaterial("DIESEL")).toBe(false);
    expect(isIntendedSixMmDownMaterial(" HSD ")).toBe(false);

    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async migrate6mmDownUomFix");
    const method = src.slice(start, src.indexOf("async getBitumenTankBalances", start));
    const identityGuard = method.indexOf("!isIntendedSixMmDownMaterial(ledgerEntry.materialName)");
    const firstMutation = method.indexOf("await tx.update(stockLedger)");
    expect(identityGuard).toBeGreaterThan(0);
    expect(identityGuard).toBeLessThan(firstMutation);
  });

  it("requires row 2 to match the same verified material and stale CFT state before mutation", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async migrate6mmDownUomFix");
    const method = src.slice(start, src.indexOf("async getBitumenTankBalances", start));
    const openingGuard = method.indexOf("openingEntry.materialId !== ledgerEntry.materialId");
    const firstMutation = method.indexOf("await tx.update(stockLedger)");
    expect(method).toContain('openingEntry.uom?.trim().toUpperCase() !== "CFT"');
    expect(method).toContain("Number(openingEntry.quantity) < 9449");
    expect(openingGuard).toBeGreaterThan(0);
    expect(openingGuard).toBeLessThan(firstMutation);
  });

  it("keeps both updates, balance-after recompute, and guarded reconciliation atomic", () => {
    const src = require("fs").readFileSync("server/storage.ts", "utf8");
    const start = src.indexOf("async migrate6mmDownUomFix");
    const method = src.slice(start, src.indexOf("async getBitumenTankBalances", start));
    expect(method).toContain("return db.transaction(async (tx)");
    expect(method).toContain("await tx.update(stockLedger)");
    expect(method).toContain("await tx.update(materialOpeningStocks)");
    expect(method).toContain("await tx.execute(sql`");
    expect(method).toContain("reconcileStockBalancesFromLedger(tx)");
    const callback = method.slice(method.indexOf("async (tx) => {") + "async (tx) => {".length);
    expect(callback).not.toMatch(/(^|[^\w])db\./m);
    expect(method).not.toContain("recomputeBalanceAfterForMaterial(3)");
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — route mapping to 409 structured payload.
// ---------------------------------------------------------------------------
let app: express.Express;
let storage: any;

beforeAll(async () => {
  process.env.ENABLE_RMC = "true";
  ({ storage } = await import("../server/storage"));
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json({ limit: "5mb" }));
  const server = createServer(app);
  await registerRoutes(server, app);
});

describe("06M-B route mapping (Equipment & Fleet Usage)", () => {
  it("F: POST equipment-usage surfaces the guard as 409 with full payload + user message", async () => {
    const res = await request(app).post("/api/plant-module/equipment-usage").send({ equipmentId: 1, dieselIssued: 200, dieselSource: "plant_stock", date: "2026-08-15" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_PLANT_STOCK");
    expect(res.body.requestedQty).toBe(200);
    expect(res.body.availableQty).toBe(100);
    expect(res.body.shortageQty).toBe(100);
    expect(res.body.materialId).toBe(12);
    expect(res.body.message).toContain("INSUFFICIENT DIESEL IN PLANT STOCK");
    expect(res.body.message).toContain("Material Receipt");
  });

  it("F/J: PUT equipment-usage maps the guard identically (same rule, no second validation)", async () => {
    const res = await request(app).put("/api/plant-module/equipment-usage/5").send({ dieselIssued: 120 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_PLANT_STOCK");
  });

  it.each([
    ["completeIncomingEquipmentUsage", "/api/plant-module/equipment-usage/5/complete-incoming", { dieselIssued: 5 }],
    ["createDpr", "/api/dprs", { date: "2026-08-31", site: "SITE", engineer: "ENGINEER", progress: [], equipment: [], labour: [], materials: [] }],
  ])("maps INVALID_DIESEL_SOURCE from %s to structured 400", async (method, path, body) => {
    const { InvalidDieselSourceError } = await import("../server/storage");
    storage[method].mockRejectedValueOnce(new InvalidDieselSourceError(undefined));
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "INVALID_DIESEL_SOURCE",
      field: "dieselSource",
    });
    expect(res.body.message).toContain("dieselSource must be explicitly set");
  });
});

describe("Task #1433 formerly unguarded deduction routes", () => {
  it("maps a blocked generic Diesel/HSD Material Issue to the same structured 409", async () => {
    const res = await request(app).post("/api/plant-module/material-issues").send({
      date: "2026-08-15",
      materialId: 12,
      quantity: 200,
      uom: "Liters",
      issuedTo: "HMP",
      isPlantCommon: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      requestedQty: 200,
      availableQty: 100,
      shortageQty: 100,
    });
    expect(res.body.message).toContain("Required: 200");
    expect(res.body.message).toContain("Available: 100");
    expect(res.body.message).toContain("Shortfall: 100");
  });

  it("maps a blocked IRN/store issue voucher to the same structured 409", async () => {
    const res = await request(app).post("/api/irn/77/record-issue").send({
      date: "2026-08-15",
      issuedBy: "STORE",
      receivedBy: "SITE",
      deliveryMode: "hand_carried",
      items: [{
        irnItemId: 1,
        materialId: 12,
        partyId: null,
        actualIssuedQty: 200,
        uom: "Liters",
        materialText: "DIESEL",
      }],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_PLANT_STOCK");
    expect(res.body.shortageQty).toBe(100);
  });

  it("enables the optional guard only for exact Diesel/HSD materials, preserving non-Diesel behavior", () => {
    expect(dieselStockSufficiencyGuard("Diesel", "material_issue")).toEqual({
      material: "Diesel",
      source: "material_issue",
    });
    expect(dieselStockSufficiencyGuard(" HSD ", "irn_issue_voucher")).toEqual({
      material: "HSD",
      source: "irn_issue_voucher",
    });
    expect(dieselStockSufficiencyGuard("LDO", "material_issue")).toBeUndefined();
    expect(dieselStockSufficiencyGuard("20MM AGGREGATE", "irn_issue_voucher")).toBeUndefined();
  });

  it("classifies only plant_stock equipment fuel as backfillable plant consumption", () => {
    expect(isPlantStockEquipmentUsage("plant_stock")).toBe(true);
    expect(isPlantStockEquipmentUsage("direct_purchase")).toBe(false);
    expect(isPlantStockEquipmentUsage(null)).toBe(false);
  });

  it("excludes null and direct_purchase sources from DPR migration candidates", () => {
    expect(isDprDieselMigrationCandidate("plant_stock")).toBe(true);
    expect(isDprDieselMigrationCandidate("direct_purchase")).toBe(false);
    expect(isDprDieselMigrationCandidate(null)).toBe(false);
    expect(isDprDieselMigrationCandidate(undefined)).toBe(false);
    const wouldDeduct = [
      { dieselSource: null, diesel: 50 },
      { dieselSource: "direct_purchase", diesel: 40 },
    ].filter((row) => isDprDieselMigrationCandidate(row.dieselSource));
    expect(wouldDeduct).toHaveLength(0);
  });

  it("selects exact canonical DIESEL first, while supporting HSD-only masters", () => {
    expect(selectCanonicalDieselMaterial([
      { id: 2, name: "HSD", isActive: 1 },
    ])?.id).toBe(2);
    expect(selectCanonicalDieselMaterial([
      { id: 2, name: "HSD", isActive: 1 },
      { id: 1, name: "DIESEL", isActive: 1 },
    ])?.id).toBe(1);
    expect(selectCanonicalDieselMaterial([
      { id: 1, name: "DIESEL OIL", isActive: 1 },
      { id: 2, name: "HSD", isActive: 1 },
    ])?.id).toBe(2);
    expect(selectCanonicalDieselMaterial([
      { id: 1, name: "DIESEL", isActive: 0 },
      { id: 2, name: "HSD", isActive: 1 },
    ])?.id).toBe(2);
  });

  it("preflights the DPR rebuild as a guarded net current-stock delta", async () => {
    // Replacing 100 L of old rows with 150 L of candidate rows deducts 50 L.
    const netDelta = dprDieselMigrationNetDelta(100, 150);
    expect(netDelta).toBe(-50);
    const { DatabaseStorage: RealClass } = (await import("../server/storage")) as any;
    await expect(adjust(Object.create(RealClass.prototype), 30, netDelta))
      .rejects.toMatchObject({ code: "INSUFFICIENT_PLANT_STOCK", payload: { shortageQty: 20 } });
    // A rebuild reducing deductions is a receipt-like positive delta and remains allowed.
    expect(dprDieselMigrationNetDelta(150, 100)).toBe(50);
  });

  it("surfaces a blocked equipment-usage reconciliation as the standard stock 409", async () => {
    const res = await request(app).post("/api/plant-module/reconcile-equipment-usage-ledger").send({});
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      requestedQty: 200,
      availableQty: 100,
      shortageQty: 100,
    });
  });

  it.each([
    ["put", "/api/plant-module/material-returns/7", { quantity: 20 }],
    ["delete", "/api/plant-module/material-returns/7", undefined],
    ["put", "/api/plant-module/opening-stocks/7", { quantity: 20 }],
    ["delete", "/api/plant-module/opening-stocks/7", undefined],
  ] as const)("maps guarded credit reduction %s %s to the standard 409", async (method, path, body) => {
    const call = (request(app) as any)[method](path);
    const res = body ? await call.send(body) : await call;
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK",
      requestedQty: 200,
      availableQty: 100,
      shortageQty: 100,
    });
  });

  it("rejects a negative Diesel physical correction at the route boundary without calling storage", async () => {
    storage.postStockCorrection.mockClear();
    const res = await request(app).post("/api/plant-module/stock-correction").send({
      materialId: 12, partyId: 1, physicalQty: -1, uom: "Liters", date: "2026-08-31",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_DIESEL_PHYSICAL_STOCK");
    expect(storage.postStockCorrection).not.toHaveBeenCalled();
  });

  it("preserves negative non-Diesel physical correction behavior", async () => {
    storage.postStockCorrection.mockClear();
    const res = await request(app).post("/api/plant-module/stock-correction").send({
      materialId: 30, partyId: 1, physicalQty: -1, uom: "Ton", date: "2026-08-31",
    });
    expect(res.status).toBe(200);
    expect(storage.postStockCorrection).toHaveBeenCalledWith(expect.objectContaining({ materialId: 30, physicalQty: -1 }));
  });

  it("maps a negative Diesel ledger reconciliation to structured 409 and leaves later valid runs unchanged", async () => {
    storage.reconcileStockBalancesFromLedger.mockRejectedValueOnce(new InsufficientPlantStockError({
      material: "DIESEL", source: "ledger_reconciliation", materialId: 12, partyId: 1,
      requestedQty: 125, availableQty: 100, shortageQty: 25,
    }));
    const blocked = await request(app).post("/api/plant-module/reconcile-stock-balances").send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      code: "INSUFFICIENT_PLANT_STOCK", requestedQty: 125, availableQty: 100, shortageQty: 25,
    });
    const allowed = await request(app).post("/api/plant-module/reconcile-stock-balances").send({});
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ updated: 1, created: 0, errors: 0 });
  });

  it("maps Diesel dispatch insufficiency to 409 while preserving StockShortage confirmation", async () => {
    storage.createTruckDispatchWithStockDeduction.mockRejectedValueOnce(new InsufficientPlantStockError({
      material: "DIESEL", source: "truck_dispatch", materialId: 12,
      requestedQty: 20, availableQty: 10, shortageQty: 10,
    }));
    const fuel = await request(app).post("/api/plant-module/dispatches").send({});
    expect(fuel.status).toBe(409);
    expect(fuel.body).toMatchObject({ code: "INSUFFICIENT_PLANT_STOCK", requestedQty: 20, availableQty: 10 });
    const aggregate = await request(app).post("/api/plant-module/dispatches").send({});
    expect(aggregate.status).toBe(409);
    expect(aggregate.body).toMatchObject({ needsConfirmation: true });
    expect(aggregate.body.code).toBeUndefined();
  });

  it("maps RMC reprocess HSD insufficiency to 409", async () => {
    storage.reprocessRmcMissedDeductions.mockRejectedValueOnce(new InsufficientPlantStockError({
      material: "HSD", source: "rmc_batch_reprocess", materialId: 12,
      requestedQty: 20, availableQty: 10, shortageQty: 10,
    }));
    const res = await request(app).post("/api/rmc/batch-records/reprocess-missed-deductions").send({});
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "INSUFFICIENT_PLANT_STOCK", requestedQty: 20, availableQty: 10 });
  });

  it("maps every dispatch and RMC mutation caller through the shared handler", () => {
    const src = require("fs").readFileSync("server/routes.ts", "utf8");
    for (const marker of [
      'app.post("/api/plant-module/dispatches"',
      'app.put("/api/plant-module/dispatches/:id"',
      'app.post("/api/plant-module/mix-templates/:id/rebuild-ledger"',
      'app.post("/api/rmc/batch-records"',
      'app.patch("/api/rmc/batch-records/:id"',
      'app.post("/api/rmc/batch-records/reprocess-missed-deductions"',
    ]) {
      const start = src.indexOf(marker);
      expect(start).toBeGreaterThan(0);
      expect(src.slice(start, src.indexOf("\n  });", start))).toContain("handleInsufficientPlantStock");
    }
  });

  it.each([
    ["executeLedgerReassignment", "/api/plant-module/reassign-ledger/execute", { materialId: 12, fromPartyId: 1, toPartyId: 2 }],
    ["createStockTransfer", "/api/plant-module/stock-transfer", { materialId: 12, fromPartyId: 1, toPartyId: 2, quantity: 20, date: "2026-08-31" }],
  ])("maps %s fuel rollback conflict to standard 409", async (method, path, body) => {
    storage[method].mockRejectedValueOnce(new InsufficientPlantStockError({
      material: "DIESEL", source: method === "createStockTransfer" ? "stock_transfer" : "ledger_reconciliation",
      materialId: 12, requestedQty: 20, availableQty: 10, shortageQty: 10,
    }));
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "INSUFFICIENT_PLANT_STOCK", requestedQty: 20, availableQty: 10 });
  });
});
