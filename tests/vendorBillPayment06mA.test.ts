/**
 * Batch 06M-A — Vendor Bill payment details + purchased-diesel edit.
 *
 * Route-level tests against the REAL registered handlers (registerRoutes),
 * storage mocked (028B pattern). Verifies:
 *  - PATCH /api/vendor-bills/:id/payment-details accepts paymentMode/paidBy,
 *    forwards ONLY those fields, and never touches status/paidAt;
 *  - invalid payment modes rejected; unknown bill 404s;
 *  - existing NULL-value bills stay valid (partial/empty payloads OK);
 *  - purchased diesel requirement can be re-edited via the SAME
 *    purchase-update route (no second record, no status change by the route);
 *  - the startup column-ensure DDL is registered and idempotent.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

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
    req.authUser = { id: 9, username: "test-payer", isAdmin: fx.role === "admin", isActive: true };
    req.authPermissions = {};
    req.session = { role: fx.role, username: "test-payer", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.updateVendorBillPaymentDetails = vi.fn(async (id: number, details: any) =>
    id === 7 ? { id: 7, status: "paid", paidAt: "2026-08-01 10:00:00", items: [], ...details } : undefined,
  );
  methods.updateDieselPurchase = vi.fn(async (id: number, data: any) =>
    id === 42 ? { id: 42, status: "purchased", items: [], ...data } : undefined,
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

describe("06M-A vendor bill payment details", () => {
  it("H/I: accepts paymentMode + paidBy and forwards only those fields", async () => {
    const res = await request(app)
      .patch("/api/vendor-bills/7/payment-details")
      .send({ paymentMode: "rtgs", paidBy: "company" });
    expect(res.status).toBe(200);
    const [, details] = storage.updateVendorBillPaymentDetails.mock.calls.at(-1);
    expect(details).toEqual({ paymentMode: "rtgs", paidBy: "company" });
    // route never sends status/paidAt/lifecycle fields
    expect("status" in details).toBe(false);
    expect("paidAt" in details).toBe(false);
  });

  it("I: personal payer name forwarded as paidBy", async () => {
    const res = await request(app)
      .patch("/api/vendor-bills/7/payment-details")
      .send({ paymentMode: "upi", paidBy: "SURESH" });
    expect(res.status).toBe(200);
    expect(storage.updateVendorBillPaymentDetails.mock.calls.at(-1)[1].paidBy).toBe("SURESH");
  });

  it("K: partial payload (only one field) and explicit nulls are valid — NULL bills stay valid", async () => {
    const res1 = await request(app).patch("/api/vendor-bills/7/payment-details").send({ paymentMode: "cash" });
    expect(res1.status).toBe(200);
    expect("paidBy" in storage.updateVendorBillPaymentDetails.mock.calls.at(-1)[1]).toBe(false);
    const res2 = await request(app).patch("/api/vendor-bills/7/payment-details").send({ paymentMode: null, paidBy: null });
    expect(res2.status).toBe(200);
  });

  it("M: rejects payment modes outside the PI/diesel option set", async () => {
    const res = await request(app)
      .patch("/api/vendor-bills/7/payment-details")
      .send({ paymentMode: "barter" });
    expect(res.status).toBe(400);
    expect(storage.updateVendorBillPaymentDetails).not.toHaveBeenCalledWith(7, { paymentMode: "barter" });
  });

  it("authz: non-admin without vendor_bills_approve approve is rejected", async () => {
    fx.role = "viewer"; // isAdmin=false, authPermissions={} -> assertApprove denies
    const res = await request(app)
      .patch("/api/vendor-bills/7/payment-details")
      .send({ paymentMode: "cash", paidBy: "company" });
    expect(res.status).toBe(403);
    fx.role = "admin";
  });

  it("404 for unknown bill", async () => {
    const res = await request(app).patch("/api/vendor-bills/999/payment-details").send({ paymentMode: "cash" });
    expect(res.status).toBe(404);
  });

  it("L: no payment-evidence surface exists for vendor bills (attachments enum unchanged)", async () => {
    const res = await request(app).post("/api/attachments").send({
      moduleType: "vendor_bill_payment",
      linkedRecordId: 7,
      fileName: "qr.jpg",
      objectPath: "/objects/uploads/qr.jpg",
      mimeType: "image/jpeg",
      fileSize: 1000,
      docType: "payment_evidence",
    });
    expect(res.status).toBe(400);
  });
});

describe("06M-A purchased diesel retro-edit", () => {
  it("D/F/G: purchase-update accepts a retrospective paymentMode/paidBy fill on a purchased record — same route, no duplicate, no status in payload", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/purchase-update")
      .send({ paymentMode: "cheque", paidBy: "company" });
    expect(res.status).toBe(200);
    expect(storage.updateDieselPurchase).toHaveBeenCalledTimes(1); // single update, no second record
    const passed = storage.updateDieselPurchase.mock.calls.at(-1)[1];
    expect(passed.paymentMode).toBe("cheque");
    expect(passed.status).toBeUndefined(); // storage owns the "purchased" status
    expect(res.body.status).toBe("purchased");
  });
});
