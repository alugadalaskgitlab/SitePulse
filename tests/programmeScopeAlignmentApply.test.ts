import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  let bars: any[] = [];
  let items: any[] = [];
  let segments: any[] = [];
  const updatedValues: Record<string, unknown>[] = [];
  const auditValues: Record<string, unknown>[] = [];
  const failedUpdateIds = new Set<number>();
  let updateOrder: number[] = [];
  let updateIndex = 0;
  let scopeToken = "scope-token";

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
  const tx: any = {
    execute: vi.fn(async () => ({ rows: [{ token: scopeToken }] })),
    select: vi.fn(() => {
      const results = [[{ id: 2 }], bars, items, [], segments];
      return query(results[selectIndex++] ?? []);
    }),
    transaction: vi.fn(async (callback: (executor: any) => Promise<unknown>) => callback(tx)),
    update: vi.fn(() => {
      const barId = updateOrder[updateIndex++];
      const setValues: Record<string, unknown> = {};
      const statement: any = {
        where: vi.fn(() => statement),
        returning: vi.fn(async () => {
          if (barId == null || failedUpdateIds.has(barId)) return [];
          const row = bars.find(candidate => Number(candidate.id) === Number(barId));
          if (!row) return [];
          Object.assign(row, setValues);
          return [{ id: barId }];
        }),
      };
      statement.set = vi.fn((values: Record<string, unknown>) => {
        Object.assign(setValues, values);
        updatedValues.push(values);
        return statement;
      });
      return statement;
    }),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        auditValues.push(values);
        return Promise.resolve([]);
      },
    })),
  };
  const transaction = vi.fn(async (callback: (executor: any) => Promise<unknown>) => {
    selectIndex = 0;
    return callback(tx);
  });
  return {
    tx,
    transaction,
    updatedValues,
    auditValues,
    failedUpdateIds,
    setFixture(next: { bars: any[]; items: any[]; segments: any[]; scopeToken?: string }) {
      bars = structuredClone(next.bars);
      items = structuredClone(next.items);
      segments = structuredClone(next.segments);
      scopeToken = next.scopeToken ?? "scope-token";
      updateOrder = [...bars]
        .filter(row => Number(row.chainageTo) > 1.9 && Number(row.chainageFrom) < 2.9)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map(row => Number(row.id));
      updateIndex = 0;
      selectIndex = 0;
    },
    get bars() { return bars; },
    setItemCurrentQty(itemId: number, quantity: number) {
      const item = items.find(candidate => Number(candidate.id) === Number(itemId));
      if (item) item.currentQty = quantity;
    },
    setUpdateOrder(ids: number[]) {
      updateOrder = [...ids];
      updateIndex = 0;
    },
    reset() {
      updatedValues.length = 0;
      auditValues.length = 0;
      failedUpdateIds.clear();
      updateIndex = 0;
      selectIndex = 0;
      scopeToken = "scope-token";
      transaction.mockClear();
      tx.execute.mockClear();
      tx.select.mockClear();
      tx.update.mockClear();
      tx.insert.mockClear();
      tx.transaction.mockClear();
    },
  };
});

vi.mock("../server/db", () => ({
  db: {
    transaction: harness.transaction,
  },
}));

import { storage } from "../server/storage";

const scope = [{
  id: 5,
  segmentType: "working_reach",
  label: "Reach 3",
  chainageFrom: 1.9,
  chainageTo: 2.9,
  side: "full_width",
  status: "confirmed",
  applicability: "all_linear",
}];
const structureItems = [
  { id: 23, itemCode: "1", itemName: "Earthwork excavation for culverts", currentQty: 27.33, plannedQty: 27.33 },
  { id: 24, itemCode: "2", itemName: "Sand filling in foundation", currentQty: 5.77, plannedQty: 5.77 },
  { id: 25, itemCode: "3", itemName: "PCC 1:3:6", currentQty: 3.93, plannedQty: 3.93 },
].map(item => ({
  ...item,
  categoryId: 3,
  description: item.itemName,
  unit: "CUM",
  canonicalUnit: "CUM",
  workCategory: "CD Works — Culvert",
  layerConfig: { layerType: "concrete" },
  fixedQuantity: true,
  fixedQuantityReachId: null,
  planningWorkType: "structure",
}));
const remainingStructureBars = [
  { id: 953, boqProjectId: 2, boqItemId: 23, chainageFrom: 1.6, chainageTo: 3.2, plannedQty: 13.665, baselineStartDate: "2026-09-24", baselineEndDate: "2026-09-29", startDate: "2026-10-25", endDate: "2026-10-30", revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }], isQtyOverride: true },
  { id: 954, boqProjectId: 2, boqItemId: 24, chainageFrom: 1.6, chainageTo: 3.2, plannedQty: 2.885, baselineStartDate: "2026-09-24", baselineEndDate: "2026-09-29", startDate: "2026-10-25", endDate: "2026-10-30", revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }], isQtyOverride: true },
  { id: 955, boqProjectId: 2, boqItemId: 25, chainageFrom: 1.6, chainageTo: 3.2, plannedQty: 1.965, baselineStartDate: "2026-10-03", baselineEndDate: "2026-10-03", startDate: "2026-11-03", endDate: "2026-11-03", revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }], isQtyOverride: true },
  { id: 956, boqProjectId: 2, boqItemId: 23, chainageFrom: 0.1, chainageTo: 0.3, plannedQty: 1.25, baselineStartDate: "2026-08-01", baselineEndDate: "2026-08-02", startDate: "2026-08-01", endDate: "2026-08-02", revisionHistory: [], isQtyOverride: false },
].map(bar => ({
  ...bar,
  startMonth: 1,
  endMonth: 2,
  notes: "keep this note",
  side: "full_width",
  structureChainageKm: null,
}));

