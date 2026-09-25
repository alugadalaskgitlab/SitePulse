import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx = { permissions: {} as Record<string, Record<string, boolean>>, permitted: null as number[] | null };
const piInput = {
  date: "2026-08-15", indentNo: "PI-TEST-1", proposedBy: "Test Raiser",
  raisedBy: "Test Raiser", siteId: 1,
  items: [{ description: "Cement", qty: 10, uom: "bags", purpose: "Site work" }],
};
const dieselInput = {
  date: "2026-08-15", raisedBy: "Test Raiser", totalPlanned: 50, siteId: 1,
  items: [{ equipmentName: "Excavator", plannedQty: 50 }],
};
vi.mock("../server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 51, username: "test-raiser", fullName: "Test Raiser", isAdmin: false, isOwner: false };
    req.authPermissions = fx.permissions;
    next();
  };
  return { ...original, requireAuth: inject, optionalAuth: inject };
});
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storage = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
      return target[key];
    },
  });
  methods.getUserPermittedSiteIds = vi.fn(async () => fx.permitted);
  methods.getSites = vi.fn(async () => [{ id: 1, name: "Allowed" }, { id: 2, name: "Other" }]);
  methods.getPurchaseIndents = vi.fn(async () => [
    { id: 1, siteId: 1, raisedFrom: "Allowed", items: [], status: "pending" },
    { id: 2, siteId: 2, raisedFrom: "Other", items: [], status: "pending" },
  ]);
  methods.getPurchaseIndent = vi.fn(async (id: number) => (await methods.getPurchaseIndents())!.find((pi: any) => pi.id === id));
  methods.getRecentIndentItemIds = vi.fn(async () => [11]);
  methods.scanPurchaseIndentRouteCorrections = vi.fn(async () => []);
  methods.getDieselRequirements = vi.fn(async () => [{ id: 1, status: "pending" }]);
  methods.getDieselRequirement = vi.fn(async () => ({ id: 1, status: "pending" }));
  methods.getRecentDieselItemIds = vi.fn(async () => [22]);
  methods.createPurchaseIndent = vi.fn(async (input: any) => ({ id: 3, ...input }));
  methods.updatePurchaseIndent = vi.fn(async (id: number, input: any) => ({ id, ...input }));
  methods.createDieselRequirement = vi.fn(async (input: any) => ({ id: 3, ...input }));
  methods.updateDieselRequirement = vi.fn(async (id: number, input: any) => ({ id, ...input }));
  methods.getVendorBillCompanyAccounts = vi.fn(async () => [{ key: "company-account" }]);
  return { storage };
});

let app: express.Express;
let storage: any;
beforeAll(async () => {
  ({ storage } = await import("../server/storage"));
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
}, 30_000);
beforeEach(() => {
  fx.permissions = {};
  fx.permitted = null;
  vi.clearAllMocks();
});

