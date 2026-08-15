/**
 * Batch 06M — Diesel purchase: bill/QR attachments + PI-style payment details.
 *
 * Route-level tests against the REAL registered handlers (registerRoutes),
 * storage mocked (028B pattern). Verifies:
 *  - purchase-update still works unchanged (qty/supplier/bill/rate/amount);
 *  - new paymentMode/paidBy fields are accepted and passed to storage;
 *  - invalid paymentMode rejected (PI option values only);
 *  - attachments POST accepts the new diesel_purchase moduleType with
 *    docType bill / payment_evidence, and GET returns them;
 *  - no stock/status behavior is invoked by the purchase route.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx: { role: string; attachments: any[] } = { role: "admin", attachments: [] };

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-purchaser", isAdmin: fx.role === "admin", isActive: true };
    req.authPermissions = {};
    req.session = { role: fx.role, username: "test-purchaser", userId: 9 };
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
  methods.updateDieselPurchase = vi.fn(async (id: number, data: any) =>
    id === 42 ? { id: 42, status: "purchased", items: [], ...data } : undefined,
  );
  methods.createAttachment = vi.fn(async (data: any) => {
    const att = { id: fx.attachments.length + 1, ...data };
    fx.attachments.push(att);
    return att;
  });
  methods.getAttachments = vi.fn(async () => fx.attachments);
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

describe("06M diesel purchase-update payment details", () => {
  it("A/G: existing purchase fields still accepted, status flow untouched by route", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/purchase-update")
      .send({ qtyPurchased: 500, supplier: "HP PUMP", billNo: "HP/1", rate: 92.5, amount: 46250 });
    expect(res.status).toBe(200);
    const passed = storage.updateDieselPurchase.mock.calls.at(-1)[1];
    expect(passed.qtyPurchased).toBe(500);
    expect(passed.paymentMode).toBeUndefined();
    expect(passed.paidBy).toBeUndefined();
    // route passes no status — storage owns the "purchased" transition
    expect(passed.status).toBeUndefined();
  });

  it("E: paymentMode + paidBy are accepted and forwarded", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/purchase-update")
      .send({ qtyPurchased: 200, paymentMode: "upi", paidBy: "company" });
    expect(res.status).toBe(200);
    const passed = storage.updateDieselPurchase.mock.calls.at(-1)[1];
    expect(passed.paymentMode).toBe("upi");
    expect(passed.paidBy).toBe("company");
  });

  it("E: personal payer name is forwarded as paidBy", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/purchase-update")
      .send({ paymentMode: "cash", paidBy: "RAMESH" });
    expect(res.status).toBe(200);
    expect(storage.updateDieselPurchase.mock.calls.at(-1)[1].paidBy).toBe("RAMESH");
  });

  it("rejects non-PI payment modes", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/42/purchase-update")
      .send({ paymentMode: "bitcoin" });
    expect(res.status).toBe(400);
  });

  it("404 for unknown requirement", async () => {
    const res = await request(app)
      .patch("/api/diesel-requirements/999/purchase-update")
      .send({ qtyPurchased: 10 });
    expect(res.status).toBe(404);
  });
});

describe("06M diesel purchase attachments", () => {
  it("B/C: POST accepts diesel_purchase moduleType with bill and payment_evidence docTypes", async () => {
    for (const docType of ["bill", "payment_evidence"]) {
      const res = await request(app).post("/api/attachments").send({
        moduleType: "diesel_purchase",
        linkedRecordId: 42,
        fileName: `${docType}.jpg`,
        objectPath: "/objects/uploads/x.jpg",
        mimeType: "image/jpeg",
        fileSize: 1000,
        docType,
      });
      expect(res.status).toBeLessThan(300);
    }
  });

  it("D/F: GET returns persisted diesel_purchase attachments for viewing", async () => {
    const res = await request(app).get("/api/attachments?moduleType=diesel_purchase&linkedRecordId=42");
    expect(res.status).toBe(200);
    const docTypes = res.body.map((a: any) => a.docType).sort();
    expect(docTypes).toEqual(["bill", "payment_evidence"]);
  });

  it("rejects unknown moduleType (enum still enforced)", async () => {
    const res = await request(app).post("/api/attachments").send({
      moduleType: "diesel_purchase_v2",
      linkedRecordId: 42,
      fileName: "x.jpg",
      objectPath: "/objects/uploads/x.jpg",
      mimeType: "image/jpeg",
      fileSize: 1000,
    });
    expect(res.status).toBe(400);
  });
});
