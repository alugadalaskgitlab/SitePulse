import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const state = {
    dbRows: [] as any[][],
    executorRows: [] as any[][],
  };
  const query = (rows: any[] = []) => {
    const q: any = {
      from: () => q,
      where: () => q,
      innerJoin: () => q,
      leftJoin: () => q,
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return q;
  };
  return {
    ...state,
    fakeDb: { select: vi.fn(() => query(state.dbRows.shift() || [])) },
  };
});

function query(rows: any[] = []) {
  const q: any = {
    from: () => q,
    where: () => q,
    innerJoin: () => q,
    leftJoin: () => q,
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return q;
}

vi.mock("../server/db", () => ({ db: fx.fakeDb }));

import { DatabaseStorage } from "../server/storage";

beforeEach(() => {
  fx.dbRows.length = 0;
  fx.executorRows = [];
  vi.clearAllMocks();
});

function queueAutoEquipmentRows() {
  fx.dbRows.push(
    [], // vendor aliases
    [
      { id: 1, name: "SITE JCB", vendorName: "MIRROR VENDOR", ownership: "hired", hireBillingBasis: "hourly" },
      { id: 2, name: "PLANT ROLLER", vendorName: "MIRROR VENDOR", ownership: "hired", hireBillingBasis: "hourly" },
    ],
    [
      {
        id: 10, equipmentId: 1, date: "2026-08-31", entryType: "hourly",
        hoursWorked: 5, status: "submitted", plantUsageId: 100, site: "SITE A",
      },
      {
        id: 11, equipmentId: 2, date: "2026-08-31", entryType: "hourly",
        hoursWorked: 2, status: "submitted", plantUsageId: null, site: "SITE B",
      },
    ],
    [
      // The linked Plant row is the mirror and must not be billed twice.
      { id: 100, equipmentId: 1, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 5 },
      // Independent Plant usage for the same equipment remains billable.
      { id: 101, equipmentId: 1, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 3 },
      // Matching plantUsageId alone is insufficient; this different
      // equipment row remains an independent billable candidate.
      { id: 100, equipmentId: 2, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 2 },
      // Independent Plant usage for another equipment remains billable.
      { id: 201, equipmentId: 2, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 1 },
    ],
    [], // unlinked site DPR logs
  );
}

describe("VB-15 vendor-bill activity mirror suppression", () => {
  it("suppresses only the explicitly linked same-equipment Plant mirror", async () => {
    fx.executorRows = [
      [
        { id: 1, name: "SITE JCB", vendorName: "MIRROR VENDOR", ownership: "hired", meterType: "hour_meter", consumptionNorm: 2 },
        { id: 2, name: "PLANT ROLLER", vendorName: "MIRROR VENDOR", ownership: "hired", meterType: "hour_meter", consumptionNorm: 2 },
      ],
      [
        {
          id: 10, equipmentId: 1, date: "2026-08-31", entryType: "hourly",
          hoursOrKmRun: 5, status: "submitted", plantUsageId: 100,
        },
        {
          id: 11, equipmentId: 2, date: "2026-08-31", entryType: "hourly",
          hoursOrKmRun: 2, status: "submitted", plantUsageId: null,
        },
      ],
      [
        // The linked Plant row is the mirror and must not be billed twice.
        { id: 100, equipmentId: 1, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 5 },
        // Independent Plant usage for the same equipment remains billable.
        { id: 101, equipmentId: 1, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 3 },
        // A stale/mismatched equipment link must not suppress this row:
        // matching plantUsageId alone is insufficient.
        { id: 100, equipmentId: 2, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 2 },
        // Independent Plant usage for another equipment remains billable.
        { id: 201, equipmentId: 2, date: "2026-08-31", entryType: "hourly", hoursOrKmRun: 1 },
      ],
      [], // site material trips
      [], // bulk transport trips
      [], // maintenance
      [], // diesel purchase rates
    ];
    const executor: any = {
      select: vi.fn(() => query(fx.executorRows.shift() || [])),
    };

    const storage = new DatabaseStorage();
    const activities = await storage.getVendorBillHireActivities(
      "Mirror Vendor",
      "2026-08-31",
      "2026-08-31",
      executor,
    );

    const activityRows = activities.filter(row => row.source === "dpr_log" || row.source === "plant_usage");
    expect(activityRows.map(row => `${row.source}:${row.sourceId}`)).toEqual([
      "dpr_log:10",
      "dpr_log:11",
      "plant_usage:101",
      "plant_usage:100",
      "plant_usage:201",
    ]);
    expect(activityRows.filter(row => row.source === "plant_usage" && row.sourceId === 100))
      .toHaveLength(1);
    expect(activityRows.filter(row => row.source === "plant_usage" && row.sourceId === 101))
      .toHaveLength(1);
    expect(activityRows.filter(row => row.source === "dpr_log" && row.sourceId === 11))
      .toHaveLength(1);
  });

  it("suppresses the linked mirror on both equipment and All auto-item pulls", async () => {
    for (const billType of ["equipment", "all"]) {
      queueAutoEquipmentRows();
      const storage = new DatabaseStorage();
      const items = await storage.getVendorBillAutoItems(
        "Mirror Vendor",
        billType,
        "2026-08-31",
        "2026-08-31",
      );
      const equipmentItems = items.filter(item => item.category === "equipment");

      expect(equipmentItems.map(item => item.sourceId)).toEqual([
        "dpr_equipment:10",
        "dpr_equipment:11",
        "plant_usage:101",
        "plant_usage:100",
        "plant_usage:201",
      ]);
      expect(equipmentItems.filter(item => item.sourceId === "plant_usage:101")).toHaveLength(1);
      expect(equipmentItems.filter(item => item.sourceId === "dpr_equipment:11")).toHaveLength(1);
      expect(equipmentItems.find(item => item.sourceId === "plant_usage:100" && item.equipmentId === 2))
        .toBeTruthy();
    }
  });
});