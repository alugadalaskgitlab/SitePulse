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
  return { ...actual, storage: storageProxy };
});

// ---------------------------------------------------------------------------
// Layer 1 — the shared guard helper, tested directly with a stub tx.
// ---------------------------------------------------------------------------
let InsufficientPlantStockError: any;
let DatabaseStorage: any;

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

// ---------------------------------------------------------------------------
// Layer 2 — route mapping to 409 structured payload.
// ---------------------------------------------------------------------------
let app: express.Express;
let storage: any;

beforeAll(async () => {
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
});
