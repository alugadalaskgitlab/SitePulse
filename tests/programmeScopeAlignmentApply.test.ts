import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const updatedValues: Record<string, unknown>[] = [];
  const auditValues: Record<string, unknown>[] = [];
  const bar = {
    id: 10,
    boqProjectId: 2,
    boqItemId: 1,
    reachLabel: "Reach 1",
    chainageFrom: 0,
    chainageTo: 1.2,
    startMonth: 1,
    endMonth: 2,
    startDate: "2026-01-01",
    endDate: "2026-02-01",
    plannedQty: 75,
    notes: "keep this note",
    side: "full_width",
    structureChainageKm: null,
  };
  const project = { id: 2 };
  const item = {
    id: 1,
    categoryId: null,
    itemCode: "1",
    itemName: "Road work",
    description: "Road work",
    unit: "CUM",
    canonicalUnit: "CUM",
    currentQty: 100,
    workCategory: "earthwork",
    layerConfig: { layerType: "earthwork" },
    fixedQuantity: false,
    fixedQuantityReachId: null,
    planningWorkType: "road",
  };
  const segment = {
    id: 5,
    segmentType: "working_reach",
    label: "Reach 1",
    chainageFrom: 0,
    chainageTo: 1,
    side: "full_width",
    status: "confirmed",
    applicability: "all_linear",
  };

  const query = (result: unknown) => {
    const chain: any = {};
    for (const method of ["from", "where", "for", "limit", "orderBy", "leftJoin"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  let selectIndex = 0;
  const results = [[project], [bar], [item], [segment]];
  const tx = {
    execute: vi.fn().mockResolvedValue({ rows: [{ token: "scope-token" }] }),
    select: vi.fn(() => query(results[selectIndex++] ?? [])),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        updatedValues.push(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        auditValues.push(values);
        return Promise.resolve([]);
      },
    })),
  };
  const transaction = vi.fn(async (callback: (executor: any) => Promise<unknown>) => callback(tx));
  return {
    updatedValues,
    auditValues,
    transaction,
    tx,
    reset() {
      updatedValues.length = 0;
      auditValues.length = 0;
      selectIndex = 0;
      transaction.mockClear();
      tx.execute.mockClear();
      tx.select.mockClear();
      tx.update.mockClear();
      tx.insert.mockClear();
    },
  };
});

vi.mock("../server/db", () => ({
  db: {
    transaction: harness.transaction,
  },
}));

import { storage } from "../server/storage";

describe("Owner programme scope alignment apply", () => {
  beforeEach(() => harness.reset());

  it("updates only chainage and planned quantity and records each bar change", async () => {
    const result = await storage.applyProgrammeScopeAlignment(
      2,
      "scope-token",
      [{ id: 10, chainageFrom: 0, chainageTo: 1.2, plannedQty: 75 }],
      { userId: 7, userName: "Project Owner", userRole: "Owner" },
    );

    expect(result).toEqual({ updatedCount: 1, suggestedRemoveCount: 0 });
    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.updatedValues).toEqual([{
      chainageFrom: 0,
      chainageTo: 1,
      plannedQty: 100,
    }]);
    expect(harness.auditValues).toHaveLength(1);
    expect(harness.auditValues[0]).toMatchObject({
      module: "work_program_bar",
      transactionId: 10,
      action: "scope_alignment",
      userId: 7,
      userName: "Project Owner",
      userRole: "Owner",
      oldValues: { chainageFrom: 0, chainageTo: 1.2, plannedQty: 75 },
      newValues: { chainageFrom: 0, chainageTo: 1, plannedQty: 100 },
    });
    expect(harness.auditValues[0].reason).toMatch(/confirmed working scope/);
  });
});
