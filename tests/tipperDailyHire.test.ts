import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { tripHireMatch, tripHireFingerprint, validTripHireLink } from "../shared/tripHireLink";
import { calculateHireGroup } from "../shared/hireBilling";
import { confirmTripHireLink, tripHireReview, guardTripHireOrdinaryItems } from "../server/tripHireLink";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));
let pg: PGlite, db: any, storage: any;
beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const cfg = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${cfg.name}" (${cfg.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  await pg.exec("ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT NOW()");
  db = holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
  await db.insert(schema.vendors).values({ id: 9, name: "Agency", isActive: true });
  await db.insert(schema.auditLogs).values([1, 2].map(transactionId => ({ module: "equipment_master", transactionId,
    action: "confirm_vendor_identity", userId: 4, userName: "Reviewer", reason: "Reviewed owner identity",
    newValues: { vendorId: 9, recordedName: "AGENCY" } })));
}, 60000);
afterAll(async () => pg.close());
const master = { id: 1, name: "Tipper", ownership: "hired", registrationNumber: "TS01AB1234", vendorName: "Agency", hireBillingBasis: "daily", hireRate: 2000, hireStartDate: "2026-01-01" };
const trip = { id: 1, date: "2026-10-01", site: "ROAD", vehicleNumber: "ts 01-ab 1234", supplier: "AGENCY",
  transportType: "agency_vendor", materialSourceType: "own_source", material: "Soil", quantity: 50, uom: "CFT", isCancelled: false, isDeleted: false };
it("suggests only unique registration and transport-owner matches, not material ownership", () => {
  expect(tripHireMatch(trip, [master]).suggestedEquipmentId).toBe(1);
  expect(tripHireMatch(trip, [master, { ...master, id: 2 }]).issue).toMatch(/Multiple/);
  expect(tripHireMatch({ ...trip, supplier: "Other" }, [master]).suggestedEquipmentId).toBeNull();
  expect(tripHireMatch({ ...trip, vehicleNumber: "" }, [master]).issue).toMatch(/missing/);
  expect(tripHireMatch({ ...trip, transportType: "in_house" }, [master]).suggestedEquipmentId).toBeNull();
});
const activity = (id: number, date: string) => ({ source: "site_material_trip" as const, sourceId: id,
  equipmentId: 1, businessDate: date, entryType: "daily_hire", status: "closed", numberOfTrips: 1, confirmedForDailyHire: true });
