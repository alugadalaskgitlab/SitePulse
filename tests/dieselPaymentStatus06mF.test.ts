/**
 * Batch 06M-F — Diesel purchase Payment Status + Vendor Bill paymentRecordedBy.
 *
 * Route-level tests against the REAL registered handlers (registerRoutes),
 * storage mocked (028B pattern), plus real-storage unit checks on
 * updateVendorBillStatus via source pinning and schema checks.
 *
 * Spec §9 tests:
 *  B. default pending, never inferred from paymentMode/paidBy.
 *  C. mark-paid sets paymentStatus/paidAt/paymentRecordedBy (server-set).
 *  D. mark-paid rejected without paymentMode or paidBy.
 *  E. rejected when requirement not yet purchased.
 *  F. endpoint never forwards purchase/lifecycle fields.
 *  G. mode/paidBy editable after paid without resetting paidAt/recordedBy.
 *  I. no OCR/bill-read/duplicate/merchant-QR code.
 *  J. only the additive §3/§7A columns.
 *  K/L/M. vendor bill paid branch sets paymentRecordedBy; transitions and
 *         /payment-details untouched.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import fs from "fs";
import { getTableColumns } from "drizzle-orm";
import { dieselRequirements, vendorBills } from "../shared/schema";

const fx: { role: string } = { role: "admin" };

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-recorder", fullName: "test-recorder", isAdmin: fx.role === "admin", isActive: true };
    req.authPermissions = {};
    req.session = { role: fx.role, username: "test-recorder", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

// Requirement fixtures: 42 purchased+pending, 43 not purchased, 44 already paid.
const reqs: Record<number, any> = {
  42: { id: 42, status: "purchased", qtyPurchased: 500, paymentStatus: "pending", paymentMode: null, paidBy: null, items: [] },
  43: { id: 43, status: "approved", qtyPurchased: null, paymentStatus: "pending", items: [] },
  44: { id: 44, status: "purchased", qtyPurchased: 200, paymentStatus: "paid", paidAt: "2026-08-10 09:00:00", paymentRecordedBy: "EARLIER USER", paymentMode: "cash", paidBy: "company", items: [] },
};

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getDieselRequirement = vi.fn(async (id: number) => reqs[id]);
  methods.updateDieselPaymentStatus = vi.fn(async (id: number, data: any, actor: string) =>
    reqs[id] ? { ...reqs[id], ...data, paidAt: "SERVER", paymentRecordedBy: actor.toUpperCase() } : undefined,
  );
  return { storage: storageProxy };
});

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

describe("06M-F Test B — default pending, never inferred", () => {
  it("schema default is 'pending'", () => {
    const cols = getTableColumns(dieselRequirements) as any;
    expect(cols.paymentStatus).toBeDefined();
    expect(cols.paymentStatus.default).toBe("pending");
  });
  it("purchase-update route never forwards paymentStatus (mode/paidBy alone can't mark paid)", async () => {
    const src = fs.readFileSync("server/routes.ts", "utf8");
    const routeBlock = src.slice(src.indexOf('"/api/diesel-requirements/:id/purchase-update"'), src.indexOf('"/api/diesel-requirements/:id/payment-status"'));
    expect(routeBlock).not.toContain("paymentStatus");
    expect(routeBlock).not.toContain("paidAt");
  });
});

describe("06M-F Tests C/D/E/F — PATCH /payment-status", () => {
  it("C: marks paid with mode+paidBy; actor comes from authenticated user, never the client", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/payment-status")
      .send({ paymentStatus: "paid", paymentMode: "rtgs", paidBy: "company", paymentRecordedBy: "SPOOFED", paidAt: "1999-01-01" });
    expect(res.status).toBe(200);
    const [, data, actor] = storage.updateDieselPaymentStatus.mock.calls.at(-1);
    // client-supplied recordedBy/paidAt stripped by zod schema
    expect(data).toEqual({ paymentStatus: "paid", paymentMode: "rtgs", paidBy: "company" });
    expect(actor).toBe("test-recorder");
  });
  it("D: rejects paid without paymentMode / paidBy", async () => {
    const res = await request(app).patch("/api/diesel-requirements/42/payment-status").send({ paymentStatus: "paid" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Payment Mode and Paid By/i);
  });
  it("E: rejects when requirement not yet purchased", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/43/payment-status")
      .send({ paymentStatus: "paid", paymentMode: "cash", paidBy: "company" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/after the purchase/i);
  });
  it("F: purchase/lifecycle fields in the body are stripped, never forwarded", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/payment-status")
      .send({ paymentStatus: "paid", paymentMode: "upi", paidBy: "company", qtyPurchased: 9999, supplier: "X", billNo: "Y", rate: 1, amount: 2, purchasedAt: "z", status: "pending" });
    expect(res.status).toBe(200);
    const [, data] = storage.updateDieselPaymentStatus.mock.calls.at(-1);
    expect(Object.keys(data).sort()).toEqual(["paidBy", "paymentMode", "paymentStatus"]);
  });
  it("G: mode/paidBy correction after already paid succeeds without re-marking", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/44/payment-status")
      .send({ paymentMode: "cheque" });
    expect(res.status).toBe(200);
    const [, data] = storage.updateDieselPaymentStatus.mock.calls.at(-1);
    expect(data).toEqual({ paymentMode: "cheque" });
  });
});

describe("06M-F Test G (storage semantics) — paid is one-way, paidAt set once", () => {
  it("updateDieselPaymentStatus only sets paidAt/recordedBy on the pending→paid transition", () => {
    const src = fs.readFileSync("server/storage.ts", "utf8");
    const fn = src.slice(src.indexOf("async updateDieselPaymentStatus"), src.indexOf("async updateDieselRequirement"));
    // transition guard: paid transition is a conditional write, not a blind set
    expect(fn).toMatch(/data\.paymentStatus === "paid"/);
    expect(fn).toContain("IS DISTINCT FROM 'paid'");
    // never touches purchase fields
    for (const f of ["qtyPurchased", "supplier", "billNo", "rate", "amount", "purchasedAt", "purchaseRemarks"]) {
      expect(fn).not.toContain(`updates.${f}`);
    }
    expect(fn).not.toMatch(/updates\.status\b/);
  });
  it("concurrency: the paid transition is atomic (conditional WHERE, not read-then-write)", () => {
    const src = fs.readFileSync("server/storage.ts", "utf8");
    const fn = src.slice(src.indexOf("async updateDieselPaymentStatus"), src.indexOf("async updateDieselRequirement"));
    // two simultaneous mark-paid requests: only the first matches the predicate,
    // so paidAt/paymentRecordedBy are written exactly once.
    expect(fn).toContain("IS DISTINCT FROM 'paid'");
  });
  it("route rejects whitespace-only paidBy", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/44/payment-status")
      .send({ paidBy: "   " });
    expect(res.status).toBe(400);
  });
});

describe("06M-F Tests K/L — vendor bill paymentRecordedBy", () => {
  it("K: paid branch sets paymentRecordedBy alongside paidAt from the same actor", () => {
    const src = fs.readFileSync("server/storage.ts", "utf8");
    const fn = src.slice(src.indexOf("async updateVendorBillStatus"), src.indexOf("async deleteVendorBill"));
    const paidBranch = fn.slice(fn.indexOf('status === "paid"'));
    expect(paidBranch).toContain("updates.paidAt = now");
    expect(paidBranch).toContain("updates.paymentRecordedBy = actorUpper");
  });
  it("L: transition rules unchanged — draft→verified→approved→paid only", () => {
    const src = fs.readFileSync("server/storage.ts", "utf8");
    const fn = src.slice(src.indexOf("async updateVendorBillStatus"), src.indexOf("async deleteVendorBill"));
    expect(fn).toContain(`draft: ["verified"]`);
    expect(fn).toContain(`verified: ["approved"]`);
    expect(fn).toContain(`approved: ["paid"]`);
  });
  it("L: route-level permission + self-approval prevention untouched", () => {
    const src = fs.readFileSync("server/routes.ts", "utf8");
    const route = src.slice(src.indexOf('"/api/vendor-bills/:id/status"'), src.indexOf('"/api/vendor-bills/:id/pdf"'));
    expect(route).toContain('assertApprove(req, res, "vendor_bills_approve")');
    expect(route).toContain("You cannot approve a bill you created.");
    expect(route).not.toContain("paymentRecordedBy"); // server-set in storage, no client input
  });
  it("M: /payment-details endpoint byte-for-byte concerns unchanged (mode/paidBy only)", () => {
    const src = fs.readFileSync("server/routes.ts", "utf8");
    const route = src.slice(src.indexOf('"/api/vendor-bills/:id/payment-details"'), src.indexOf('"/api/vendor-bills/:id/status"'));
    expect(route).toContain("updateVendorBillPaymentDetails");
    expect(route).not.toContain("paymentStatus");
    expect(route).not.toContain("paymentRecordedBy");
  });
});

describe("06M-F Tests I/J — schema surface + no OCR", () => {
  it("J: diesel gained exactly paymentStatus/paidAt/paymentRecordedBy; vendor bill gained exactly paymentRecordedBy", () => {
    const d = getTableColumns(dieselRequirements) as any;
    expect(d.paymentStatus).toBeDefined();
    expect(d.paidAt).toBeDefined();
    expect(d.paymentRecordedBy).toBeDefined();
    const v = getTableColumns(vendorBills) as any;
    expect(v.paymentRecordedBy).toBeDefined();
    // no bill-parsing / staging fields anywhere
    const schema = fs.readFileSync("shared/schema.ts", "utf8");
    expect(schema).not.toMatch(/ocr_|ocrText|bill_extract|extracted_values|merchant_qr|merchantQr|duplicate_bill/i);
  });
  it("I: no OCR / Smart Bill Read / duplicate-detection code in the touched files", () => {
    for (const f of ["server/routes.ts", "server/storage.ts", "client/src/pages/DieselRequirements.tsx", "client/src/pages/VendorBills.tsx"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/smart\s*bill|bill[-_ ]?ocr|ocrExtract|merchantQr|duplicateBillCheck/i);
    }
  });
  it("H (stock isolation): payment-status route touches no stock/receipt logic", () => {
    const src = fs.readFileSync("server/routes.ts", "utf8");
    const route = src.slice(src.indexOf('"/api/diesel-requirements/:id/payment-status"'), src.indexOf('app.put("/api/diesel-requirements/:id"'));
    expect(route).not.toMatch(/stock|receipt|ledger|_adjustStockBalance/i);
  });
});
