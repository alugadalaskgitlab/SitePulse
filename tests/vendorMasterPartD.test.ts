import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import express from "express";
import request from "supertest";

const fixture = vi.hoisted(() => ({ db: null as any, admin: true }));
vi.mock("../server/db", () => ({ get db() { return fixture.db; } }));
vi.mock("../server/auth-routes", () => ({
  assertAdmin: (_req: any, res: any) => fixture.admin || (res.status(403).json({ message: "Forbidden" }), false),
  assertView: () => true,
}));
import { registerVendorMasterRoutes } from "../server/vendor-master";

let pg: PGlite;
let app: express.Express;
const groups = [
  { role: "transport", name: "SYNTHETIC Gangaram Narasimhulu", ids: [1] },
  { role: "materialSource", name: "SYNTHETIC Gangaram Narsimhulu", ids: [1, 2] },
];
const batch = (more = groups, vendorId = 1) => ({ groups: more, vendorId });
const rows = (table: string) => pg.query(`SELECT * FROM ${table} ORDER BY id`);
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE vendors (id integer PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE vendor_aliases (id serial PRIMARY KEY, alias text NOT NULL UNIQUE, canonical_name text NOT NULL, created_at timestamp DEFAULT now());
    CREATE TABLE vendor_bills (id integer PRIMARY KEY, vendor_name text, vendor_id integer);
    CREATE TABLE vendor_rate_cards (id integer PRIMARY KEY, vendor_name text, vendor_id integer);
    CREATE TABLE purchase_indent_items (id integer PRIMARY KEY, vendor text, vendor_id integer);
    CREATE TABLE site_material_trips (id integer PRIMARY KEY, supplier text, supplier_vendor_id integer, material_source_supplier text, material_source_vendor_id integer);
  `);
  fixture.db = drizzle(pg);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).authUser = { isOwner: false, isAdmin: fixture.admin }; next(); });
  registerVendorMasterRoutes(app, async () => null);
}, 120_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  fixture.admin = true;
  await pg.exec(`
    TRUNCATE vendors, vendor_aliases, vendor_bills, vendor_rate_cards, purchase_indent_items, site_material_trips RESTART IDENTITY;
    INSERT INTO vendors (id,name) VALUES (1,'SYNTHETIC GANGARAM'), (2,'SYNTHETIC OTHER');
    INSERT INTO site_material_trips (id,supplier,material_source_supplier) VALUES
      (1,'SYNTHETIC Gangaram Narasimhulu','SYNTHETIC Gangaram Narsimhulu'),
      (2,'SYNTHETIC Other Transport','SYNTHETIC Gangaram Narsimhulu');
    INSERT INTO vendor_bills (id,vendor_name) VALUES (10,'SYNTHETIC Gangaram Narasimhulu');
  `);
});
describe("Vendor Master D real handlers in isolated PGlite", () => {
  it("sorts within role, links two spellings across trip roles including same physical row, and creates aliases exactly once", async () => {
    const before = await request(app).get("/api/vendor-master/review");
    expect(before.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "transport", ids: [1] }),
      expect.objectContaining({ role: "materialSource", ids: [1, 2] }),
    ]));
    expect(before.body.filter((p: any) => p.role === "transport").map((p: any) => p.name))
      .toEqual(["SYNTHETIC Gangaram Narasimhulu", "SYNTHETIC Other Transport"]);
    expect((await request(app).post("/api/vendor-master/review/confirm").send(batch())).body)
      .toMatchObject({ vendorId: 1, linked: 3 });
    expect((await rows("site_material_trips")).rows).toEqual([
      expect.objectContaining({ supplier: groups[0].name, supplier_vendor_id: 1, material_source_supplier: groups[1].name, material_source_vendor_id: 1 }),
      expect.objectContaining({ supplier_vendor_id: null, material_source_vendor_id: 1 }),
    ]);
    expect((await rows("vendor_aliases")).rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: groups[0].name, canonical_name: "SYNTHETIC GANGARAM" }),
      expect.objectContaining({ alias: groups[1].name, canonical_name: "SYNTHETIC GANGARAM" }),
    ]));
    expect((await rows("vendor_aliases")).rows).toHaveLength(2);
    expect((await request(app).get("/api/vendor-master/review")).body).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "materialSource", name: groups[1].name }),
    ]));
  });
  it("rolls back all links and aliases for a stale later group", async () => {
    await pg.exec("UPDATE site_material_trips SET material_source_vendor_id = 2 WHERE id = 2");
    const result = await request(app).post("/api/vendor-master/review/confirm").send(batch());
    expect(result.status).toBe(409);
    expect((await rows("site_material_trips")).rows[0]).toMatchObject({ supplier_vendor_id: null, material_source_vendor_id: null });
    expect((await rows("vendor_aliases")).rows).toHaveLength(0);
  });
  it("rejects duplicate IDs and overlapping groups, without writes", async () => {
    for (const submitted of [
      batch([{ ...groups[0], ids: [1, 1] }, groups[1]]),
      batch([groups[0], { ...groups[0], name: "OTHER", ids: [1] }]),
    ]) expect((await request(app).post("/api/vendor-master/review/confirm").send(submitted)).status).toBe(409);
    expect((await rows("vendor_aliases")).rows).toHaveLength(0);
    expect((await rows("site_material_trips")).rows[0]).toMatchObject({ supplier_vendor_id: null, material_source_vendor_id: null });
  });
  it("reuses matching alias, rejects conflicting alias without overwriting or linking; concurrent retries cannot double insert", async () => {
    await pg.exec(`INSERT INTO vendor_aliases (alias,canonical_name) VALUES ('SYNTHETIC Gangaram Narasimhulu','SYNTHETIC GANGARAM')`);
    expect((await request(app).post("/api/vendor-master/review/confirm").send(batch())).status).toBe(200);
    expect((await rows("vendor_aliases")).rows).toHaveLength(2);
    await pg.exec("UPDATE site_material_trips SET supplier_vendor_id = null, material_source_vendor_id = null; DELETE FROM vendor_aliases; INSERT INTO vendor_aliases (alias,canonical_name) VALUES ('SYNTHETIC Gangaram Narsimhulu','SYNTHETIC OTHER')");
    const conflict = await request(app).post("/api/vendor-master/review/confirm").send(batch());
    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toContain("already belongs");
    expect((await rows("site_material_trips")).rows[0]).toMatchObject({ supplier_vendor_id: null, material_source_vendor_id: null });
    expect((await rows("vendor_aliases")).rows).toEqual([expect.objectContaining({ canonical_name: "SYNTHETIC OTHER" })]);
    await pg.exec("DELETE FROM vendor_aliases");
    const concurrent = await Promise.all([request(app).post("/api/vendor-master/review/confirm").send(batch()), request(app).post("/api/vendor-master/review/confirm").send(batch())]);
    expect(concurrent.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await rows("vendor_aliases")).rows).toHaveLength(2);
  });
  it("keeps single confirm and admin boundary intact", async () => {
    fixture.admin = false;
    expect((await request(app).post("/api/vendor-master/review/confirm").send(batch())).status).toBe(403);
    fixture.admin = true;
    const single = await request(app).post("/api/vendor-master/review/confirm")
      .send({ role: "bills", name: groups[0].name, ids: [10], vendorId: 1 });
    expect(single.status).toBe(200);
    expect((await rows("vendor_bills")).rows[0]).toMatchObject({ vendor_name: groups[0].name, vendor_id: 1 });
    expect((await rows("vendor_aliases")).rows).toHaveLength(0);
  });
});