describe("PERM-01 supporting read HTTP routes with real guards", () => {
  it.each(["purchase_indents_raise", "site_procurement", "purchase_indents_view"])("loads PI list, detail and form reads with %s alone, preserving site scope", async key => {
    fx.permissions = { [key]: { create: key !== "purchase_indents_view", view: key === "purchase_indents_view" } };
    fx.permitted = [1];
    const list = await request(app).get("/api/purchase-indents");
    expect(list.status).toBe(200);
    expect(list.body.map((row: any) => row.id)).toEqual([1]);
    expect((await request(app).get("/api/purchase-indents/1")).status).toBe(200);
    expect((await request(app).get("/api/purchase-indents/2")).status).toBe(403);
    expect((await request(app).get("/api/purchase-indent-items/recent-items")).status).toBe(200);
    expect((await request(app).get("/api/purchase-indents/route-corrections")).status).toBe(200);
  });

  it.each(["diesel_req_raise", "site_diesel", "stores_inventory"])("loads diesel list and detail with %s alone", async key => {
    fx.permissions = { [key]: { create: key !== "stores_inventory", view: key === "stores_inventory" } };
    expect((await request(app).get("/api/diesel-requirements")).status).toBe(200);
    expect((await request(app).get("/api/diesel-requirements/1")).status).toBe(200);
    expect((await request(app).get("/api/diesel-requirements/recent-items")).status).toBe(200);
  });

  it("denies ungranted reads and keeps approval distinct from raising", async () => {
    expect((await request(app).get("/api/purchase-indents")).status).toBe(403);
    expect((await request(app).get("/api/diesel-requirements")).status).toBe(403);
    fx.permissions = { purchase_indents_raise: { create: true }, diesel_req_raise: { create: true } };
    expect((await request(app).patch("/api/purchase-indents/1/approve").send({})).status).toBe(403);
    expect((await request(app).patch("/api/diesel-requirements/1/approve").send({})).status).toBe(403);
    expect((await request(app).patch("/api/purchase-indents/items/1/link-receipt").send({})).status).toBe(400);
  });

  it.each([
    ["purchase_indents_raise", "site_procurement", "/api/purchase-indents", "/api/purchase-indents/1"],
    ["diesel_req_raise", "site_diesel", "/api/diesel-requirements", "/api/diesel-requirements/1"],
  ])("%s and %s each pass read/create/edit guards, while neither and view-only cannot write", async (granular, legacy, list, detail) => {
    for (const key of [granular, legacy]) {
      fx.permissions = { [key]: { create: true, edit: true } };
      expect((await request(app).get(list)).status).toBe(200);
      expect((await request(app).get(detail)).status).toBe(200);
      // Empty payload is rejected by the real input schema, after authorization.
      expect((await request(app).post(list).send({})).status).toBe(400);
      expect((await request(app).put(detail).send({})).status).toBe(400);
    }
    fx.permissions = {};
    expect((await request(app).post(list).send({})).status).toBe(403);
    expect((await request(app).put(detail).send({})).status).toBe(403);
    fx.permissions = { [granular]: { view: true } };
    expect((await request(app).get(list)).status).toBe(200);
    expect((await request(app).post(list).send({})).status).toBe(403);
    expect((await request(app).put(detail).send({})).status).toBe(403);
  });

  it.each([
    ["purchase_indents_raise", "site_procurement", "/api/purchase-indents", piInput, "PurchaseIndent"],
    ["diesel_req_raise", "site_diesel", "/api/diesel-requirements", dieselInput, "DieselRequirement"],
  ] as const)("actually creates and edits %s or %s through the registered handlers", async (granular, legacy, path, input, name) => {
    for (const key of [granular, legacy]) {
      fx.permissions = { [key]: { create: true, edit: true } };
      const created = await request(app).post(path).send(input);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body).toMatchObject({ id: 3, date: input.date, items: input.items });
      expect(storage[`create${name}`]).toHaveBeenCalledWith(expect.objectContaining(input));

      const updated = await request(app).put(`${path}/1`).send(input);
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body).toMatchObject({ id: 1, date: input.date, items: input.items });
      expect(storage[`update${name}`]).toHaveBeenCalledWith(1, expect.objectContaining(input));
    }
    expect(storage[`create${name}`]).toHaveBeenCalledTimes(2);
    expect(storage[`update${name}`]).toHaveBeenCalledTimes(2);
  });

  it("exposes the shared company account selector to diesel editors, not to raisers without edit", async () => {
    for (const key of ["diesel_req_raise", "site_diesel"]) {
      fx.permissions = { [key]: { edit: true } };
      expect((await request(app).get("/api/vendor-bills/company-accounts")).status).toBe(200);
    }
    fx.permissions = { diesel_req_raise: { create: true } };
    expect((await request(app).get("/api/vendor-bills/company-accounts")).status).toBe(403);
  });

  it("does not grant PI receipt linking to a read-only raiser", async () => {
    fx.permissions = { purchase_indents_raise: { view: true } };
    expect((await request(app).patch("/api/purchase-indents/items/1/link-receipt").send({ receiptId: 1 })).status).toBe(403);
  });
});