const calculate = (activities: any[], dailyDecisions: any[] = []) => calculateHireGroup({
  terms: { billingBasis: "daily", rate: 2000 }, periodFrom: "2026-10-01", periodTo: "2026-10-03",
  activities, maintenance: [], dailyDecisions,
});
it("counts many trips once per day, merges DPR evidence, and supports reviewed half/excluded days", () => {
  const activities = [activity(1, trip.date), activity(2, trip.date), activity(3, "2026-10-02"),
    { source: "dpr_log", sourceId: 4, equipmentId: 1, businessDate: trip.date, entryType: "daily_hire", status: "closed" }];
  expect(calculate(activities).quantity).toBe(2);
  expect(calculate(activities).grossAmount).toBe(4000);
  const result = calculate(activities, [{ date: trip.date, decision: "half_day", reason: "Reviewed partial attendance" },
    { date: "2026-10-02", decision: "exclude", reason: "Already billed" }]);
  expect(result.quantity).toBe(.5);
  expect(result.grossAmount).toBe(1000);
  expect(calculate([{ ...activity(1, trip.date), confirmedForDailyHire: false }]).quantity).toBe(0);
});
it("persists append-only confirmation, leaves original trips untouched, and exposes daily evidence without equipment logs", async () => {
  await db.insert(schema.equipmentMaster).values([master, { ...master, id: 2, registrationNumber: "TS02CD5555" }]);
  await db.insert(schema.siteMaterialTrips).values([trip, { ...trip, id: 2, vehicleNumber: "TS02CD5555" }]);
  const review = await tripHireReview(db, trip);
  await db.transaction((tx: any) => confirmTripHireLink(tx, trip, { equipmentId: 1, reason: "Owner verified", version: review.version, fingerprint: review.fingerprint }, { id: 4, fullName: "Reviewer" }));
  await db.transaction((tx: any) => confirmTripHireLink(tx, { ...trip, id: 2, vehicleNumber: "TS02CD5555" }, { equipmentId: 2, reason: "Future selection" }, { id: 4, fullName: "Reviewer" }, true));
  expect((await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, 1)))[0]).toMatchObject(trip);
  const rows = await storage.getVendorBillHireActivities("Agency", trip.date, "2026-10-03");
  expect(rows.filter((r: any) => r.confirmedForDailyHire)).toHaveLength(2);
  expect(rows.find((r: any) => r.confirmedForDailyHire)).toMatchObject({ hireConfirmation: { actor: "Reviewer" }, numberOfTrips: 1 });
  expect(rows.find((r: any) => r.confirmedForDailyHire).hoursOrKmRun).toBeUndefined();
  const current = await tripHireReview(db, trip);
  expect(validTripHireLink({ ...trip, supplier: "Different" }, master, current.confirmation)).toBe(false);
  await expect(db.transaction((tx: any) => confirmTripHireLink(tx, trip, { equipmentId: 1, reason: "Stale request", version: null, fingerprint: tripHireFingerprint(trip) }, { id: 4, fullName: "Reviewer" }))).rejects.toThrow(/changed/);
});
it("saves a real daily hire bill from confirmed trips, preserving source evidence and blocking a second bill", async () => {
  const data = { billDate: trip.date, billType: "equipment", vendorName: "Agency", periodFrom: trip.date,
    periodTo: trip.date, status: "draft", items: [{ equipmentId: 1, date: trip.date, source: "hire_group", category: "equipment",
      description: "Generated preview", qty: .5, rate: 2000, amount: 1000 }], hireBillingMode: "vb10_automatic",
    hireGroups: [{ equipmentId: 1, basis: "daily", rate: 2000, periodFrom: trip.date, periodTo: trip.date,
      dailyDecisions: [{ date: trip.date, decision: "half_day", reason: "Reviewed half day" }], tripDecisions: [], exceptionDecisions: [] }] };
  const bill = await storage.createVendorBill(data);
  expect(bill.items).toHaveLength(1);
  expect(bill.items[0]).toMatchObject({ category: "equipment", qty: .5, rate: 2000, amount: 1000 });
  const [statement] = await db.select().from(schema.hireStatements);
  expect(statement.calculationSnapshot.sourceEvidence.activities.some((a: any) => a.hireConfirmation?.actor === "Reviewer")).toBe(true);
  await expect(storage.createVendorBill(data)).rejects.toThrow(/already billed/);
});
it("saves future hired-vehicle confirmation atomically alongside a real trip", async () => {
  await pg.exec("SELECT setval(pg_get_serial_sequence('site_material_trips', 'id'), 10)");
  const created = await storage.createSiteMaterialTrip({ ...trip, id: undefined, date: "2026-10-03",
    materialSourceLabel: "Borrow area", vehicleNumber: "TS02CD5555" },
  { equipmentId: 2, reason: "Vehicle selected on entry", actor: { id: 4, fullName: "Reviewer" } });
  expect((await tripHireReview(db, created)).confirmation.valid).toBe(true);
  expect(created.materialSourceType).toBe("own_source");
  expect(created.quantity).toBe(50);
  expect(await db.select().from(schema.equipmentLogs)).toHaveLength(0);
  expect(await db.select().from(schema.equipmentUsage)).toHaveLength(0);
  expect(await db.select().from(schema.stockLedger)).toHaveLength(0);
});
it("blocks confirmed-link changes on paid activity and ordinary rows covered by a daily hire statement", async () => {
  await db.insert(schema.vendorBills).values({ id: 100, status: "paid", billNo: "PAID" });
  await db.insert(schema.vendorBillItems).values({ id: 100, billId: 100, equipmentId: 1, date: trip.date, category: "equipment", description: "Earlier daily hire" });
  await db.insert(schema.vendorBillItems).values({ id: 101, billId: 100, equipmentId: 2, date: trip.date, category: "equipment", description: "Paid operational day" });
  await expect(storage.createVendorBill({ billDate: trip.date, billType: "equipment", vendorName: "Agency", periodFrom: trip.date,
    periodTo: trip.date, status: "draft", items: [], hireGroups: [{ equipmentId: 2, basis: "daily", rate: 2000,
      periodFrom: trip.date, periodTo: trip.date, dailyDecisions: [{ date: trip.date, decision: "full_day", reason: "Reviewed" }] }] })).rejects.toThrow(/already billed/);
  const review = await tripHireReview(db, trip);
  await expect(db.transaction((tx: any) => confirmTripHireLink(tx, trip, { equipmentId: 1, reason: "Reconfirm", fingerprint: review.fingerprint, version: review.version }, { id: 4, fullName: "Reviewer" }))).rejects.toThrow(/billing evidence/);
  await db.insert(schema.hireStatements).values({ id: 100, equipmentId: 2, billingBasis: "daily", periodFrom: trip.date, periodTo: trip.date, vendorBillId: 100 });
  await expect(db.transaction((tx: any) => guardTripHireOrdinaryItems(tx, [{ equipmentId: 2, date: trip.date, category: "equipment" }]))).rejects.toThrow(/already covers/);
});

