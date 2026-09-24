import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const memory = vi.hoisted(() => ({
  vendors: [] as any[],
  bills: [] as any[],
  activityBills: [] as any[],
  rates: [] as any[],
  pi: [] as any[],
  trips: [] as any[],
  aliases: [] as any[],
  updates: [] as any[],
  updateConditions: [] as string[],
  injectPhantomOnLock: false,
}));
vi.mock("../server/db", async () => {
  const s = await import("../shared/schema");
  const project = (selection: Record<string, any> | undefined, row: any) => {
    if (!selection) return row;
    return Object.fromEntries(Object.keys(selection).map(key => [key, row[key]]));
  };
  const db = {
    select: (selection?: Record<string, any>) => ({
      from: (table: any) => {
        const getRows = () => table === s.vendors ? memory.vendors
          : table === s.vendorBills ? selection?.itemId || selection?.siteName ? memory.activityBills : memory.bills
          : table === s.vendorRateCards ? memory.rates
          : table === s.vendorAliases ? memory.aliases
          : table === s.purchaseIndentItems ? memory.pi
          : table === s.siteMaterialTrips ? memory.trips.filter(row => selection?.supplierId ? row.supplierId != null : row.materialId != null)
          : table === s.sites ? [{ id: 7, name: "SYNTHETIC North Site" }]
          : [];
        const get = () => getRows()
          .filter(row => selection?.name === s.vendorBills.vendorName ? row.vendorId == null
            : selection?.name === s.vendorRateCards.vendorName ? row.vendorId == null
            : selection?.name === s.purchaseIndentItems.vendor ? row.vendorId == null : true)
          .map(row => project(selection, row));
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          leftJoin: () => chain,
          innerJoin: () => chain,
          for: async () => get(),
          then: (resolve: (value: any) => void) => resolve(get()),
        };
        return chain;
      },
    }),
    insert: (table: any) => ({
      values: (payload: any) => ({
        returning: async (selection?: any) => {
          if (table !== s.vendors) throw new Error("Unexpected insert table");
          const row = { ...payload, id: Math.max(0, ...memory.vendors.map(v => v.id)) + 1, createdAt: new Date(), updatedAt: new Date() };
          memory.vendors.push(row);
          return [project(selection, row)];
        },
      }),
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: (condition: any) => ({
          returning: async (selection?: any) => {
            const rows = table === s.vendors ? memory.vendors : table === s.vendorBills ? memory.bills
              : table === s.vendorRateCards ? memory.rates : table === s.purchaseIndentItems ? memory.pi : [];
            const compiled = new PgDialect().sqlToQuery(condition);
            memory.updateConditions.push(compiled.sql);
            const target = table === s.vendors ? rows.filter(row => row.id === 1) :
              rows.filter(row => row.vendorId == null && compiled.params.includes(row.id) && compiled.params.includes(row.name));
            for (const row of target) Object.assign(row, patch);
            memory.updates.push({ table, patch, count: target.length });
            return target.map(row => project(selection, row));
          },
        }),
      }),
    }),
    transaction: async (fn: (tx: any) => Promise<any>) => {
      // Dedicated transaction SELECT needs to return the still-unlinked bill/rate rows.
      const tx = {
        ...db,
        select: (selection?: any) => ({
          from: (table: any) => {
            let condition: any;
            const list = () => table === s.vendors ? memory.vendors.map(row => project(selection, row))
               : (table === s.vendorBills ? memory.bills : table === s.purchaseIndentItems ? memory.pi : memory.rates)
                 .filter(row => row.vendorId == null && (!condition || new PgDialect().sqlToQuery(condition).params.includes(row.name)))
                 .map(row => project(selection, row));
             const chain = { where: (query: any) => { condition = query; return chain; }, leftJoin: () => chain, for: async () => {
              const locked = list();
              if (memory.injectPhantomOnLock && table === s.vendorBills) {
                memory.bills.push({ id: 12, name: "SYNTHETIC Alias Ltd", vendorId: null });
                memory.injectPhantomOnLock = false;
              }
              return locked;
            }, then: (resolve: any) => resolve(list()) };
            return chain;
          },
        }),
      };
      return fn(tx);
    },
  };
  return { db };
});

import { registerVendorMasterRoutes } from "../server/vendor-master";

function api(admin = true, permitted: string[] | null = null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).authUser = { id: 99, isAdmin: admin, isOwner: false };
    (req as any).authPermissions = { master_parties: { view: true, create: false } };
    next();
  });
  registerVendorMasterRoutes(app, async () => permitted);
  return app;
}