const exactBeforeStateBars = [
  { id: 953, boqProjectId: 2, boqItemId: 23, chainageFrom: 1.6, chainageTo: 3.2, plannedQty: 13.665, baselineStartDate: "2026-09-24", baselineEndDate: "2026-09-29", startDate: "2026-10-25", endDate: "2026-10-30", revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }], isQtyOverride: true },
  { id: 954, boqProjectId: 2, boqItemId: 24, chainageFrom: 1.6, chainageTo: 3.2, plannedQty: 2.885, baselineStartDate: "2026-09-24", baselineEndDate: "2026-09-29", startDate: "2026-10-25", endDate: "2026-10-30", revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }], isQtyOverride: true },
  { id: 955, boqProjectId: 2, boqItemId: 25, chainageFrom: 1.6, chainageTo: 3.2, plannedQty: 1.965, baselineStartDate: "2026-10-03", baselineEndDate: "2026-10-03", startDate: "2026-11-03", endDate: "2026-11-03", revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }], isQtyOverride: true },
].map(bar => ({
  ...bar,
  startMonth: 1,
  endMonth: 2,
  notes: "keep this note",
  side: "full_width",
  structureChainageKm: null,
}));
const exactBeforeStateSegments = [
  ...scope,
  {
    id: 6,
    segmentType: "no_scope",
    label: "No scope",
    chainageFrom: 1.6,
    chainageTo: 1.9,
    side: "full_width",
    status: "confirmed",
    applicability: "all_linear",
  },
];

async function previewUpdates() {
  const preview = await storage.getProgrammeScopeAlignmentPreview(2);
  return {
    preview,
    expectedUpdates: preview.rows
      .filter(row => row.action === "update" && row.barId != null)
      .map(row => ({
        barId: Number(row.barId),
        itemName: row.itemName,
        proposedChainageFrom: row.proposedChainageFrom,
        proposedChainageTo: row.proposedChainageTo,
        proposedQuantity: row.proposedQuantity == null ? null : Number(row.proposedQuantity),
      })),
  };
}