it("real create/reload routes retain reviewed multi-date, multi-source, one-time tipper days and reject recharges", async () => {
  await pg.exec(`CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON hire_statements(equipment_id,period_from,period_to) WHERE NOT (billing_basis = 'daily' AND vendor_bill_id IS NOT NULL)`);
  const machine = { ...master, id: 20, registrationNumber: "TEST20", vendorName: "ONE TIME TEST OWNER" };
  await db.insert(schema.equipmentMaster).values(machine);
  const originals = [21, 22, 23].map((id, i) => ({ ...trip, id, vehicleNumber: "TEST20", supplier: machine.vendorName,
    date: i < 2 ? "2026-11-01" : "2026-11-02" }));
  await db.insert(schema.siteMaterialTrips).values(originals);
  for (const t of originals) await db.transaction((tx: any) => confirmTripHireLink(tx, t, { equipmentId: 20, reason: "Historical attendance checked" }, { id: 4, fullName: "Reviewer" }, true));
  await db.insert(schema.dprs).values({ id: 20, date: "2026-11-01", site: "ROAD", isSuperseded: false, dprStatus: "submitted" });
  await db.insert(schema.equipmentLogs).values({ id: 20, dprId: 20, equipmentId: 20, entryType: "daily", hoursWorked: 3 });
  const app = express(); app.use(express.json());
  const src = fs.readFileSync("server/routes.ts", "utf8");
  const ast = ts.createSourceFile("routes.ts", src, ts.ScriptTarget.Latest, true);
  const routes: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(ast) === "app" &&
      ((n.expression.name.text === "post" && n.arguments[0]?.getText(ast) === '"/api/vendor-bills"') ||
       (n.expression.name.text === "get" && n.arguments[0]?.getText(ast) === '"/api/vendor-bills/:id"'))) routes.push(n.getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  expect(routes).toHaveLength(2);
  const deps = { app, storage, z, createVendorBillRequestSchema: schema.createVendorBillRequestSchema,
    assertCreateEither: () => true, resolveVendorBillSite: async () => ({}), getPermittedSiteNames: async () => null,
    assertVendorBillAutoSources: async () => true, sendPushToSection: async () => {},
    scopeVendorBillsToSiteAccess: async (_req: any, rows: any[]) => rows,
    resolveSavedEquipmentEvidenceSources: (rows: any[]) => rows,
    attachVendorBillEquipmentEvidence: async (rows: any[]) => rows };
  new Function(...Object.keys(deps), ts.transpileModule(routes.join(";\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(deps));
  const payload = (first: string, second: string) => ({
    billDate: "2026-11-02", billNo: "AUTO", billType: "equipment", vendorName: machine.vendorName, status: "draft", totalAmount: 0,
    periodFrom: "2026-11-01", periodTo: "2026-11-02", items: [], hireBillingMode: "vb10_automatic",
    hireGroups: [{ equipmentId: 20, basis: "daily", rate: 2000, periodFrom: "2026-11-01", periodTo: "2026-11-02",
      dailyDecisions: [{ date: "2026-11-01", decision: first, reason: "DPR and two trips checked" },
        { date: "2026-11-02", decision: second, reason: "Reviewed second day" }], tripDecisions: [], exceptionDecisions: [] }],
  });
  const saved = await request(app).post("/api/vendor-bills").send(payload("half_day", "exclude"));
  expect(saved.status, JSON.stringify(saved.body)).toBe(201);
  const reopened = await request(app).get(`/api/vendor-bills/${saved.body.id}`);
  expect(reopened.status).toBe(200);
  expect(reopened.body.items[0]).toMatchObject({ qty: .5, amount: 1000 });
  expect(reopened.body.hireStatements[0].calculationSnapshot.dailyDecisions).toEqual(payload("half_day", "exclude").hireGroups[0].dailyDecisions);
  const evidence = reopened.body.hireStatements[0].calculationSnapshot.sourceEvidence.activities;
  expect(evidence.filter((a: any) => a.confirmedForDailyHire)).toHaveLength(3);
  expect(evidence.some((a: any) => a.source === "dpr_log")).toBe(true);
  expect((await request(app).post("/api/vendor-bills").send(payload("full_day", "full_day"))).status).toBe(409);
  const remaining = await request(app).post("/api/vendor-bills").send(payload("exclude", "full_day"));
  expect(remaining.status, JSON.stringify(remaining.body)).toBe(201);
  expect(remaining.body.items[0]).toMatchObject({ qty: 1, amount: 2000 });
  expect((await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, 21)))[0]).toMatchObject(originals[0]);
});

it("saves independent bill terms across bases, edits only a draft and freezes completed bills", async () => {
  const tripMaster = { ...master, id: 30, registrationNumber: "TERMS30", vendorName: "TERMS OWNER",
    hireBillingBasis: "trip", hireRate: 10, hireStartDate: "2027-01-01" };
  const monthlyMaster = { ...tripMaster, id: 31, registrationNumber: "TERMS31", hireBillingBasis: "monthly", hireRate: 90000 };
  await db.insert(schema.equipmentMaster).values([tripMaster, monthlyMaster]);
  const t = { ...trip, id: 30, date: "2026-12-01", vehicleNumber: "TERMS30", supplier: "TERMS OWNER" };
  await db.insert(schema.siteMaterialTrips).values(t);
  await db.transaction((tx: any) => confirmTripHireLink(tx, t, { equipmentId: 30, reason: "Identity confirmed" }, { id: 4, fullName: "Reviewer" }, true));
  await db.insert(schema.equipmentUsage).values({ id: 31, equipmentId: 31, date: t.date, entryType: "hourly", hoursOrKmRun: 4, status: "closed" });
  const payload: any = { billDate: t.date, billType: "equipment", vendorName: "TERMS OWNER", periodFrom: t.date,
    periodTo: t.date, status: "draft", items: [], hireGroups: [
      { equipmentId: 30, basis: "daily", rate: 5000, periodFrom: t.date, periodTo: t.date,
        dailyDecisions: [{ date: t.date, decision: "half_day", reason: "Reviewed partial day" }] },
      { equipmentId: 31, basis: "hourly", rate: 300, periodFrom: t.date, periodTo: t.date },
    ] };
  const bill = await storage.createVendorBill(payload);
  expect(bill.items.map((i: any) => [i.qty, i.rate, i.amount])).toEqual([[.5, 5000, 2500], [4, 300, 1200]]);
  const before = await storage.getVendorBill(bill.id);
  expect(before.hireStatements.map((s: any) => s.billingBasis).sort()).toEqual(["daily", "hourly"]);
  const edited = await storage.updateVendorBill(bill.id, { ...payload, hireGroups: payload.hireGroups.map((g: any) => ({
    ...g, rate: g.equipmentId === 30 ? 6000 : 300,
    hireStatementId: before.hireStatements.find((s: any) => s.equipmentId === g.equipmentId).id,
  })) });
  expect(edited.items.find((i: any) => i.equipmentId === 30).amount).toBe(3000);
  const overlap = { ...payload, hireGroups: [{ equipmentId: 30, basis: "trip", rate: 500, periodFrom: t.date, periodTo: t.date,
    tripDecisions: [{ source: "site_material_trip", sourceId: 30, selected: true, remarks: "Reviewed" }] }] };
  await expect(storage.createVendorBill(overlap)).rejects.toThrow(/overlapping/i);
  const nextTrip = { ...t, id: 31, date: "2026-12-02" };
  await db.insert(schema.siteMaterialTrips).values(nextTrip);
  await db.transaction((tx: any) => confirmTripHireLink(tx, nextTrip, { equipmentId: 30, reason: "Next assignment" }, { id: 4, fullName: "Reviewer" }, true));
  const next = await storage.createVendorBill({ ...overlap, periodFrom: nextTrip.date, periodTo: nextTrip.date,
    hireGroups: [{ ...overlap.hireGroups[0], periodFrom: nextTrip.date, periodTo: nextTrip.date,
      tripDecisions: [{ source: "site_material_trip", sourceId: 31, selected: true, remarks: "Agreed trip assignment" }] }] });
  expect(next.items[0]).toMatchObject({ qty: 1, rate: 500, amount: 500 });
  for (const status of ["verified", "approved", "paid"]) {
    await db.update(schema.vendorBills).set({ status }).where(eq(schema.vendorBills.id, bill.id));
    await expect(storage.updateVendorBill(bill.id, payload)).rejects.toThrow(/frozen/);
    expect((await storage.getVendorBill(bill.id)).items.find((i: any) => i.equipmentId === 30).amount).toBe(3000);
  }
  expect((await db.select().from(schema.equipmentMaster).where(eq(schema.equipmentMaster.id, 30)))[0]).toMatchObject(tripMaster);
});