beforeEach(() => {
  memory.vendors = [{
    id: 1, name: "SYNTHETIC Canonical", businessName: "SYNTHETIC Trading",
    bankAccountName: "SYNTHETIC Holder", bankAccountNumber: "SYNTHETIC-ACCOUNT",
    bankIfsc: "SYN-IFSC", bankName: "SYN Bank", isActive: true,
  }];
  memory.bills = [
    { id: 10, name: "SYNTHETIC Alias Ltd", vendorId: null },
    { id: 11, name: "SYNTHETIC Alias Ltd", vendorId: null },
  ];
  memory.rates = [{ id: 20, name: "SYNTHETIC New Supplier", vendorId: null }];
  memory.activityBills = [];
  memory.pi = [];
  memory.trips = [];
  memory.aliases = [{ alias: "SYNTHETIC Alias Ltd", canonicalName: "SYNTHETIC Canonical" }];
  memory.updates = [];
  memory.updateConditions = [];
  memory.injectPhantomOnLock = false;
});

describe("Vendor Master Part A real Express handlers, synthetic transaction DB boundary", () => {
  it("VENDOR-03 lists only unlinked bulk PI routes, with catalog bulk override and null/mistagged fallback", async () => {
    memory.pi = [
      { id: 31, name: "SYNTHETIC Alias Ltd", vendorId: null, procurementRoute: "material", catalogProcurementRoute: null },
      { id: 32, name: "SYNTHETIC Alias Ltd", vendorId: null, procurementRoute: "stores", catalogProcurementRoute: "bulk_plant" },
      { id: 33, name: "SYNTHETIC Alias Ltd", vendorId: null, procurementRoute: "bulk_plant", catalogProcurementRoute: "unconfigured" },
      { id: 34, name: "SYNTHETIC Alias Ltd", vendorId: null, procurementRoute: "stores", catalogProcurementRoute: "stores" },
      { id: 35, name: "SYNTHETIC Stores Only", vendorId: null, procurementRoute: "stores", catalogProcurementRoute: null },
      { id: 36, name: "SYNTHETIC Blank Route", vendorId: null, procurementRoute: null, catalogProcurementRoute: null },
      { id: 37, name: "SYNTHETIC Linked", vendorId: 1, procurementRoute: "material", catalogProcurementRoute: null },
      { id: 38, name: "SYNTHETIC Catalog Bulk", vendorId: null, procurementRoute: null, catalogProcurementRoute: "material" },
    ];
    const review = await request(api()).get("/api/vendor-master/review");
    expect(review.status).toBe(200);
    expect(review.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "indents", name: "SYNTHETIC Alias Ltd", ids: [31, 32, 33], count: 3, suggestionId: 1 }),
      expect.objectContaining({ role: "indents", name: "SYNTHETIC Catalog Bulk", ids: [38], count: 1 }),
    ]));
    expect(review.body).toHaveLength(2);
    expect(review.body.every((p: any) => p.role === "indents")).toBe(true);
    expect(memory.bills.every(row => row.vendorId == null)).toBe(true);
    expect(memory.rates.every(row => row.vendorId == null)).toBe(true);

    const confirmed = await request(api()).post("/api/vendor-master/review/confirm")
      .send({ role: "indents", name: "SYNTHETIC Alias Ltd", ids: [31, 32, 33], vendorId: 1 });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ vendorId: 1, linked: 3 });
    expect(memory.pi.filter(row => [31, 32, 33].includes(row.id)).every(row => row.vendorId === 1)).toBe(true);
    expect(memory.pi.find(row => row.id === 34)?.vendorId).toBeNull();
    expect(memory.pi.find(row => row.id === 35)?.vendorId).toBeNull();
    expect((await request(api()).get("/api/vendor-master/review")).body).toEqual([
      expect.objectContaining({ ids: [38] }),
    ]);
  });
  it("VENDOR-03 rejects stale bulk subsets and duplicates without linking stores; legacy role confirm remains supported", async () => {
    memory.pi = [
      { id: 41, name: "SYNTHETIC Alias Ltd", vendorId: null, procurementRoute: "material", catalogProcurementRoute: null },
      { id: 42, name: "SYNTHETIC Alias Ltd", vendorId: null, procurementRoute: "stores", catalogProcurementRoute: null },
    ];
    const app = api();
    expect((await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "indents", name: "SYNTHETIC Alias Ltd", ids: [41, 42], vendorId: 1 })).status).toBe(409);
    expect((await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "indents", name: "SYNTHETIC Alias Ltd", ids: [41, 41], vendorId: 1 })).status).toBe(409);
    memory.pi[0].procurementRoute = "stores";
    expect((await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "indents", name: "SYNTHETIC Alias Ltd", ids: [41], vendorId: 1 })).status).toBe(409);
    expect(memory.pi.every(row => row.vendorId == null)).toBe(true);
    expect((await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: "SYNTHETIC Alias Ltd", ids: [10, 11], vendorId: 1 })).status).toBe(200);
  });
  it("VENDOR-03 leaves full linked activity aggregation unaffected by review filtering", async () => {
    memory.activityBills = [{ itemId: 31, vendorId: 1, siteName: "SYNTHETIC North Site", siteId: null, billType: "equipment", category: "Equipment Hire" }];
    memory.pi = [{ id: 50, name: "SYNTHETIC Stores Only", vendorId: 1, siteId: 7, procurementRoute: "stores", catalogProcurementRoute: null }];
    memory.trips = [{ site: "SYNTHETIC North Site", supplierId: 1, materialId: 1 }];
    expect((await request(api()).get("/api/vendor-master/review")).body).toEqual([]);
    const activity = await request(api()).get("/api/vendor-master/1/activity");
    expect(activity.status).toBe(200);
    expect(activity.body.sites).toEqual([
      expect.objectContaining({ site: "SYNTHETIC North Site", equipment: 1, material: 2, transport: 1, labour: 0 }),
    ]);
  });
  it("VENDOR-02 A create trims/uppercases both names while leaving existing rows untouched", async () => {
    const app = api();
    const created = await request(app).post("/api/vendor-master").send({
      name: "  saravana metal industries  ", businessName: "  Saravana Metal Trading  ",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "SARAVANA METAL INDUSTRIES", businessName: "SARAVANA METAL TRADING" });
    expect(memory.vendors[0]).toMatchObject({ name: "SYNTHETIC Canonical", businessName: "SYNTHETIC Trading" });
    const list = await request(app).get("/api/vendor-master");
    expect(list.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "SARAVANA METAL INDUSTRIES", businessName: "SARAVANA METAL TRADING" }),
    ]));
  });
  it("VENDOR-02 B patch uppercases supplied names and preserves null/omitted business name", async () => {
    const app = api();
    const edited = await request(app).patch("/api/vendor-master/1").send({
      name: "  sYnThEtIc edited  ", businessName: "  Edited works  ",
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: "SYNTHETIC EDITED", businessName: "EDITED WORKS" });
    const nullBusiness = await request(app).patch("/api/vendor-master/1").send({ businessName: null });
    expect(nullBusiness.status).toBe(200);
    expect(nullBusiness.body.businessName).toBeNull();
    const onlyName = await request(app).patch("/api/vendor-master/1").send({ name: "  another Name " });
    expect(onlyName.body).toMatchObject({ name: "ANOTHER NAME", businessName: null });
  });
  it("VENDOR-02 C inline create uppercases while review aliases still match regardless of case", async () => {
    const app = api();
    memory.aliases = [{ alias: "synthetic alias ltd", canonicalName: "synthetic canonical" }];
    const review = await request(app).get("/api/vendor-master/review");
    expect(review.status).toBe(200);
    expect(review.body).toEqual([]);
    const inline = await request(app).post("/api/vendor-master/review/confirm").send({
      role: "rates", name: "SYNTHETIC New Supplier", ids: [20],
      newVendor: { name: "  new Supplier  ", businessName: "  Supply house  " },
    });
    expect(inline.status).toBe(200);
    expect(memory.vendors[1]).toMatchObject({ name: "NEW SUPPLIER", businessName: "SUPPLY HOUSE" });
    expect(memory.rates[0]).toMatchObject({ name: "SYNTHETIC New Supplier", vendorId: 2 });
  });
  it("A1 creates full structured fields, and blocks non-admin creation/bank reads", async () => {
    const input = {
      name: "SYNTHETIC Fleet", businessName: "SYNTHETIC Fleet Works", gstNumber: "GST-SYN",
      panNumber: "PAN-SYN", address: "SYNTHETIC Address", bankAccountName: "SYNTHETIC Holder",
      bankAccountNumber: "SYNTHETIC-NEW-ACCOUNT", bankIfsc: "SYN-IFSC", bankName: "SYN Bank",
      contactPersonName: "SYNTHETIC Contact", contactPhone: "00000000", contactEmail: "fixture@example.invalid",
    };
    expect((await request(api(false)).post("/api/vendor-master").send(input)).status).toBe(403);
    const created = await request(api()).post("/api/vendor-master").send(input);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...input, name: "SYNTHETIC FLEET", businessName: "SYNTHETIC FLEET WORKS" });
    expect(memory.vendors[1].bankAccountNumber).toBe(input.bankAccountNumber);
    const privateList = await request(api(false)).get("/api/vendor-master");
    expect(privateList.status).toBe(200);
    expect(privateList.body[1]).not.toHaveProperty("bankAccountNumber");
    expect(privateList.body[1]).toHaveProperty("gstNumber", input.gstNumber);
  });
  it("A2 proposes alias hint; A3 requires explicit confirm and changes only the FK, not matching names", async () => {
    const app = api();
    const review = await request(app).get("/api/vendor-master/review");
    expect(review.status).toBe(200);
    expect(review.body).toEqual([]);
    expect(memory.bills.every(row => row.vendorId === null)).toBe(true);
    const confirmed = await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: "SYNTHETIC Alias Ltd", ids: [10, 11], vendorId: 1 });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ vendorId: 1, linked: 2 });
    expect(memory.bills).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "SYNTHETIC Alias Ltd", vendorId: 1 }),
    ]));
    expect(memory.rates[0]).toMatchObject({ name: "SYNTHETIC New Supplier", vendorId: null });
    expect(memory.updates[0].patch).toEqual({ vendorId: 1 });
    expect(memory.updateConditions[0]).toContain('"id" in');
  });
  it("A4 creates a master inside the same confirmation transaction for a previously unmatched name", async () => {
    const result = await request(api()).post("/api/vendor-master/review/confirm").send({
      role: "rates", name: "SYNTHETIC New Supplier", ids: [20],
      newVendor: { name: "SYNTHETIC New Supplier", gstNumber: "SYN-GST-NEW" },
    });
    expect(result.status).toBe(200);
    expect(memory.vendors[1]).toMatchObject({ id: 2, gstNumber: "SYN-GST-NEW" });
    expect(memory.rates[0]).toMatchObject({ name: "SYNTHETIC New Supplier", vendorId: 2 });
  });
  it("confirms only locked submitted IDs even when a new same-name bill arrives after snapshot", async () => {
    memory.injectPhantomOnLock = true;
    const result = await request(api()).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: "SYNTHETIC Alias Ltd", ids: [10, 11], vendorId: 1 });
    expect(result.status).toBe(200);
    expect(memory.bills).toEqual([
      expect.objectContaining({ id: 10, vendorId: 1 }),
      expect.objectContaining({ id: 11, vendorId: 1 }),
      expect.objectContaining({ id: 12, vendorId: null }),
    ]);
    expect(memory.updateConditions[0]).toContain('"id" in');
  });
  it("rejects stale/duplicate confirmations and unauthorized mutations before writes", async () => {
    const app = api();
    const stale = await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: "SYNTHETIC Alias Ltd", ids: [10], vendorId: 1 });
    expect(stale.status).toBe(409);
    const duplicate = await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: "SYNTHETIC Alias Ltd", ids: [10, 10, 11], vendorId: 1 });
    expect(duplicate.status).toBe(409);
    expect(memory.updates).toHaveLength(0);
    expect(memory.bills.every(row => row.vendorId == null)).toBe(true);
    expect((await request(api(false)).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: "SYNTHETIC Alias Ltd", ids: [10, 11], vendorId: 1 })).status).toBe(403);
  });
  it("A5 aggregates actual linked site rows, applies site restrictions, and redacts bank fields", async () => {
    memory.activityBills = [
      { itemId: 31, vendorId: 1, siteName: "SYNTHETIC North Site", siteId: null, billType: "equipment", category: "Equipment Hire" },
      { itemId: 32, vendorId: 1, siteName: "SYNTHETIC South Site", siteId: null, billType: "labour", category: "Labour" },
    ];
    memory.pi = [{ vendorId: 1, siteId: 7 }];
    memory.trips = [
      { site: "SYNTHETIC North Site", supplierId: 1, materialId: null },
      { site: "SYNTHETIC South Site", supplierId: null, materialId: 1 },
    ];
    const full = await request(api()).get("/api/vendor-master/1/activity");
    expect(full.status).toBe(200);
    expect(full.body.sites).toEqual(expect.arrayContaining([
      expect.objectContaining({ site: "SYNTHETIC North Site", equipment: 1, material: 1, transport: 1, labour: 0 }),
      expect.objectContaining({ site: "SYNTHETIC South Site", equipment: 0, material: 1, transport: 0, labour: 1 }),
    ]));
    const scoped = await request(api(false, ["SYNTHETIC North Site"])).get("/api/vendor-master/1/activity");
    expect(scoped.status).toBe(200);
    expect(scoped.body.sites).toEqual([
      expect.objectContaining({ site: "SYNTHETIC North Site", equipment: 1, material: 1, transport: 1, labour: 0 }),
    ]);
    expect(scoped.body.vendor).not.toHaveProperty("bankAccountNumber");
    expect((await request(api(false, ["SYNTHETIC Other Site"])).get("/api/vendor-master/1/activity")).status).toBe(403);
  });
});