describe("Owner programme scope alignment apply", () => {
  beforeEach(() => harness.reset());

  it("applies the remaining front's full quantity and preserves baseline and revision history", async () => {
    // The deleted first front is intentionally absent; the single remaining
    // bar must carry the full BOQ quantity over the confirmed 1.9–2.9 km reach.
    harness.setFixture({ bars: remainingStructureBars, items: structureItems, segments: scope });
    expect(harness.bars.some(bar => bar.id === 948)).toBe(false);
    const { preview, expectedUpdates } = await previewUpdates();
    const protectedState = harness.bars.map(({ id, startDate, endDate, baselineStartDate, baselineEndDate, revisionHistory, isQtyOverride, notes }) => ({
      id, startDate, endDate, baselineStartDate, baselineEndDate, revisionHistory, isQtyOverride, notes,
    }));

    const result = await storage.applyProgrammeScopeAlignment(
      2,
      "scope-token",
      preview.expectedBars,
      expectedUpdates,
      { userId: 7, userName: "Project Owner", userRole: "Owner" },
    );

    expect(result).toEqual({ updatedCount: 3, notUpdated: [], suggestedRemoveCount: 1, expectedUpdateCount: 3 });
    expect(harness.bars.map(bar => [bar.id, bar.chainageFrom, bar.chainageTo, bar.plannedQty])).toEqual([
      [953, 1.9, 2.9, 27.33],
      [954, 1.9, 2.9, 5.77],
      [955, 1.9, 2.9, 3.93],
      [956, 0.1, 0.3, 1.25],
    ]);
    expect(harness.bars[0]).toMatchObject({
      baselineStartDate: "2026-09-24",
      baselineEndDate: "2026-09-29",
      startDate: "2026-10-25",
      endDate: "2026-10-30",
      revisionHistory: [{ type: "cascade_shift", delta: 31, sourceBarId: 930 }],
      isQtyOverride: true,
      notes: "keep this note",
    });
    expect(harness.bars.map(({ id, startDate, endDate, baselineStartDate, baselineEndDate, revisionHistory, isQtyOverride, notes }) => ({
      id, startDate, endDate, baselineStartDate, baselineEndDate, revisionHistory, isQtyOverride, notes,
    }))).toEqual(protectedState);
    expect(harness.auditValues).toHaveLength(3);
    expect(harness.auditValues.every(row => row.action === "scope_alignment")).toBe(true);
    expect(harness.auditValues.map(row => (row.newValues as any).result)).toEqual(["updated", "updated", "updated"]);
  });

  it("reports a row with no returned update while applying the other rows", async () => {
    harness.setFixture({ bars: remainingStructureBars, items: structureItems, segments: scope });
    harness.failedUpdateIds.add(954);
    const { preview, expectedUpdates } = await previewUpdates();

    const result = await storage.applyProgrammeScopeAlignment(
      2,
      "scope-token",
      preview.expectedBars,
      expectedUpdates,
      { userId: 7, userName: "Project Owner", userRole: "Owner" },
    );

    expect(result.updatedCount).toBe(2);
    expect(result.expectedUpdateCount).toBe(3);
    expect(result.notUpdated).toEqual([{
      barId: 954,
      itemName: "Sand filling in foundation",
      reason: "The update returned no saved row.",
    }]);
    expect(harness.bars.map(bar => [bar.id, bar.chainageFrom, bar.chainageTo, bar.plannedQty])).toEqual([
      [953, 1.9, 2.9, 27.33],
      [954, 1.6, 3.2, 2.885],
      [955, 1.9, 2.9, 3.93],
      [956, 0.1, 0.3, 1.25],
    ]);
    expect(harness.auditValues).toHaveLength(3);
    expect(harness.auditValues.find(row => row.action === "scope_alignment_not_updated")).toMatchObject({
      transactionId: 954,
      newValues: expect.objectContaining({
        result: "not_updated",
        itemName: "Sand filling in foundation",
        reason: "The update returned no saved row.",
      }),
    });
  });

  it("refuses all updates when scope changed after the preview", async () => {
    harness.setFixture({ bars: remainingStructureBars, items: structureItems, segments: scope, scopeToken: "new-scope" });
    const { preview, expectedUpdates } = await previewUpdates();

    await expect(storage.applyProgrammeScopeAlignment(
      2,
      "old-scope",
      preview.expectedBars,
      expectedUpdates,
      { userId: 7, userName: "Project Owner", userRole: "Owner" },
    )).rejects.toMatchObject({ code: "SCOPE_CHANGED_DURING_PLANNING" });

    expect(harness.updatedValues).toHaveLength(0);
    expect(harness.auditValues).toHaveLength(0);
  });

  it("previews and applies the exact three remaining structure fronts across a no-scope gap", async () => {
    harness.setFixture({
      bars: exactBeforeStateBars,
      items: structureItems,
      segments: exactBeforeStateSegments,
    });

    const { preview, expectedUpdates } = await previewUpdates();
    expect(preview.rows.filter(row => row.action === "update").map(row => [
      row.barId,
      row.currentChainageFrom,
      row.currentChainageTo,
      row.currentQuantity,
      row.proposedChainageFrom,
      row.proposedChainageTo,
      row.proposedQuantity,
    ])).toEqual([
      [953, 1.6, 3.2, 13.665, 1.9, 2.9, 27.33],
      [954, 1.6, 3.2, 2.885, 1.9, 2.9, 5.77],
      [955, 1.6, 3.2, 1.965, 1.9, 2.9, 3.93],
    ]);
    expect(expectedUpdates).toHaveLength(3);

    const result = await storage.applyProgrammeScopeAlignment(
      2,
      preview.scopeVersionToken,
      preview.expectedBars,
      expectedUpdates,
      { userId: 7, userName: "Project Owner", userRole: "Owner" },
    );

    expect(result).toMatchObject({ updatedCount: 3, notUpdated: [], expectedUpdateCount: 3 });
    expect(harness.bars.map(({ id, chainageFrom, chainageTo, plannedQty }) => [id, chainageFrom, chainageTo, plannedQty])).toEqual([
      [953, 1.9, 2.9, 27.33],
      [954, 1.9, 2.9, 5.77],
      [955, 1.9, 2.9, 3.93],
    ]);
  });

  it("reports a previewed row when its proposal changes before Apply and continues other rows", async () => {
    harness.setFixture({
      bars: exactBeforeStateBars,
      items: structureItems,
      segments: exactBeforeStateSegments,
    });
    const { preview, expectedUpdates } = await previewUpdates();
    harness.setItemCurrentQty(23, 30);
    harness.setUpdateOrder([954, 955]);

    const result = await storage.applyProgrammeScopeAlignment(
      2,
      preview.scopeVersionToken,
      preview.expectedBars,
      expectedUpdates,
      { userId: 7, userName: "Project Owner", userRole: "Owner" },
    );

    expect(result.updatedCount).toBe(2);
    expect(result.notUpdated).toEqual([{
      barId: 953,
      itemName: "Earthwork excavation for culverts",
      reason: "The alignment inputs changed since this preview; open the review again.",
    }]);
    expect(harness.bars.map(({ id, chainageFrom, chainageTo, plannedQty }) => [id, chainageFrom, chainageTo, plannedQty])).toEqual([
      [953, 1.6, 3.2, 13.665],
      [954, 1.9, 2.9, 5.77],
      [955, 1.9, 2.9, 3.93],
    ]);
  });
});
