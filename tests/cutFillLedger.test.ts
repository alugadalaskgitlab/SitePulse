import { describe, expect, it } from "vitest";
import {
  buildCutFillFormContext,
  flattenCutFillConsumptions,
  hydrateCutFillConsumptions,
  projectFormLedger,
  validateCutFillForm,
} from "../client/src/lib/cutFillLedger";

describe("project cut/fill ledger", () => {
  it("is invariant to fill row order and reports competition", () => {
    const source = [{ key: "same_dpr:cut", availableQty: 10 }];
    const rows = [
      { entryKey: "fill-a", quantity: 7, allocations: [{ sourceKey: "same_dpr:cut", quantity: 7 }] },
      { entryKey: "fill-b", quantity: 7, allocations: [{ sourceKey: "same_dpr:cut", quantity: 7 }] },
    ];
    expect(projectFormLedger(rows, source).map(r => r.overdraw)).toEqual([4, 4]);
    expect(projectFormLedger([...rows].reverse(), source).map(r => r.overdraw)).toEqual([4, 4]);
  });

  it("hydrates stable progress and opening-balance source keys", () => {
    const [row] = hydrateCutFillConsumptions(
      [{ entryKey: "fill-a" }],
      [
        { fillEntryKey: "fill-a", sourceEntryKey: "cut-a", openingBalanceId: null, quantity: 4 },
        { fillEntryKey: "fill-a", sourceEntryKey: null, openingBalanceId: 12, quantity: 3 },
      ],
    );
    expect(row.allocations).toEqual([
      expect.objectContaining({ sourceKey: "progress:cut-a", quantity: 4 }),
      expect.objectContaining({ sourceKey: "opening:12", quantity: 3 }),
    ]);
  });

  it("flattens legacy allocations that have source ids but no sourceKey", () => {
    expect(flattenCutFillConsumptions([
      {
        entryKey: "fill-a",
        allocations: [
          { sourceEntryKey: "cut-a", quantity: 2 },
          { openingBalanceId: 7, quantity: 3 },
        ],
      },
    ])).toEqual([
      { fillEntryKey: "fill-a", sourceEntryKey: "cut-a", openingBalanceId: null, quantity: 2 },
      { fillEntryKey: "fill-a", sourceEntryKey: null, openingBalanceId: 7, quantity: 3 },
    ]);
  });

  it("offers a same-DPR excavation source regardless of visual row order", () => {
    const boqItems = [
      { id: 1, description: "Roadway excavation in ordinary soil", unit: "CUM" },
      { id: 2, description: "Embankment with approved material", unit: "CUM" },
    ];
    const cut = { entryKey: "cut-a", boqItemId: 1, quantity: 10, reusableQty: 10 };
    const fill = { entryKey: "fill-a", boqItemId: 2, quantity: 5, allocations: [] };
    expect(buildCutFillFormContext([cut, fill], boqItems, [], []).sources.map(source => source.key)).toContain("progress:cut-a");
    expect(buildCutFillFormContext([fill, cut], boqItems, [], []).sources.map(source => source.key)).toContain("progress:cut-a");
  });

  it("adds back the submitted version's own consumption while editing", () => {
    const context = buildCutFillFormContext(
      [],
      [],
      [{ entryKey: "cut-a", boqItemId: 1, reusableQty: 10, consumedQty: 8, availableQty: 2 }],
      [],
      { editOriginalConsumptions: [{ fillEntryKey: "fill-a", sourceEntryKey: "cut-a", openingBalanceId: null, quantity: 5 }] },
    );
    expect(context.sources[0].availableQty).toBe(7);
  });

  it("blocks missing outcomes and incomplete reused-fill allocations only on final submit", () => {
    const boqItems = [
      { id: 1, description: "Roadway excavation in ordinary soil", unit: "CUM" },
      { id: 2, description: "Embankment with approved material", unit: "CUM" },
    ];
    const arrangements = [{ id: 9, arrangementType: "reused_excavated", sourceExcavationBoqItemId: 1 }];
    const rows = [
      { entryKey: "cut-a", boqItemId: 1, quantity: 10, materialOutcome: null, reusableQty: null },
      { entryKey: "fill-a", boqItemId: 2, quantity: 6, earthworkArrangementId: 9, allocations: [] },
    ];
    expect(validateCutFillForm(rows, boqItems, arrangements, [], false)).toEqual([]);
    expect(validateCutFillForm(rows, boqItems, arrangements, [], true)).toEqual([
      expect.stringContaining("record whether"),
      expect.stringContaining("allocations must equal 6"),
    ]);
    rows[0] = { ...rows[0], materialOutcome: "fully_reusable", reusableQty: 10 };
    rows[1] = { ...rows[1], allocations: [{ sourceKey: "progress:cut-a", quantity: 4 }] };
    expect(validateCutFillForm(rows, boqItems, arrangements, [], true)).toEqual([
      expect.stringContaining("allocations must equal 6"),
    ]);
    rows[1] = { ...rows[1], allocations: [{ sourceKey: "progress:cut-a", quantity: 6 }] };
    expect(validateCutFillForm(rows, boqItems, arrangements, [], true)).toEqual([]);
  });
});