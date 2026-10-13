import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import * as schema from "../shared/schema";
import { calculateHireGroup } from "../shared/hireBilling";
import { hasFrozenTripDailyHire } from "../shared/vendorBillRecovery";
import { statementChargesDate } from "../server/dailyHireBilledDays";
import { buildSavedEquipmentHireBillOutput } from "../client/src/components/vendor-bills/EquipmentHireBillOutput";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));
let pg: PGlite, db: any, storage: any;
beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c =>
      `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  await pg.exec("CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON hire_statements(equipment_id,period_from,period_to)");
  db = holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
  await db.insert(schema.equipmentMaster).values({
    id: 1, name: "RECOVERY TIPPER", registrationNumber: "TEST01", vendorName: "RECOVERY OWNER",
    ownership: "hired", hireBillingBasis: "daily", hireRate: 2000, hireStartDate: "2026-01-01",
    hireDieselResponsibility: "vendor",
  });
  await db.insert(schema.dprs).values({ id: 1, date: "2026-10-01", site: "TEST ROAD",
    isSuperseded: false, dprStatus: "submitted" });
  await db.insert(schema.equipmentLogs).values({ id: 1, dprId: 1, equipmentId: 1, entryType: "daily", hoursWorked: 4 });
  await db.insert(schema.siteMaterialTrips).values({
    id: 1, date: "2026-10-02", site: "TEST ROAD", vehicleNumber: "TEST01", supplier: "RECOVERY OWNER",
    transportType: "agency_vendor", materialSourceType: "own_source", material: "Soil", quantity: 50,
    uom: "CFT", isCancelled: false, isDeleted: false,
  });
}, 60000);
afterAll(async () => { await pg?.close(); });

const dailyPayload = () => ({
  billDate: "2026-10-02", billType: "equipment", vendorName: "RECOVERY OWNER",
  periodFrom: "2026-10-01", periodTo: "2026-10-02", status: "draft", items: [],
  hireGroups: [{ equipmentId: 1, basis: "daily", rate: 2000, periodFrom: "2026-10-01", periodTo: "2026-10-02",
    dailyDecisions: [], tripDecisions: [], exceptionDecisions: [] }],
});

describe("selective pre-tipper billing recovery", () => {
  it("does not turn a confirmed historical material trip into new daily attendance", () => {
    const trip: any = { source: "site_material_trip", sourceId: 1, equipmentId: 1,
      businessDate: "2026-10-01", entryType: "trip_based", numberOfTrips: 1, confirmedForDailyHire: true, status: "closed" };
    const input: any = { terms: { billingBasis: "daily", rate: 2000 },
      periodFrom: "2026-10-01", periodTo: "2026-10-02", activities: [trip], maintenance: [] };
    expect(calculateHireGroup(input).quantity).toBe(0);
    expect(calculateHireGroup({ ...input, activities: [trip, { ...trip, source: "dpr_log", entryType: "daily" }] }).quantity).toBe(1);
    expect(calculateHireGroup({ ...input, terms: { billingBasis: "trip", rate: 300 },
      tripDecisions: [{ source: "site_material_trip", sourceId: 1, selected: true }] }).grossAmount).toBe(300);
  });

  it("gets DPR evidence without daily-trip confirmation discovery and saves/reopens/edits it", async () => {
    const activities = await storage.getVendorBillHireActivities("RECOVERY OWNER", "2026-10-01", "2026-10-02");
    expect(activities.some((row: any) => row.source === "dpr_log")).toBe(true);
    expect(activities.some((row: any) => row.confirmedForDailyHire || row.hireConfirmation)).toBe(false);
    const bill = await storage.createVendorBill(dailyPayload());
    const reopened = await storage.getVendorBill(bill.id);
    expect(reopened.items[0]).toMatchObject({ qty: 1, rate: 2000, amount: 2000 });
    const statement = reopened.hireStatements[0];
    const payload = dailyPayload();
    payload.hireGroups[0] = { ...payload.hireGroups[0], hireStatementId: statement.id,
      dailyDecisions: [{ date: "2026-10-01", decision: "half_day", reason: "Half day worked" }] } as any;
    const updated = await storage.updateVendorBill(bill.id, payload);
    expect(updated.items[0]).toMatchObject({ qty: .5, amount: 1000 });
    await expect(storage.createVendorBill(dailyPayload())).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining(`${bill.billNo} (draft), overlapping 1-Oct-2026 to 2-Oct-2026`),
    });
  });

  it("blocks ordinary equipment rows from rebilling frozen hire days", async () => {
    const payload = dailyPayload();
    await expect(storage.createVendorBill({ ...payload, hireGroups: undefined,
      items: [{ equipmentId: 1, date: "2026-10-01", category: "equipment", source: "auto:dpr_log:1",
        description: "Duplicate DPR charge", qty: 1, unit: "DAYS", rate: 2000, amount: 2000 }] }))
      .rejects.toThrow(/already covers/);
  });

  it("restores monthly Master active-date proration instead of bill-period-only pricing", async () => {
    await db.insert(schema.equipmentMaster).values({
      id: 2, name: "MONTHLY TEST", vendorName: "MONTHLY OWNER", ownership: "hired",
      hireBillingBasis: "monthly", hireRate: 90000, hireStartDate: "2026-05-15",
      hireMonthlyDivisorType: "30", hireDieselResponsibility: "vendor",
    });
    const bill = await storage.createVendorBill({
      billDate: "2026-05-31", billType: "equipment", vendorName: "MONTHLY OWNER",
      periodFrom: "2026-05-01", periodTo: "2026-05-31", status: "draft", items: [],
      hireGroups: [{ equipmentId: 2, basis: "monthly", rate: 1, periodFrom: "2026-05-01", periodTo: "2026-05-31" }],
    });
    const reopened = await storage.getVendorBill(bill.id);
    expect(reopened.items[0]).toMatchObject({ rate: 90000, amount: 51000 });
    expect(reopened.hireStatements[0].calculationSnapshot.terms.hireStartDate).toBe("2026-05-15");
  });

  it("keeps new groups on their Master basis", async () => {
    await expect(storage.createVendorBill({ ...dailyPayload(), periodFrom: "2027-01-01", periodTo: "2027-01-01",
      hireGroups: [{ equipmentId: 1, basis: "trip", rate: 300, periodFrom: "2027-01-01", periodTo: "2027-01-01" }] }))
      .rejects.toThrow(/Equipment Master hire terms/);
  });

  it("preserves newer frozen daily-trip bills, payments and snapshots on read and refuses silent repricing", async () => {
    const snapshot = { terms: { billingBasis: "daily", rate: 2500, dieselResponsibility: "vendor" },
      grossAmount: 2500, quantity: 1, netAmount: 2500, deductionAmount: 0,
      payableDays: [{ date: "2026-09-01", fraction: 1 }],
      sourceEvidence: { activities: [{ source: "site_material_trip", sourceId: 77, confirmedForDailyHire: true,
        businessDate: "2026-09-01", hireConfirmation: { reason: "Original frozen review" } }] },
      financials: { grossHire: 2500, taxableAmount: 2500, netPayable: 2500 } };
    await db.insert(schema.vendorBills).values({ id: 500, billNo: "HISTORICAL", billType: "EQUIPMENT",
      vendorName: "RECOVERY OWNER", billDate: "2026-09-01", status: "draft", totalAmount: 2500, amountPaid: 500,
      netPayableAmount: 2500, periodFrom: "2026-09-01", periodTo: "2026-09-01" });
    await db.insert(schema.hireStatements).values({ id: 500, equipmentId: 1, vendorBillId: 500, vendorName: "RECOVERY OWNER",
      billingBasis: "daily", rate: 2500, quantity: 1, grossAmount: 2500, netAmount: 2500, deductionAmount: 0,
      status: "draft", periodFrom: "2026-09-01", periodTo: "2026-09-01", calculationSnapshot: snapshot });
    await db.insert(schema.vendorBillItems).values({ billId: 500, hireStatementId: 500,
      category: "equipment", equipmentId: 1, amount: 2500, qty: 1, rate: 2500, source: "hire_statement" });
    const read = await storage.getVendorBill(500);
    expect(hasFrozenTripDailyHire(read)).toBe(true);
    expect(read).toMatchObject({ amountPaid: "500.00", totalAmount: 2500, status: "draft" });
    expect(read.hireStatements[0].calculationSnapshot).toEqual(snapshot);
    const output = buildSavedEquipmentHireBillOutput(read);
    expect(output?.data).toMatchObject({ rate: 2500, grossHire: 2500, paid: 500 });
    expect(statementChargesDate(read.hireStatements[0], "2026-09-01")).toBe(true);
    await expect(storage.updateVendorBill(500, dailyPayload())).rejects.toThrow(/historical material-trip daily hire/);
    expect((await db.select().from(schema.hireStatements).where(eq(schema.hireStatements.id, 500)))[0].calculationSnapshot).toEqual(snapshot);
  });

  it("keeps the unconditional production-compatible index and removes the new trip composer", () => {
    const index = getTableConfig(schema.hireStatements).indexes.find(i => i.config.name === "hire_statements_equipment_period_uq");
    expect(index?.config.where).toBeUndefined();
    const page = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(page).not.toContain("trip-hire-eligibility");
    expect(page).not.toContain("trip-daily-hire-composer");
    expect(page).not.toContain("equipment-hire-terms-composer");
    expect(page).toContain("monthly-hire-auto-summary");
    expect(page).toContain('sectionCan("vendor_financials", "view")');
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain("vendorFinancialGuard(storage)");
    expect(routes).toContain('"/api/site-material-trips/:id/hire-link"');
  });
});
