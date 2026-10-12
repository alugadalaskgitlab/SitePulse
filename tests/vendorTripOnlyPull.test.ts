import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { tripHireEligibility } from "../server/tripHireEligibility";
import { calculateHireGroup } from "../shared/hireBilling";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
let pg: PGlite, db: any, storage: any;
const app = express();
const from = "2026-10-01", to = "2026-10-02";
const name = "CONFIRMED TRANSPORT MASTER";
beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const cfg = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${cfg.name}" (${cfg.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  await pg.exec("ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT NOW()");
  db = holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
  await db.insert(schema.vendors).values([
    { id: 91, name, businessName: "Transport Business", isActive: true },
    { id: 92, name: "OTHER OWNER", isActive: true },
  ]);
  for (const id of [91, 92]) {
    await db.insert(schema.equipmentMaster).values({
      id, name: `Tipper ${id}`, registrationNumber: `TRUCK${id}`, ownership: "hired", isActive: 1,
      vendorName: "OLD OWNER SPELLING", hireBillingBasis: "trip", hireRate: 17,
      hireDieselResponsibility: "vendor", hireStartDate: "2026-01-01",
    });
    await db.insert(schema.auditLogs).values({ module: "equipment_master", transactionId: id,
      action: "confirm_vendor_identity", newValues: { vendorId: 91, recordedName: "OLD OWNER SPELLING" } });
    for (const date of [from, from, to]) {
      await storage.createSiteMaterialTrip({
        date, site: "ROAD", material: "Soil", quantity: 12, uom: "Cum",
        supplier: name, supplierVendorId: 91, transportType: "agency_vendor",
        materialSourceType: "own_source", materialSourceLabel: "Borrow pit",
        vehicleNumber: `TRUCK${id}`, isCancelled: false, isDeleted: false,
      }, undefined, { equipmentId: id, actor: { id: 4, fullName: "Staff" } });
    }
  }
  app.use(express.json());
  const source = fs.readFileSync("server/routes.ts", "utf8");
  const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);
  const routes: string[] = [];
  const wanted = new Set([
    "/api/vendor-bills/discover-vendors", "/api/vendor-bills/hire-activities",
    "/api/vendor-bills/trip-hire-eligibility", "/api/vendor-bills/:id",
  ]);
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
      n.expression.expression.getText(ast) === "app" && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) &&
      ((n.expression.name.text === "get" && wanted.has(n.arguments[0].text)) ||
       (n.expression.name.text === "post" && n.arguments[0].text === "/api/vendor-bills"))) routes.push(n.getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  expect(routes).toHaveLength(5);
  const deps = { app, storage, db, z, tripHireEligibility, createVendorBillRequestSchema: schema.createVendorBillRequestSchema,
    assertView: () => true, assertCreateEither: () => true, resolveVendorBillSite: async () => ({}),
    getPermittedSiteNames: async () => null, assertVendorBillAutoSources: async () => true, sendPushToSection: async () => {},
    scopeVendorBillsToSiteAccess: async (_req: any, rows: any[]) => rows,
    resolveSavedEquipmentEvidenceSources: (rows: any[]) => rows, attachVendorBillEquipmentEvidence: async (rows: any[]) => rows };
  new Function(...Object.keys(deps), ts.transpileModule(routes.join(";\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(deps));
}, 60000);
afterAll(async () => pg.close());
const query = { vendorName: name, periodFrom: from, periodTo: to };
it("discovers Trip-default tippers by confirmed owner ID with zero DPR/usage and saves/reloads Daily and Trip bills", async () => {
  expect(await db.select().from(schema.equipmentLogs)).toHaveLength(0);
  expect(await db.select().from(schema.equipmentUsage)).toHaveLength(0);
  const discovered = await request(app).get("/api/vendor-bills/discover-vendors").query({ ...query, billType: "equipment" });
  expect(discovered.status).toBe(200);
  expect(discovered.body.some((v: any) => v.vendorName === name)).toBe(true);
  const feed = await request(app).get("/api/vendor-bills/hire-activities").query(query);
  expect(feed.status).toBe(200);
  expect(feed.body.filter((r: any) => r.confirmedForDailyHire)).toHaveLength(6);
  expect(feed.body.find((r: any) => r.source === "equipment_default").equipment.linkedVendorName).toBe("Transport Business");
  const checks = await request(app).get("/api/vendor-bills/trip-hire-eligibility").query(query);
  expect(checks.status).toBe(200);
  expect(checks.body.every((r: any) => r.reasons.length === 0)).toBe(true);
  const before = await db.select().from(schema.siteMaterialTrips);
  for (const [equipmentId, basis, quantity] of [[91, "daily", 1.5], [92, "trip", 3]] as const) {
    const activities = feed.body.filter((r: any) => r.equipmentId === equipmentId && r.source === "site_material_trip");
    const payload = {
      billDate: to, billNo: "AUTO", billType: "equipment", vendorName: name, billingVendorId: 91,
      status: "draft", totalAmount: 0, periodFrom: from, periodTo: to, items: [], hireBillingMode: "vb10_automatic",
      hireGroups: [{ equipmentId, basis, rate: 2500, periodFrom: from, periodTo: to,
        dailyDecisions: [{ date: from, decision: "full_day", reason: "Attendance reviewed" },
          { date: to, decision: "half_day", reason: "Half day agreed" }],
        tripDecisions: activities.map((r: any) => ({ source: r.source, sourceId: r.sourceId, selected: true, remarks: "Individual trip checked" })),
        exceptionDecisions: [], dieselRecoveryAmount: 0 }],
    };
    const saved = await request(app).post("/api/vendor-bills").send(payload);
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const reload = await request(app).get(`/api/vendor-bills/${saved.body.id}`);
    expect(reload.status).toBe(200);
    expect(reload.body.items[0]).toMatchObject({ qty: quantity, amount: quantity * 2500 });
    const statement = reload.body.hireStatements[0];
    expect(statement).toMatchObject({ billingBasis: basis, rate: 2500 });
    expect(statement.calculationSnapshot.sourceEvidence.activities.filter((r: any) => r.confirmedForDailyHire)).toHaveLength(3);
    expect((await request(app).post("/api/vendor-bills").send(payload)).status).toBe(409);
    expect(calculateHireGroup({ equipmentId, terms: { billingBasis: "hourly", rate: 2500 },
      periodFrom: from, periodTo: to, activities, tripDecisions: payload.hireGroups[0].tripDecisions }).quantity).toBe(0);
  }
  expect(await db.select().from(schema.siteMaterialTrips)).toEqual(before);
  expect((await db.select().from(schema.equipmentMaster)).every((e: any) => e.hireBillingBasis === "trip" && e.hireRate === 17)).toBe(true);
});
it("reports genuine transporter/owner mismatch and missing confirmation without making them daily-payable", async () => {
  const [bad] = await db.insert(schema.siteMaterialTrips).values({
    date: from, site: "ROAD", material: "Soil", quantity: 1, uom: "Cum",
    supplier: "OTHER OWNER", supplierVendorId: 92, vehicleNumber: "TRUCK91",
    transportType: "agency_vendor", isCancelled: false, isDeleted: false,
  }).returning();
  const eligibility = await request(app).get("/api/vendor-bills/trip-hire-eligibility").query(query);
  const row = eligibility.body.find((r: any) => r.tripId === bad.id);
  expect(row.reasons.join(" ")).toMatch(/not confirmed/);
  expect(row.reasons.join(" ")).toMatch(/do not agree/);
  const feed = await request(app).get("/api/vendor-bills/hire-activities").query(query);
  expect(feed.body.find((r: any) => r.source === "site_material_trip" && r.sourceId === bad.id).confirmedForDailyHire).toBe(false);
});
