import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const state = { dbRows: [] as any[][] };
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
    fakeDb: {
      select: vi.fn(() => query(state.dbRows.shift() || [])),
    },
  };
});

vi.mock("../server/db", () => ({ db: fx.fakeDb }));

import { DatabaseStorage } from "../server/storage";
import { resolveEquipmentBoqHours } from "../shared/equipmentActivityAllocations";
import { isEquipmentHireBillEligible } from "../shared/hireBilling";

beforeEach(() => {
  fx.dbRows.length = 0;
  vi.clearAllMocks();
});

const equipmentMaster = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  name: "TASK TRACE JCB",
  vendorName: "TASK TRACE VENDOR",
  ownership: "hired",
  hireBillingBasis: "hourly",
  ...overrides,
});

const dprLog = (overrides: Record<string, unknown> = {}) => ({
  id: 70,
  equipmentId: 7,
  date: "2026-08-31",
  entryType: "time_meter",
  hoursWorked: null,
  startTime: null,
  endTime: null,
  openingReading: null,
  closingReading: null,
  numberOfTrips: null,
  diesel: 0,
  task: null,
  site: "TASK TRACE SITE",
  ...overrides,
});

function queueAutoItemPull(row: Record<string, unknown>, masterOverrides: Record<string, unknown> = {}) {
  fx.dbRows.push(
    [], // vendor aliases
    [equipmentMaster(masterOverrides)], // hired Equipment Master rows
    [dprLog(row)], // linked DPR equipment rows
    [], // independent Plant Usage rows
    [], // unlinked site DPR rows
  );
}

async function pullEquipmentItem(row: Record<string, unknown>, masterOverrides: Record<string, unknown> = {}) {
  queueAutoItemPull(row, masterOverrides);
  const storage = new DatabaseStorage();
  const items = await storage.getVendorBillAutoItems(
    "Task Trace Vendor",
    "equipment",
    "2026-08-01",
    "2026-08-31",
  );
  return items.filter(item => item.category === "equipment");
}

describe("DPR-03 equipment task financial trace", () => {
  it("does not pull a time-meter task-only row when its calculated quantity is zero", async () => {
    const items = await pullEquipmentItem({
      task: "CUT TRENCH / TOE DRAIN",
      entryType: "time_meter",
    });

    expect(items).toEqual([]);
  });

  it("keeps quantity and rate unchanged when task text is added to real hourly activity", async () => {
    const withTask = (await pullEquipmentItem({
      id: 71,
      entryType: "hourly",
      hoursWorked: 5,
      task: "CUT TRENCH / TOE DRAIN",
    }))[0];
    const withoutTask = (await pullEquipmentItem({
      id: 71,
      entryType: "hourly",
      hoursWorked: 5,
      task: null,
    }))[0];

    expect(withTask).toMatchObject({ qty: 5, unit: "HRS", source: "auto", sourceId: "dpr_equipment:71" });
    expect(withoutTask).toMatchObject({ qty: 5, unit: "HRS", source: "auto", sourceId: "dpr_equipment:71" });
    expect(withTask.qty).toBe(withoutTask.qty);
    expect(withTask.rate).toBe(withoutTask.rate);
    const { description: taskDescription, ...taskFields } = withTask;
    const { description: blankDescription, ...blankFields } = withoutTask;
    expect(taskFields).toEqual(blankFields);
    expect(taskDescription).toContain("CUT TRENCH / TOE DRAIN");
    expect(blankDescription).not.toContain("CUT TRENCH / TOE DRAIN");
  });

  it("keeps a legitimately billable daily hire at one line with or without task text", async () => {
    const withTask = (await pullEquipmentItem({
      id: 72,
      entryType: "daily",
      hoursWorked: null,
      task: "CUT TRENCH / TOE DRAIN",
    }, { hireBillingBasis: "daily" }))[0];
    const withoutTask = (await pullEquipmentItem({
      id: 72,
      entryType: "daily",
      hoursWorked: null,
      task: null,
    }, { hireBillingBasis: "daily" }))[0];

    expect(withTask).toMatchObject({ qty: 1, unit: "DAYS", source: "auto", sourceId: "dpr_equipment:72" });
    expect(withoutTask).toMatchObject({ qty: 1, unit: "DAYS", source: "auto", sourceId: "dpr_equipment:72" });
    expect(withTask.qty).toBe(withoutTask.qty);
    const { description: taskDescription, ...taskFields } = withTask;
    const { description: blankDescription, ...blankFields } = withoutTask;
    expect(taskFields).toEqual(blankFields);
    expect(taskDescription).toContain("CUT TRENCH / TOE DRAIN");
    expect(blankDescription).not.toContain("CUT TRENCH / TOE DRAIN");
  });

  it("keeps monthly contract eligibility identical when only task text changes", () => {
    const contract = {
      ownership: "hired",
      vendorName: "TASK TRACE VENDOR",
      hireBillingBasis: "monthly",
      hireRate: 30_000,
      hireStartDate: "2026-08-01",
      hireEndDate: null,
    };

    expect(isEquipmentHireBillEligible({ ...contract, task: "CUT TRENCH / TOE DRAIN" }, "2026-08-01", "2026-08-31"))
      .toBe(true);
    expect(isEquipmentHireBillEligible({ ...contract, task: null }, "2026-08-01", "2026-08-31"))
      .toBe(true);
  });

  it("does not produce a BOQ slice for a task-only equipment row regardless of hours", () => {
    const taskOnly = { task: "CUT TRENCH / TOE DRAIN" };

    expect(resolveEquipmentBoqHours({ ...taskOnly, hoursWorked: 0 })).toEqual([]);
    expect(resolveEquipmentBoqHours({ ...taskOnly, hoursWorked: 8 })).toEqual([]);
  });
});