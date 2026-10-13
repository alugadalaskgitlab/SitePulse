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
it("charges operational days once and never turns material trips into daily hire", () => {
  const activities = [activity(1, trip.date), activity(2, trip.date), activity(3, "2026-10-02"),
    { source: "dpr_log", sourceId: 4, equipmentId: 1, businessDate: trip.date, entryType: "daily_hire", status: "closed" },
    { source: "plant_usage", sourceId: 5, equipmentId: 1, businessDate: "2026-10-02", entryType: "daily_hire", status: "closed" }];
  expect(calculate(activities).quantity).toBe(2);
  expect(calculate(activities).grossAmount).toBe(4000);
  const result = calculate(activities, [{ date: trip.date, decision: "half_day", reason: "Reviewed partial attendance" },
    { date: "2026-10-02", decision: "exclude", reason: "Already billed" }]);
  expect(result.quantity).toBe(.5);
  expect(result.grossAmount).toBe(1000);
  expect(calculate([activity(1, trip.date), activity(2, trip.date)]).quantity).toBe(0);
});
it("persists append-only confirmation and retains deliveries as non-daily evidence", async () => {
  await db.insert(schema.equipmentMaster).values([master, { ...master, id: 2, registrationNumber: "TS02CD5555" }]);
  await db.insert(schema.siteMaterialTrips).values([trip, { ...trip, id: 2, vehicleNumber: "TS02CD5555" }]);
  const review = await tripHireReview(db, trip);
  await db.transaction((tx: any) => confirmTripHireLink(tx, trip, { equipmentId: 1, reason: "Owner verified", version: review.version, fingerprint: review.fingerprint }, { id: 4, fullName: "Reviewer" }));
  await db.transaction((tx: any) => confirmTripHireLink(tx, { ...trip, id: 2, vehicleNumber: "TS02CD5555" }, { equipmentId: 2, reason: "Future selection" }, { id: 4, fullName: "Reviewer" }, true));
  expect((await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, 1)))[0]).toMatchObject(trip);
  const rows = await storage.getVendorBillHireActivities("Agency", trip.date, "2026-10-03");
  expect(rows.filter((r: any) => r.source === "site_material_trip")).toHaveLength(2);
  expect(rows.filter((r: any) => r.source === "site_material_trip").every((r: any) => r.requiresTripReview)).toBe(true);
  expect(await db.select().from(schema.equipmentLogs)).toHaveLength(0);
  const current = await tripHireReview(db, trip);
  expect(current.confirmation.valid).toBe(true);
  expect(validTripHireLink({ ...trip, supplier: "Different" }, master, current.confirmation)).toBe(false);
  await expect(db.transaction((tx: any) => confirmTripHireLink(tx, trip, { equipmentId: 1, reason: "Stale request", version: null, fingerprint: tripHireFingerprint(trip) }, { id: 4, fullName: "Reviewer" }))).rejects.toThrow(/changed/);
});
it("saves a real daily bill from a DPR log without charging confirmed material trips", async () => {
  await db.insert(schema.dprs).values({ id: 1, date: trip.date, site: trip.site, dprStatus: "submitted", isSuperseded: false });
  await db.insert(schema.equipmentLogs).values({ id: 1, dprId: 1, equipmentId: 1, entryType: "daily", status: "closed" });
  const data = { billDate: trip.date, billType: "equipment", vendorName: "Agency", periodFrom: trip.date,
    periodTo: trip.date, status: "draft", items: [{ equipmentId: 1, date: trip.date, source: "hire_group", category: "equipment",
      description: "Generated preview", qty: .5, rate: 2000, amount: 1000 }], hireBillingMode: "vb10_automatic",
    hireGroups: [{ equipmentId: 1, basis: "daily", rate: 2000, periodFrom: trip.date, periodTo: trip.date,
      dailyDecisions: [{ date: trip.date, decision: "half_day", reason: "Reviewed half day" }], tripDecisions: [], exceptionDecisions: [] }] };
  const bill = await storage.createVendorBill(data);
  expect(bill.items).toHaveLength(1);
  expect(bill.items[0]).toMatchObject({ category: "equipment", qty: .5, rate: 2000, amount: 1000 });
  const [statement] = await db.select().from(schema.hireStatements);
  expect(statement.calculationSnapshot.sourceEvidence.activities.some((a: any) => a.source === "dpr_log")).toBe(true);
  expect(statement.calculationSnapshot.sourceEvidence.activities.filter((a: any) => a.source === "site_material_trip")).toHaveLength(1);
  expect(statement.calculationSnapshot.sourceEvidence.activities.filter((a: any) => a.source === "site_material_trip" && a.confirmedForDailyHire)).toHaveLength(0);
  await expect(storage.createVendorBill(data)).rejects.toThrow(/already billed|overlap/i);
});
it("saves future hired-vehicle confirmation atomically alongside a real trip", async () => {
  await pg.exec("SELECT setval(pg_get_serial_sequence('site_material_trips', 'id'), 10)");
  const created = await storage.createSiteMaterialTrip({ ...trip, id: undefined, date: "2026-10-03",
    materialSourceLabel: "Borrow area", vehicleNumber: "TS02CD5555" },
  { equipmentId: 2, reason: "Vehicle selected on entry", actor: { id: 4, fullName: "Reviewer" } });
  expect((await tripHireReview(db, created)).confirmation.valid).toBe(true);
  expect(created.materialSourceType).toBe("own_source");
  expect(created.quantity).toBe(50);
  expect(await db.select().from(schema.equipmentLogs)).toHaveLength(1);
  expect(await db.select().from(schema.equipmentUsage)).toHaveLength(0);
  expect(await db.select().from(schema.stockLedger)).toHaveLength(0);
});
it("blocks confirmed-link changes on paid activity and ordinary rows covered by a daily hire statement", async () => {
  await db.insert(schema.dprs).values({ id: 2, date: trip.date, site: trip.site, dprStatus: "submitted", isSuperseded: false });
  await db.insert(schema.equipmentLogs).values({ id: 2, dprId: 2, equipmentId: 2, entryType: "daily", status: "closed" });
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

it("real routes preserve trip evidence but reject a second bill in an overlapping Master hire period", async () => {
  await pg.exec(`CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON hire_statements(equipment_id,period_from,period_to) WHERE NOT (billing_basis = 'daily' AND vendor_bill_id IS NOT NULL)`);
  const machine = { ...master, id: 20, registrationNumber: "TEST20", vendorName: "ONE TIME TEST OWNER" };
  await db.insert(schema.equipmentMaster).values(machine);
  const originals = [21, 22, 23].map((id, i) => ({ ...trip, id, vehicleNumber: "TEST20", supplier: machine.vendorName,
    date: i < 2 ? "2026-11-01" : "2026-11-02" }));
  await db.insert(schema.siteMaterialTrips).values(originals);
  for (const t of originals) await db.transaction((tx: any) => confirmTripHireLink(tx, t, { equipmentId: 20, reason: "Historical attendance checked" }, { id: 4, fullName: "Reviewer" }, true));
  await db.insert(schema.dprs).values({ id: 20, date: "2026-11-01", site: "ROAD", isSuperseded: false, dprStatus: "submitted" });
  await db.insert(schema.dprs).values({ id: 21, date: "2026-11-02", site: "ROAD", isSuperseded: false, dprStatus: "submitted" });
  await db.insert(schema.equipmentLogs).values([
    { id: 20, dprId: 20, equipmentId: 20, entryType: "daily", status: "closed", hoursWorked: 3 },
    { id: 21, dprId: 21, equipmentId: 20, entryType: "daily", status: "closed", hoursWorked: 3 },
  ]);
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
  expect(evidence.filter((a: any) => a.source === "dpr_log")).toHaveLength(2);
  expect(evidence.filter((a: any) => a.source === "site_material_trip")).toHaveLength(3);
  expect(evidence.filter((a: any) => a.source === "site_material_trip" && a.confirmedForDailyHire)).toHaveLength(0);
  expect((await request(app).post("/api/vendor-bills").send(payload("full_day", "full_day"))).status).toBe(409);
  const remaining = await request(app).post("/api/vendor-bills").send(payload("exclude", "full_day"));
  expect(remaining.status, JSON.stringify(remaining.body)).toBe(409);
  expect(remaining.body.message).toMatch(/overlap/i);
  expect((await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, 21)))[0]).toMatchObject(originals[0]);
});

