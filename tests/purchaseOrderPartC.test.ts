import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import request from "supertest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const fx = vi.hoisted(() => ({
  db: null as any, user: { id: 7, isAdmin: false, isOwner: false } as any,
  permissions: { view: true, create: true, approve: false } as Record<string, boolean>,
  allowed: [1] as number[] | null,
  indent: null as any,
  purchaserAction: vi.fn().mockResolvedValue({ txnIdsByItemId: {}, grnIdsByItemId: {}, routeWarnings: [] }),
}));
vi.mock("../server/db", () => ({ get db() { return fx.db; }, pool: {} }));
vi.mock("../server/storage", () => ({ storage: new Proxy({
  getPurchaseIndent: async () => fx.indent,
  getPurchaseIndents: async () => [fx.indent],
  getSites: async () => [{ id: 1, name: "SYNTHETIC Site A" }, { id: 2, name: "SYNTHETIC Site B" }],
  getUserPermittedSiteIds: async () => fx.allowed,
  getSetting: async (key: string) => key === "licensed_modules" ? "[]" : null,
  submitPurchaserAction: fx.purchaserAction,
}, { get(target: any, key: string) { return key in target ? target[key] : vi.fn().mockResolvedValue([]); } }) }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn(), sendTestPush: vi.fn() }));
vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as any).authUser = fx.user; next(); },
  isPublicApiPath: () => false, isOptionalAuthPath: () => false,
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(), loadUserPermissionsMatrix: vi.fn(),
}));
const permit = (req: Request, res: Response, action: string) => {
  if (!fx.user) { res.status(401).json({ message: "Sign in required" }); return false; }
  if (fx.user.isAdmin || fx.user.isOwner || fx.permissions[action]) return true;
  res.status(403).json({ message: `${action} denied` }); return false;
};
vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(), assertCreate: (req: Request, res: Response) => permit(req, res, "create"),
  assertEdit: (req: Request, res: Response) => permit(req, res, "create"),
  assertView: (req: Request, res: Response) => permit(req, res, "view"),
  assertApprove: (req: Request, res: Response) => permit(req, res, "approve"),
  assertAdmin: (req: Request, res: Response) => permit(req, res, "approve"),
  assertViewEither: () => true, assertAuthed: () => true, assertCreateOrEdit: () => true,
  assertCreateEither: () => true, assertDeleteOrCancel: () => true,
  currentUserName: (req: any) => req.authUser?.id === 7 ? "Ramesh Kumar" : "Suresh Reddy",
}));

