import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateHireGroup,
  monthlyGross,
  monthlyHireSegments,
} from "../shared/hireBilling";
import { DatabaseStorage } from "../server/storage";
import {
  equipmentMaster,
  hireStatements,
  vendorBillItems,
} from "../shared/schema";

const at = (date: string) => Date.parse(`${date}T00:00:00.000Z`);
const dates = (segments: Array<{ from: number; to: number }>) =>
  segments.map(segment => ({
    from: new Date(segment.from).toISOString().slice(0, 10),
    to: new Date(segment.to).toISOString().slice(0, 10),
  }));

describe("VB-20 monthly hire calendar segments", () => {
  const terms = {
    billingBasis: "monthly" as const,
    rate: 60_000,
    monthlyDivisorType: "30" as const,
    breakdownDeductionEnabled: true,
    automaticMonthlyBreakdownDeductions: true,
    dieselResponsibility: "hlc",
    consumptionNorm: 2,
  };

  it("A: exposes the exact two month boundaries without changing aggregate math", () => {
    const segments = monthlyHireSegments(at("2026-08-01"), at("2026-09-20"));
    expect(dates(segments)).toEqual([
      { from: "2026-08-01", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-20" },
    ]);
    const amounts = segments.map(segment => monthlyGross(segment.from, segment.to, terms));
    expect(amounts).toEqual([60_000, 40_000]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(100_000);
    expect(monthlyGross(at("2026-08-01"), at("2026-09-20"), terms)).toBe(100_000);
  });

  it("C/E/F: keeps a later month independently billable and handles three or one month", () => {
    expect(monthlyGross(at("2026-09-01"), at("2026-09-20"), terms)).toBe(40_000);
    expect(dates(monthlyHireSegments(at("2026-07-20"), at("2026-09-05")))).toEqual([
      { from: "2026-07-20", to: "2026-07-31" },
      { from: "2026-08-01", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-05" },
    ]);
    expect(dates(monthlyHireSegments(at("2026-08-03"), at("2026-08-20")))).toEqual([
      { from: "2026-08-03", to: "2026-08-20" },
    ]);
  });

  it("G: calculates evidence and breakdowns from each group's own dates", () => {
    const activities = [
      { source: "plant_usage" as const, sourceId: 1, equipmentId: 7, businessDate: "2026-08-10", hoursOrKmRun: 10 },
      { source: "plant_usage" as const, sourceId: 2, equipmentId: 7, businessDate: "2026-09-10", hoursOrKmRun: 4 },
    ];
    const maintenance = [
      { id: 11, date: "2026-08-15", eventType: "breakdown" },
      { id: 12, date: "2026-09-15", eventType: "breakdown" },
    ];
    const august = calculateHireGroup({
      terms,
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      activities,
      maintenance,
    });
    const september = calculateHireGroup({
      terms,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-20",
      activities,
      maintenance,
    });
    expect(august.activityIds).toEqual(["plant_usage:1"]);
    expect(september.activityIds).toEqual(["plant_usage:2"]);
    expect(august.deductionAmount).toBe(2_000);
    expect(september.deductionAmount).toBe(2_000);
    expect(august.exceptions.map(item => item.sourceId)).toEqual([11]);
    expect(september.exceptions.map(item => item.sourceId)).toEqual([12]);
  });

  it("B/C/D: accepts omitted automatic months while retaining overlap locks", () => {
    const storage = readFileSync("server/storage.ts", "utf8");
    expect(storage).not.toContain("Every eligible monthly hired machine must be included for the selected vendor and bill period.");
    expect(storage).toContain("requiredMonthlyIds.size === 0");
    expect(storage).toContain("Automatic monthly hire groups must match one calendar-month segment of the bill period.");
    expect(storage).toContain("This equipment already has an overlapping hire statement");
    expect(storage).toContain("pg_advisory_xact_lock(1426");
  });

  it("B/C/D executable: persists August only, accepts September later, and rejects August twice", async () => {
    const equipment = {
      id: 71,
      name: "MONTHLY ROLLER",
      ownership: "hired",
      vendorName: "TEST VENDOR",
      contractorName: "TEST VENDOR",
      hireBillingBasis: "monthly",
      hireRate: 60_000,
      hireStartDate: "2026-08-01",
      hireEndDate: null,
      hireMonthlyDivisorType: "30",
      hireMonthlyDivisor: null,
      hireDieselResponsibility: "vendor",
      hireOperatorResponsibility: "vendor",
      hireAgreementRemarks: null,
      hireBreakdownDeductionEnabled: false,
      meterType: "hour_meter",
      consumptionNorm: null,
    };
    const persisted: any[] = [];
    let nextStatementId = 1;
    let nextItemId = 1;

    const storage = new DatabaseStorage() as any;
    storage.getVendorBillHireActivities = async (_vendor: string, from: string) => [{
      source: "equipment_default",
      sourceId: equipment.id,
      equipmentId: equipment.id,
      businessDate: from,
      entryType: "monthly",
      equipment,
    }];

    const fakeTx = (billId: number) => {
      let statementSelect = 0;
      let pendingStatement: any;
      return {
        execute: async () => undefined,
        select: () => ({
          from(table: unknown) {
            return {
              where() {
                return {
                  limit: async () => {
                    if (table === equipmentMaster) return [equipment];
                    if (table !== hireStatements) return [];
                    statementSelect += 1;
                    // First statement query is the exact-period lookup. The
                    // test's one submitted group lets the fake return the only
                    // existing range, just as the DB equality query would.
                    if (statementSelect === 1) {
                      const requested = (fakeTx as any).requestedPeriod as { from: string; to: string };
                      const exact = persisted.find(row =>
                        row.equipmentId === equipment.id &&
                        row.periodFrom === requested.from &&
                        row.periodTo === requested.to);
                      return exact ? [exact] : [];
                    }
                    // Second query is the inclusive overlap probe.
                    if (statementSelect === 2) return [];
                    return [];
                  },
                  then(resolve: (rows: any[]) => unknown) {
                    const rows = table === hireStatements
                      ? persisted.filter(row => row.vendorBillId === billId)
                      : [];
                    return Promise.resolve(rows).then(resolve);
                  },
                };
              },
            };
          },
        }),
        insert(table: unknown) {
          return {
            values(value: any) {
              return {
                returning: async () => {
                  if (table === hireStatements) {
                    pendingStatement = { ...value, id: nextStatementId++, revision: 1 };
                    persisted.push(pendingStatement);
                    return [pendingStatement];
                  }
                  if (table === vendorBillItems) return [{ ...value, id: nextItemId++ }];
                  return [value];
                },
              };
            },
          };
        },
        delete: () => ({ where: async () => undefined }),
        update: () => ({ set: () => ({ where: () => ({ returning: async () => [pendingStatement] }) }) }),
      };
    };

    const bill = (id: number, from: string, to: string) => ({
      id,
      vendorName: "TEST VENDOR",
      periodFrom: from,
      periodTo: to,
      status: "draft",
      gstRateEquipment: 0,
      tdsRate: 0,
    });
    const request = (from: string, to: string) => ({
      hireGroups: [{
        equipmentId: equipment.id,
        periodFrom: from,
        periodTo: to,
        basis: "monthly",
        rate: equipment.hireRate,
      }],
    });
    const reconcile = async (billId: number, billFrom: string, billTo: string, groupFrom: string, groupTo: string) => {
      const tx = fakeTx(billId);
      (fakeTx as any).requestedPeriod = { from: groupFrom, to: groupTo };
      return storage.reconcileVendorBillHireGroups(
        tx,
        bill(billId, billFrom, billTo),
        request(groupFrom, groupTo),
      );
    };

    const augustItems = await reconcile(101, "2026-08-01", "2026-09-20", "2026-08-01", "2026-08-31");
    expect(augustItems).toHaveLength(1);
    expect(persisted.map(row => [row.periodFrom, row.periodTo])).toEqual([
      ["2026-08-01", "2026-08-31"],
    ]);

    const septemberItems = await reconcile(102, "2026-09-01", "2026-09-20", "2026-09-01", "2026-09-20");
    expect(septemberItems).toHaveLength(1);
    expect(persisted.map(row => row.grossAmount)).toEqual([60_000, 40_000]);

    await expect(reconcile(103, "2026-08-01", "2026-08-31", "2026-08-01", "2026-08-31"))
      .rejects.toMatchObject({ code: "CONFLICT", message: "This equipment already has an overlapping hire statement" });
    expect(persisted).toHaveLength(2);

    // Earlier VB-20 clients clipped first/last segments to Master hire dates.
    equipment.hireStartDate = "2026-10-15";
    const clippedItems = await reconcile(104, "2026-10-01", "2026-11-10", "2026-10-15", "2026-10-31");
    expect(clippedItems).toHaveLength(1);
    expect(persisted[persisted.length - 1]).toMatchObject({
      periodFrom: "2026-10-15",
      periodTo: "2026-10-31",
      grossAmount: 34_000,
    });

    // The current client retains bill-month boundaries and relies on the
    // calculator to clip the active range. That equivalent shape is valid too.
    equipment.hireStartDate = "2026-12-15";
    const billBoundaryItems = await reconcile(105, "2026-12-01", "2027-01-10", "2026-12-01", "2026-12-31");
    expect(billBoundaryItems).toHaveLength(1);
    expect(persisted[persisted.length - 1]).toMatchObject({
      periodFrom: "2026-12-01",
      periodTo: "2026-12-31",
      grossAmount: 34_000,
    });
  });

  it("matches client bill-month groups while retaining clipped-client compatibility", () => {
    const storage = readFileSync("server/storage.ts", "utf8");
    const client = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(client).toMatch(/monthlyHireSegments\(\s*Date\.parse\(`\$\{periodFrom\}/);
    expect(storage).toContain("monthlyHireSegments(");
    expect(storage).toContain("equipment.hireStartDate && equipment.hireStartDate > bill.periodFrom");
    expect(storage).toContain("equipment.hireEndDate && equipment.hireEndDate < bill.periodTo");
    expect(dates(monthlyHireSegments(at("2026-08-15"), at("2026-09-10")))).toEqual([
      { from: "2026-08-15", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-10" },
    ]);
  });
});