it.each(["trip", "daily"])("keeps confirmed trip evidence without charging it as daily hire under Master %s terms", async (defaultBasis) => {
  const id = defaultBasis === "trip" ? 80 : 81;
  const date = "2026-12-20";
  const machine = { ...master, id, registrationNumber: `BASIS${id}`, vendorName: `BASIS OWNER ${id}`,
    hireBillingBasis: defaultBasis, hireRate: 17 };
  await db.insert(schema.equipmentMaster).values(machine);
  const originals = [id * 10, id * 10 + 1].map(tripId => ({
    ...trip, id: tripId, date, vehicleNumber: machine.registrationNumber, supplier: machine.vendorName,
  }));
  await db.insert(schema.siteMaterialTrips).values(originals);
  for (const row of originals) await db.transaction((tx: any) => confirmTripHireLink(tx, row,
    { equipmentId: id, reason: "Historical vehicle identity verified" }, { id: 4, fullName: "Reviewer" }, true));
  if (defaultBasis === "daily") {
    await db.insert(schema.dprs).values({ id, date, site: "ROAD", dprStatus: "submitted", isSuperseded: false });
    await db.insert(schema.equipmentLogs).values({ id, dprId: id, equipmentId: id, entryType: "daily", status: "closed" });
  }
  const activities = await storage.getVendorBillHireActivities(machine.vendorName, date, date);
  const evidence = activities.filter((a: any) => a.equipmentId === id && a.source === "site_material_trip");
  expect(evidence.map((a: any) => a.sourceId).sort()).toEqual(originals.map(t => t.id));
  expect(evidence.every((a: any) => a.requiresTripReview)).toBe(true);
  const decisions = originals.map(row => ({ source: "site_material_trip", sourceId: row.id, selected: true, remarks: "Individual trip checked" }));
  const group = (basis: string) => ({ equipmentId: id, basis, rate: 1000, periodFrom: date, periodTo: date,
    tripDecisions: decisions, dailyDecisions: [{ date, decision: "full_day", reason: "Both trips reviewed together" }] });
  const payload: any = { billDate: date, billType: "equipment", vendorName: machine.vendorName,
    periodFrom: date, periodTo: date, status: "draft", items: [], hireGroups: [group(defaultBasis)] };
  const bill = await storage.createVendorBill(payload);
  expect(bill.items[0]).toMatchObject({ qty: defaultBasis === "daily" ? 1 : 2 });
  const reopened = await storage.getVendorBill(bill.id);
  expect(reopened.hireStatements[0].billingBasis).toBe(defaultBasis);
  const savedEvidence = reopened.hireStatements[0].calculationSnapshot.sourceEvidence.activities;
  expect(savedEvidence.filter((a: any) => a.source === "site_material_trip").map((a: any) => a.sourceId).sort())
    .toEqual(originals.map(t => t.id));
  expect(savedEvidence.filter((a: any) => a.source === "dpr_log")).toHaveLength(defaultBasis === "daily" ? 1 : 0);
  await expect(storage.createVendorBill({ ...payload, hireGroups: [group(defaultBasis === "trip" ? "daily" : "trip")] }))
    .rejects.toThrow(/Master hire terms/);
  for (const [decision, expected] of [["full_day", 1], ["half_day", .5], ["exclude", 0]] as const) {
    const result = calculateHireGroup({ equipmentId: id, terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: date, periodTo: date, activities,
      dailyDecisions: [{ date, decision, reason: "Reviewed vehicle day" }] });
    expect(result.quantity).toBe(defaultBasis === "daily" ? expected : 0);
  }
  expect(calculateHireGroup({ equipmentId: id, terms: { billingBasis: "hourly", rate: 1000 },
    periodFrom: date, periodTo: date, activities, tripDecisions: decisions }).quantity).toBe(0);
  for (const row of originals) {
    const [saved] = await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, row.id));
    expect(saved).toMatchObject(row);
    expect((await tripHireReview(db, saved)).confirmation.valid).toBe(true);
  }
  expect((await db.select().from(schema.equipmentMaster).where(eq(schema.equipmentMaster.id, id)))[0])
    .toMatchObject({ hireBillingBasis: defaultBasis, hireRate: 17 });
});

