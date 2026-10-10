import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { tripHireMatch, tripHireFingerprint, validTripHireLink } from "../shared/tripHireLink";
import { calculateHireGroup } from "../shared/hireBilling";
import { confirmTripHireLink, tripHireReview, guardTripHireOrdinaryItems } from "../server/tripHireLink";
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
  await expect(storage.createVendorBill(data)).rejects.toThrow(/overlapping/);
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