let pg: PGlite, app: express.Express;
const base = "/api/purchase-indents/1/items/10/purchase-order";
const draft = {
  orderNo: "SYN-PO-1", vendorId: 3, vendorName: "SYNTHETIC Supplier",
  description: "SYNTHETIC GSB", spec: "", quantity: 12, unit: "MT", rate: 320,
  expectedDelivery: "2026-10-01", paymentTerms: "credit", destination: "SYNTHETIC Site A",
};
const item = { id: 10, indentId: 1, description: "SYNTHETIC GSB", spec: null, purchaseStatus: "ORDERED", vendor: "SYNTHETIC Supplier", vendorId: 3, orderNo: "SYN-PO-1", orderedQty: 12, qty: 15, uom: "MT", rate: 320, expectedDelivery: "2026-10-01", paymentMode: "credit", receivingLocation: "site", receivingSiteId: 1 };
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, full_name text NOT NULL);
    CREATE TABLE vendors (id integer PRIMARY KEY, name text NOT NULL, business_name text, gst_number text, pan_number text, address text);
    CREATE TABLE purchase_indents (id integer PRIMARY KEY);
    CREATE TABLE purchase_indent_items (id integer PRIMARY KEY);
    INSERT INTO users VALUES (7,'Ramesh Kumar'), (8,'Suresh Reddy'), (9,'Store User'), (10,'Project Manager');
    INSERT INTO vendors VALUES (3,'SYNTHETIC Supplier','Supplier Works','GST-SYN','PAN-SYN','Supplier Road');
    INSERT INTO purchase_indents VALUES (1);
    INSERT INTO purchase_indent_items VALUES (10);
  `);
  await pg.exec(readFileSync("migrations/0037_purchase_orders.sql", "utf8"));
  fx.db = drizzle(pg);
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
}, 120_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec("DELETE FROM purchase_orders; ALTER SEQUENCE purchase_orders_id_seq RESTART WITH 1");
  fx.indent = { id: 1, indentNo: "PI-SYN", siteId: 1, raisedFrom: "SYNTHETIC Site A", piType: "material", status: "ordered", authorUserId: 9, items: [{ ...item }] };
  fx.user = { id: 7, isAdmin: false, isOwner: false };
  fx.permissions = { view: true, create: true, approve: false };
  fx.allowed = [1];
  fx.purchaserAction.mockClear();
});
describe("optional PO lifecycle with isolated PostgreSQL fixture", () => {
  it("A: an order is recorded without raising a PO, for bulk and stores", async () => {
    for (const piType of ["material", "stores"]) {
      fx.indent.piType = piType;
      expect((await request(app).post("/api/purchase-indents/1/purchaser-action")
        .send({ items: [{ itemId: 10, purchaseActionType: "ordered", qty: 12, rate: 320, expectedDeliveryDate: "2026-10-01", vendor: "SYNTHETIC Supplier", receivingLocation: "site", receivingSiteId: 1 }] })).status).toBe(200);
    }
    expect(fx.purchaserAction).toHaveBeenCalledTimes(2);
    expect((await pg.query("SELECT count(*)::int AS count FROM purchase_orders")).rows[0]).toEqual({ count: 0 });
  });
  it.each(["material", "stores"])("B-G: %s snapshot, lock, approver, approved PDF and role access", async type => {
    fx.indent.piType = type;
    expect((await request(app).get(`${base}.pdf`)).status).toBe(409);
    const created = await request(app).post(base).send(draft);
    expect(created.status).toBe(201);
    expect(created.body.raisedByName).toBe("Ramesh Kumar");
    expect((await request(app).post(base).send(draft)).status).toBe(409);
    expect((await request(app).get(`${base}.pdf`)).status).toBe(409);
    const edited = await request(app).patch(base).send({ ...draft, description: "SYNTHETIC edited independent snapshot", rate: 355 });
    expect(edited.status).toBe(200);
    expect(fx.indent.items[0].description).toBe("SYNTHETIC GSB");
    expect((await request(app).post(`${base}/submit`).send({})).body.status).toBe("submitted");
    expect((await request(app).patch(base).send(draft)).status).toBe(409);
    expect((await request(app).get(`${base}.pdf`)).status).toBe(409);
    expect((await request(app).get("/api/purchase-orders/pending")).status).toBe(403);
    expect((await request(app).post(`${base}/decision`).send({ action: "approve" })).status).toBe(403);
    fx.permissions.approve = true;
    expect((await request(app).get("/api/purchase-orders/pending")).body).toHaveLength(0);
    expect((await request(app).post(`${base}/decision`).send({ action: "approve" })).status).toBe(403);
    fx.user = { id: 8, isAdmin: false, isOwner: false };
    expect((await request(app).get("/api/purchase-orders/pending")).body).toHaveLength(1);
    expect((await request(app).post(`${base}/decision`).send({ action: "approve" })).status).toBe(200);
    expect((await request(app).post(`${base}/decision`).send({ action: "approve" })).status).toBe(409);
    for (const role of [8, 9, 10]) {
      fx.user = { id: role, isAdmin: false, isOwner: false };
      fx.permissions.approve = false;
      const response = await request(app).get(`${base}.pdf?preview=1`).buffer(true);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/pdf/);
      expect((response.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
      if (role === 8) {
        mkdirSync("reports/part-c", { recursive: true });
        const file = `reports/part-c/integration-${type}.pdf`;
        writeFileSync(file, response.body as Buffer);
        expect(execFileSync("pdfinfo", [file], { encoding: "utf8" })).toMatch(/Pages:\s+1\b/);
        const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
        for (const phrase of ["SYNTHETIC edited independent snapshot", "Ramesh Kumar", "Suresh Reddy", "VENDOR", "DELIVER TO", "355"]) expect(text).toContain(phrase);
        expect(text).not.toMatch(/subtotal|total amount|signature/i);
      }
    }
    fx.allowed = [2];
    expect((await request(app).get(`${base}.pdf`)).status).toBe(403);
  });
  it("reject permits re-raise; only one active PO even on concurrent requests", async () => {
    const responses = await Promise.all([request(app).post(base).send(draft), request(app).post(base).send(draft)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    await request(app).post(`${base}/submit`).send({});
    fx.user = { id: 8, isAdmin: false, isOwner: false }; fx.permissions.approve = true;
    expect((await request(app).post(`${base}/decision`).send({ action: "reject", reason: "Change supplier" })).status).toBe(200);
    expect((await request(app).get(`${base}.pdf`)).status).toBe(409);
    fx.user = { id: 7, isAdmin: false, isOwner: false };
    expect((await request(app).post(base).send(draft)).status).toBe(201);
    expect((await pg.query("SELECT status FROM purchase_orders ORDER BY id")).rows).toEqual([{ status: "rejected" }, { status: "draft" }]);
  });
  it("keeps the PI admin self-approval exception, while denying non-admin indent authors", async () => {
    expect((await request(app).post(base).send(draft)).status).toBe(201);
    expect((await request(app).post(`${base}/submit`).send({})).status).toBe(200);
    fx.user = { id: 9, isAdmin: false, isOwner: false };
    fx.permissions.approve = true;
    expect((await request(app).get("/api/purchase-orders/pending")).body).toHaveLength(0);
    expect((await request(app).post(`${base}/decision`).send({ action: "approve" })).status).toBe(403);
    // PI approval exempts admins from its own authorUserId self-approval check.
    fx.user = { id: 7, isAdmin: true, isOwner: false };
    fx.permissions.approve = false;
    const approved = await request(app).post(`${base}/decision`).send({ action: "approve" });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "approved", raisedByUserId: 7, approvedByUserId: 7 });
  });
  it("denies unauthenticated, no-create, no-view, and out-of-site calls", async () => {
    fx.user = null;
    expect((await request(app).post(base).send(draft)).status).toBe(401);
    fx.user = { id: 7, isAdmin: false, isOwner: false }; fx.permissions.create = false;
    expect((await request(app).post(base).send(draft)).status).toBe(403);
    fx.permissions.create = true; fx.allowed = [2];
    expect((await request(app).post(base).send(draft)).status).toBe(403);
    fx.allowed = [1]; fx.permissions.view = false;
    expect((await request(app).get(base)).status).toBe(403);
    expect((await request(app).get(`${base}.pdf`)).status).toBe(403);
  });
  it("enforces site scope on draft edits, submit, pending list and approval", async () => {
    expect((await request(app).post(base).send(draft)).status).toBe(201);
    fx.allowed = [2];
    expect((await request(app).get(base)).status).toBe(403);
    expect((await request(app).patch(base).send(draft)).status).toBe(403);
    expect((await request(app).post(`${base}/submit`).send({})).status).toBe(403);
    fx.allowed = [1];
    expect((await request(app).post(`${base}/submit`).send({})).status).toBe(200);
    fx.user = { id: 8, isAdmin: false, isOwner: false };
    fx.permissions.approve = true;
    fx.allowed = [2];
    expect((await request(app).get("/api/purchase-orders/pending")).body).toEqual([]);
    expect((await request(app).post(`${base}/decision`).send({ action: "approve" })).status).toBe(403);
    fx.allowed = [1];
    expect((await request(app).get("/api/purchase-orders/pending")).body).toHaveLength(1);
  });
  it("allows an approved item to raise PO before recording its independent order, but not a pending PI", async () => {
    fx.indent.items[0].purchaseStatus = null;
    fx.indent.status = "approved";
    expect((await request(app).post(base).send(draft)).status).toBe(201);
    expect(fx.indent.items[0].purchaseStatus).toBe(null);
    await pg.exec("DELETE FROM purchase_orders");
    fx.indent.status = "pending";
    expect((await request(app).post(base).send(draft)).status).toBe(409);
    fx.indent.status = "approved";
    fx.indent.items[0].approvedQty = 0;
    expect((await request(app).post(base).send(draft)).status).toBe(409);
  });
  it("rejects forged vendor links or linked-name mismatches on both create and edit; manual names unlink safely", async () => {
    expect((await request(app).post(base).send({ ...draft, vendorId: 999 })).status).toBe(400);
    expect((await request(app).post(base).send({ ...draft, vendorName: "FAKE SUPPLIER", vendorId: 3 })).status).toBe(400);
    expect((await pg.query("SELECT count(*)::int AS count FROM purchase_orders")).rows[0]).toEqual({ count: 0 });
    const created = await request(app).post(base).send({ ...draft, vendorName: "synthetic supplier" });
    expect(created.status).toBe(201);
    expect(created.body.vendorName).toBe("SYNTHETIC Supplier");
    expect(created.body.vendorGst).toBe("GST-SYN");
    expect((await request(app).patch(base).send({ ...draft, vendorName: "FAKE SUPPLIER", vendorId: 3 })).status).toBe(400);
    expect((await pg.query("SELECT vendor_name, vendor_gst FROM purchase_orders")).rows[0])
      .toEqual({ vendor_name: "SYNTHETIC Supplier", vendor_gst: "GST-SYN" });
    const unlinked = await request(app).patch(base).send({ ...draft, vendorName: "Independent Source", vendorId: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body).toMatchObject({ vendorName: "Independent Source", vendorId: null, vendorGst: null, vendorBusinessName: null, vendorPan: null, vendorAddress: null });
  });
});