it("saves Master-based hire groups, permits draft edits and freezes completed bills", async () => {
  const tripMaster = { ...master, id: 30, registrationNumber: "TERMS30", vendorName: "TERMS OWNER",
    hireBillingBasis: "trip", hireRate: 500, hireStartDate: "2027-01-01" };
  const monthlyMaster = { ...tripMaster, id: 31, registrationNumber: "TERMS31", hireBillingBasis: "monthly", hireRate: 90000 };
  await db.insert(schema.equipmentMaster).values([tripMaster, monthlyMaster]);
  const t = { ...trip, id: 30, date: "2027-01-01", vehicleNumber: "TERMS30", supplier: "TERMS OWNER" };
  await db.insert(schema.siteMaterialTrips).values(t);
  await db.transaction((tx: any) => confirmTripHireLink(tx, t, { equipmentId: 30, reason: "Identity confirmed" }, { id: 4, fullName: "Reviewer" }, true));
  await db.insert(schema.equipmentUsage).values({ id: 31, equipmentId: 31, date: t.date, entryType: "hourly", hoursOrKmRun: 4, status: "closed" });
  const payload: any = { billDate: t.date, billType: "equipment", vendorName: "TERMS OWNER", periodFrom: t.date,
    periodTo: t.date, status: "draft", items: [], hireGroups: [
      { equipmentId: 30, basis: "trip", rate: 500, periodFrom: t.date, periodTo: t.date,
        tripDecisions: [{ source: "site_material_trip", sourceId: 30, selected: true, remarks: "Recorded trip reviewed" }] },
      { equipmentId: 31, basis: "monthly", rate: 90000, periodFrom: t.date, periodTo: t.date },
    ] };
  const bill = await storage.createVendorBill(payload);
  expect(bill.items.find((i: any) => i.equipmentId === 30)).toMatchObject({ qty: 1, rate: 500, amount: 500 });
  expect(bill.items.some((i: any) => i.equipmentId === 31)).toBe(true);
  const before = await storage.getVendorBill(bill.id);
  expect(before.hireStatements.map((s: any) => s.billingBasis).sort()).toEqual(["monthly", "trip"]);
  const edited = await storage.updateVendorBill(bill.id, { ...payload, hireGroups: payload.hireGroups.map((g: any) => ({
    ...g, rate: g.equipmentId === 30 ? 600 : 90000,
    hireStatementId: before.hireStatements.find((s: any) => s.equipmentId === g.equipmentId).id,
  })) });
  expect(edited.items.find((i: any) => i.equipmentId === 30).amount).toBe(600);
  const overlap = { ...payload, hireGroups: [{ equipmentId: 30, basis: "trip", rate: 500, periodFrom: t.date, periodTo: t.date,
    tripDecisions: [{ source: "site_material_trip", sourceId: 30, selected: true, remarks: "Reviewed" }] }] };
  await expect(storage.createVendorBill(overlap)).rejects.toThrow(/overlapping/i);
  const nextTrip = { ...t, id: 31, date: "2027-01-02" };
  await db.insert(schema.siteMaterialTrips).values(nextTrip);
  await db.transaction((tx: any) => confirmTripHireLink(tx, nextTrip, { equipmentId: 30, reason: "Next assignment" }, { id: 4, fullName: "Reviewer" }, true));
  const next = await storage.createVendorBill({ ...overlap, periodFrom: nextTrip.date, periodTo: nextTrip.date,
    hireGroups: [{ ...overlap.hireGroups[0], periodFrom: nextTrip.date, periodTo: nextTrip.date,
      tripDecisions: [{ source: "site_material_trip", sourceId: 31, selected: true, remarks: "Agreed trip assignment" }] }] });
  expect(next.items[0]).toMatchObject({ qty: 1, rate: 500, amount: 500 });
  for (const status of ["verified", "approved", "paid"]) {
    await db.update(schema.vendorBills).set({ status }).where(eq(schema.vendorBills.id, bill.id));
    await expect(storage.updateVendorBill(bill.id, payload)).rejects.toThrow(/frozen/);
    expect((await storage.getVendorBill(bill.id)).items.find((i: any) => i.equipmentId === 30).amount).toBe(600);
  }
  expect((await db.select().from(schema.equipmentMaster).where(eq(schema.equipmentMaster.id, 30)))[0]).toMatchObject(tripMaster);
});
