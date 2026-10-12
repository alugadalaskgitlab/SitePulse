import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { tripHireReview } from "../server/tripHireLink";
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
let pg: PGlite, db: any, storage: any;
const actor = { id: 4, fullName: "Site staff" };
const editActor = { userId: 4, userName: "Site staff", userRole: "manager" };
const selection = { equipmentId: 1, actor };
const base = { date: "2026-10-01", site: "ROAD", material: "Soil", quantity: 50, uom: "CFT",
  supplier: "AGENCY", supplierVendorId: 9, vehicleNumber: "TS01AB4470", transportType: "agency_vendor",
  materialSourceType: "own_source", materialSourceLabel: "Borrow area", materialSourceVendorId: null };
beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const cfg = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${cfg.name}" (${cfg.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  db = holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
  await db.insert(schema.vendors).values([{ id: 9, name: "AGENCY", businessName: "Agency Business", isActive: true },
    { id: 10, name: "OTHER", isActive: true }, { id: 11, name: "INACTIVE", isActive: false }]);
  await db.insert(schema.equipmentMaster).values([{ id: 1, name: "Tipper", ownership: "hired",
    registrationNumber: "TS01AB4470", vendorName: "AGENCY", hireBillingBasis: "monthly", hireRate: 5000 },
    { id: 2, name: "HLC", ownership: "owned", registrationNumber: "OWN2", vendorName: "AGENCY", hireBillingBasis: "monthly", hireRate: 5000 }]);
  await db.insert(schema.auditLogs).values({ module: "equipment_master", transactionId: 1,
    action: "confirm_vendor_identity", userId: 4, userName: actor.fullName,
    newValues: { vendorId: 9, recordedName: "AGENCY" } });
}, 60000);
afterAll(async () => pg.close());
it("persists master IDs and automatic hire evidence atomically without duplicate operational rows", async () => {
  const trip = await storage.createSiteMaterialTrip(base, undefined, selection);
  expect(trip.supplierVendorId).toBe(9);
  expect((await tripHireReview(db, trip)).confirmation.valid).toBe(true);
  expect(await db.select().from(schema.equipmentLogs)).toHaveLength(0);
  expect(await db.select().from(schema.equipmentUsage)).toHaveLength(0);
  expect(await db.select().from(schema.stockLedger)).toHaveLength(0);
});
it("corrects legacy links in one save and does not reconfirm unchanged links", async () => {
  const old = await storage.createSiteMaterialTrip({ ...base, supplierVendorId: undefined, date: "2026-10-02" });
  const updated = await storage.updateSiteMaterialTrip(old.id, { supplierVendorId: 9 }, editActor, selection);
  const review = await tripHireReview(db, updated);
  expect(review.confirmation.valid).toBe(true);
  const reopened = await storage.updateSiteMaterialTrip(old.id, { notes: "Reviewed" }, editActor, selection);
  expect((await tripHireReview(db, reopened)).version).toBe(review.version);
});
it("rejects inactive vendors, forged names, and mismatched equipment owner without partial insert", async () => {
  const before = (await db.select().from(schema.siteMaterialTrips)).length;
  await expect(storage.createSiteMaterialTrip({ ...base, supplierVendorId: 11, supplier: "INACTIVE" }, undefined, selection)).rejects.toThrow(/active Vendor/);
  await expect(storage.createSiteMaterialTrip({ ...base, supplier: "FORGED" }, undefined, selection)).rejects.toThrow(/does not match/);
  await expect(storage.createSiteMaterialTrip({ ...base, supplierVendorId: 10, supplier: "OTHER" }, undefined, selection)).rejects.toThrow(/owner differ/);
  expect(await db.select().from(schema.siteMaterialTrips)).toHaveLength(before);
});
it("owned vehicles and explicit outside vehicles never acquire hired evidence", async () => {
  const owned = await storage.createSiteMaterialTrip({ ...base, vehicleNumber: "OWN2", supplier: null,
    supplierVendorId: null, transportType: "in_house", internalEquipmentId: 2 }, undefined, { equipmentId: 2, actor });
  expect((await tripHireReview(db, owned)).confirmation).toBeNull();
  const outside = await storage.createSiteMaterialTrip({ ...base, vehicleNumber: "OUTSIDE", supplier: "ONE TIME", supplierVendorId: null }, undefined, { equipmentId: null, actor });
  expect((await tripHireReview(db, outside)).confirmation).toBeNull();
});
it("protects billed identities and rolls back all changes", async () => {
  const trip = await storage.createSiteMaterialTrip({ ...base, date: "2026-10-03" }, undefined, selection);
  await db.insert(schema.vendorBills).values({ id: 100, billNo: "TEST", vendorName: "AGENCY", status: "paid", billDate: trip.date, billType: "EQUIPMENT" });
  await db.insert(schema.vendorBillItems).values({ billId: 100, equipmentId: 1, date: trip.date, description: "Trip", quantity: 1, rate: 100 });
  await expect(storage.updateSiteMaterialTrip(trip.id, { vehicleNumber: "OUTSIDE", supplierVendorId: null }, editActor, { equipmentId: null, actor: { ...actor, isAdmin: true } })).rejects.toThrow(/billing evidence/);
  const [preserved] = await db.select().from(schema.siteMaterialTrips).where(eq(schema.siteMaterialTrips.id, trip.id));
  expect(preserved.vehicleNumber).toBe(base.vehicleNumber);
  expect(preserved.supplierVendorId).toBe(9);
});
it("exposes actual hired ownership to the bill composer and excludes owned masters", async () => {
  const activities = await storage.getVendorBillHireActivities("AGENCY", "2026-10-01", "2026-10-31");
  const defaults = activities.filter((r: any) => r.source === "equipment_default");
  expect(defaults.some((r: any) => r.equipment.id === 1 && r.equipment.ownership === "hired" && r.equipment.linkedVendorName === "Agency Business")).toBe(true);
  expect(defaults.some((r: any) => r.equipment.id === 2)).toBe(false);
});
it("does not let an ordinary editor clear a confirmed vendor to bypass conflict review", async () => {
  const trip = await storage.createSiteMaterialTrip({ ...base, date: "2026-10-04" }, undefined, selection);
  await expect(storage.updateSiteMaterialTrip(trip.id, { supplierVendorId: null }, editActor, { equipmentId: null, actor }))
    .rejects.toMatchObject({ status: 403 });
});
