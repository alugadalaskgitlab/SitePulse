import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import express from "express";
import request from "supertest";
import * as schema from "../shared/schema";
import { registerVendorMasterRoutes, proposeVendorMatch } from "../server/vendor-master";
import { tripHireEligibility } from "../server/tripHireEligibility";
import { confirmTripHireLink, tripHireReview } from "../server/tripHireLink";
const holder = vi.hoisted(() => ({ db: null as any, admin: true }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));
vi.mock("../server/auth-routes", () => ({
  assertAdmin: (_req: any, res: any) => holder.admin || (res.status(403).json({ message: "Forbidden" }), false),
  assertView: () => true,
}));
let pg: PGlite, db: any, storage: any, app: any;
beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const c = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${c.name}" (${c.columns.map(col => `"${col.name}" ${col.getSQLType()}${col.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  db = holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
  app = express(); app.use(express.json()); app.use((req: any, _res: any, next: any) => {
    req.authUser = { id: 1, fullName: "Test reviewer", isAdmin: holder.admin }; next();
  });
  registerVendorMasterRoutes(app, async () => null);
  await db.insert(schema.vendors).values([{ id: 11, name: "GANGARAM NARSIMHULU", isActive: true }, { id: 12, name: "OTHER PARTY", isActive: true }]);
  for (const [id, name] of [[1, "NARASIMHULU"], [2, "G NARSIMHULU"]] as const) {
    const equipment = { id, name: "Tipper", vendorName: name, ownership: "hired", registrationNumber: `TS${id}`,
      hireBillingBasis: "daily", hireStartDate: "2026-01-01", hireRate: 2000 };
    const trip = { id, date: "2026-10-01", site: "TEST SITE", vehicleNumber: `TS${id}`, supplier: name,
      materialSourceType: "own_source", materialSourceLabel: "HLC borrow area", transportType: "agency_vendor",
      material: "Soil", quantity: 100, uom: "CFT", isCancelled: false, isDeleted: false };
    await db.insert(schema.equipmentMaster).values(equipment);
    await db.insert(schema.siteMaterialTrips).values(trip);
    await db.transaction((tx: any) => confirmTripHireLink(tx, trip, { equipmentId: id, reason: "Verified tipper" }, { id: 1, fullName: "Reviewer" }, true));
  }
}, 60000);
afterAll(() => pg.close());
it("shows missing identity instead of billing a guessed owner", async () => {
  const reasons = await tripHireEligibility(db, "GANGARAM NARSIMHULU", "2026-10-01", "2026-10-01");
  expect(reasons).toHaveLength(2);
  expect(reasons[0].reasons).toContain("Missing Vendor Master link");
  expect((await storage.getVendorBillHireActivities("NARASIMHULU", "2026-10-01", "2026-10-01")).filter((r: any) => r.confirmedForDailyHire)).toHaveLength(0);
});
it("requires authorised review and links several spellings to one ID without changing originals", async () => {
  const before = await db.select().from(schema.siteMaterialTrips);
  const proposals = (await request(app).get("/api/vendor-master/review")).body.filter((p: any) => p.role === "equipment");
  expect(proposals).toHaveLength(2);
  holder.admin = false;
  await request(app).post("/api/vendor-master/review/confirm").send({ ...proposals[0], vendorId: 11, reason: "Owner verified" }).expect(403);
  holder.admin = true;
  for (const p of proposals) await request(app).post("/api/vendor-master/review/confirm").send({ ...p, vendorId: 11, reason: "Owner verified" }).expect(200);
  await request(app).post("/api/vendor-master/review/confirm").send({ ...proposals[0], vendorId: 12, reason: "Stale owner change" }).expect(409);
  expect(await db.select().from(schema.siteMaterialTrips)).toEqual(before);
  expect((await db.select().from(schema.equipmentMaster))[0].vendorName).toBe("NARASIMHULU");
  const activities = await storage.getVendorBillHireActivities("GANGARAM NARSIMHULU", "2026-10-01", "2026-10-01");
  expect(activities.filter((r: any) => r.confirmedForDailyHire)).toHaveLength(2);
  expect((await storage.discoverVendors("equipment", "2026-10-01", "2026-10-01")).some((v: any) => v.vendorName === "GANGARAM NARSIMHULU")).toBe(true);
  expect((await tripHireEligibility(db, "OTHER PARTY", "2026-10-01", "2026-10-01"))[0].reasons.join()).toContain("Wrong vendor");
});
it("supports the same party for source and transporter, without replacing existing bill references", async () => {
  await db.insert(schema.siteMaterialTrips).values({ id: 3, date: "2026-10-01", supplier: "NARASIMHULU",
    materialSourceSupplier: "NARASIMHULU", material: "Stone", quantity: 10, vehicleNumber: "ORIGINAL", receiptNumber: "KEEP",
    materialSourceType: "vendor", transportType: "agency_vendor", uom: "CFT", isCancelled: false, isDeleted: false });
  for (const role of ["transport", "materialSource"]) {
    const p = (await request(app).get("/api/vendor-master/review")).body.find((p: any) => p.role === role && p.name === "NARASIMHULU");
    await request(app).post("/api/vendor-master/review/confirm").send({ ...p, vendorId: 11 }).expect(200);
  }
  const [trip] = await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, 3));
  expect(trip).toMatchObject({ supplierVendorId: 11, materialSourceVendorId: 11, supplier: "NARASIMHULU", receiptNumber: "KEEP", quantity: 10 });
  await db.insert(schema.vendorBills).values({ id: 88, vendorName: "NARASIMHULU", vendorId: 12, status: "paid", totalAmount: 3210 });
  const before = await db.select().from(schema.vendorBills);
  await request(app).post("/api/vendor-master/review/confirm").send({ role: "bills", name: "NARASIMHULU", ids: [88], vendorId: 11 }).expect(409);
  expect(await db.select().from(schema.vendorBills)).toEqual(before);
  const items = await storage.getVendorBillAutoItems("GANGARAM NARSIMHULU", "material", "2026-10-01", "2026-10-01");
  expect(items.some((item: any) => item.sourceId === "site_material_trip:3")).toBe(true);
  const oldNameItems = await storage.getVendorBillAutoItems("NARASIMHULU", "material", "2026-10-01", "2026-10-01");
  expect(oldNameItems.some((item: any) => item.sourceId === "site_material_trip:3")).toBe(false);
});
it("never guesses the supplied example identities or duplicate names", () => {
  for (const [name, canonical] of [["NARASIMHULU", "GANGARAM NARSIMHULU"], ["SANGANNA", "G SANGANNA"], ["FASIUDDIN", "MD FASIUDDIN"], ["MAHIPAL", "MAHIPAL KALPAGURI"]])
    expect(proposeVendorMatch(name, [{ id: 11, name: canonical }], []).suggestionId).toBeNull();
  expect(proposeVendorMatch("SAME", [{ id: 1, name: "SAME" }, { id: 2, name: "SAME" }], []).suggestionId).toBeNull();
});
it("saves under the reviewed party, freezes identity evidence and reports prior billing", async () => {
  const [original] = await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, 1));
  await db.insert(schema.siteMaterialTrips).values({ ...original, id: 4 });
  await db.transaction((tx: any) => confirmTripHireLink(tx, { ...original, id: 4 }, { equipmentId: 1, reason: "Second trip same verified vehicle" }, { id: 1, fullName: "Reviewer" }, true));
  await db.insert(schema.dprs).values({ id: 1, date: "2026-10-01", site: "TEST SITE", dprStatus: "submitted", isSuperseded: false });
  await db.insert(schema.equipmentLogs).values({ id: 1, dprId: 1, equipmentId: 1, entryType: "daily", machine: "Tipper" });
  const bill = await storage.createVendorBill({ billDate: "2026-10-01", billType: "equipment", vendorName: "GANGARAM NARSIMHULU",
    billingVendorId: 11, periodFrom: "2026-10-01", periodTo: "2026-10-01", items: [], hireGroups: [{
      equipmentId: 1, basis: "daily", rate: 2000, periodFrom: "2026-10-01", periodTo: "2026-10-01",
      dailyDecisions: [{ date: "2026-10-01", decision: "half_day", reason: "Verified attendance" }] }] });
  expect(bill.vendorId).toBe(11);
  expect(bill.items[0].amount).toBe(1000);
  expect((await tripHireEligibility(db, "GANGARAM NARSIMHULU", "2026-10-01", "2026-10-01")).find((r: any) => r.tripId === 1).reasons.join()).toContain("Already billed");
  const [snapshot] = await db.select().from(schema.hireStatements);
  expect(snapshot.calculationSnapshot.sourceEvidence.activities.find((a: any) => a.confirmedForDailyHire).equipmentVendorIdentity.vendorId).toBe(11);
});
it("reports incomplete terms, outside-period evidence and invalidated confirmations explicitly", async () => {
  await db.update(schema.equipmentMaster).set({ hireRate: null, hireStartDate: "2026-11-01" }).where(eq(schema.equipmentMaster.id, 2));
  let result = (await tripHireEligibility(db, "GANGARAM NARSIMHULU", "2026-10-01", "2026-10-01")).find((r: any) => r.tripId === 2);
  expect(result.reasons).toContain("Missing daily-hire terms");
  expect(result.reasons).toContain("Outside hire period");
  await db.update(schema.siteMaterialTrips).set({ vehicleNumber: "CHANGED" }).where(eq(schema.siteMaterialTrips.id, 2));
  result = (await tripHireEligibility(db, "GANGARAM NARSIMHULU", "2026-10-01", "2026-10-01")).find((r: any) => r.tripId === 2);
  expect(result.reasons.join()).toContain("Invalid confirmation");
});
it("accepts future canonical transporter selection despite the equipment's historical spelling", async () => {
  await pg.exec("SELECT setval(pg_get_serial_sequence('site_material_trips', 'id'), 20)");
  const trip = await storage.createSiteMaterialTrip({ date: "2026-10-02", site: "TEST SITE",
    vehicleNumber: "TS1", supplier: "GANGARAM NARSIMHULU", supplierVendorId: 11, transportType: "agency_vendor",
    materialSourceType: "own_source", materialSourceLabel: "Our borrow area", material: "Soil", quantity: 60,
    uom: "CFT", isCancelled: false, isDeleted: false },
    { equipmentId: 1, reason: "Existing hired vehicle selected", actor: { id: 1, fullName: "Reviewer" } });
  expect((await tripHireReview(db, trip)).confirmation.valid).toBe(true);
  expect(trip.materialSourceType).toBe("own_source");
});
