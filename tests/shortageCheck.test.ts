import { describe, it, expect } from "vitest";
import { computeShortageRow, type ShortageMaterialDemand } from "@shared/planningEngine";

// Task #1240 — time-phased procurement shortage-check: month-by-month
// running balance netted against current stock + pending PI/IRN qty.

function demand(overrides: Partial<ShortageMaterialDemand> = {}): ShortageMaterialDemand {
  return {
    materialName: "Bitumen VG30",
    uom: "MT",
    totalQty: 300,
    monthlyQty: { 1: 100, 2: 100, 3: 100 },
    ...overrides,
  };
}

describe("computeShortageRow", () => {
  it("is adequate when current stock alone covers total demand", () => {
    const row = computeShortageRow(demand(), 400, true, 0, 1);
    expect(row.shortfall).toBe(0);
    expect(row.nearTermShortfall).toBe(0);
    expect(row.suggestion).toBe("adequate");
  });

  it("flags a raise_pi shortfall for a large unmatched material with no stock or pending procurement", () => {
    const row = computeShortageRow(demand({ totalQty: 1000, monthlyQty: { 1: 500, 2: 500 } }), 0, false, 0, 1);
    expect(row.shortfall).toBe(1000);
    expect(row.suggestion).toBe("raise_pi");
    expect(row.stockMatched).toBe(false);
  });

  it("flags raise_pi when there is no stock elsewhere, regardless of quantity", () => {
    // Old logic suggested raise_irn for <=500, new logic requires stock elsewhere
    const row = computeShortageRow(demand({ totalQty: 400, monthlyQty: { 1: 200, 2: 200 } }), 0, true, 0, 1, 0);
    expect(row.shortfall).toBe(400);
    expect(row.suggestion).toBe("raise_pi");
  });

  it("flags raise_irn when all shortfall is coverable by stock elsewhere", () => {
    // 400 shortfall, 500 stock elsewhere → full coverage via internal transfer
    const row = computeShortageRow(demand({ totalQty: 400, monthlyQty: { 1: 200, 2: 200 } }), 0, true, 0, 1, 500);
    expect(row.shortfall).toBe(400);
    expect(row.suggestion).toBe("raise_irn");
  });

  it("flags raise_both when stock elsewhere covers part of the shortfall", () => {
    // 300 shortfall, only 200 stock elsewhere → transfer 200, buy 100
    const row = computeShortageRow(demand(), 0, true, 0, 1, 200);
    expect(row.shortfall).toBe(300);
    expect(row.suggestion).toBe("raise_both");
  });

  it("nets pending PI/IRN procurement against demand before computing shortfall", () => {
    // 300 total demand, 250 pending procurement, 0 stock -> only 50 short
    const row = computeShortageRow(demand(), 0, true, 250, 1);
    expect(row.shortfall).toBe(50);
  });

  it("classifies as monitor when shortfall is small (<=10%) and not near-term", () => {
    // total 300, stock 280 -> shortfall 20 (~6.7%), all demand is in month 3 (future) relative to currentMonth=1
    const row = computeShortageRow(demand({ monthlyQty: { 3: 300 } }), 280, true, 0, 1);
    expect(row.shortfall).toBe(20);
    expect(row.nearTermShortfall).toBe(0);
    expect(row.suggestion).toBe("monitor");
  });

  it("draws down running balance month-by-month in chronological order (stock covers early months first)", () => {
    // stock=150 covers all of month 1 (100) + half of month 2 (50), month 2 short by 50, month 3 fully short (100)
    const row = computeShortageRow(demand(), 150, true, 0, 1);
    expect(row.monthlyBreakdown).toEqual([
      { month: 1, demand: 100, shortfall: 0, isCurrentOrPast: true },
      { month: 2, demand: 100, shortfall: 50, isCurrentOrPast: false },
      { month: 3, demand: 100, shortfall: 100, isCurrentOrPast: false },
    ]);
  });

  it("marks isCurrentOrPast correctly relative to currentMonth", () => {
    const row = computeShortageRow(demand(), 0, true, 0, 2);
    expect(row.monthlyBreakdown.filter(mb => mb.isCurrentOrPast).map(mb => mb.month)).toEqual([1, 2]);
    expect(row.monthlyBreakdown.filter(mb => !mb.isCurrentOrPast).map(mb => mb.month)).toEqual([3]);
  });

  it("nearTermShortfall only sums shortfalls in the current month or earlier", () => {
    // No stock/pending at all: month1 short 100 (current-or-past), month2 short 100 (future) at currentMonth=1
    const row = computeShortageRow(demand(), 0, true, 0, 1);
    expect(row.nearTermShortfall).toBe(100);
    expect(row.shortfall).toBe(300);
  });

  it("handles materials with no monthly demand gracefully (empty monthlyQty)", () => {
    const row = computeShortageRow(demand({ totalQty: 0, monthlyQty: {} }), 0, false, 0, 1);
    expect(row.monthlyBreakdown).toEqual([]);
    expect(row.shortfall).toBe(0);
    expect(row.suggestion).toBe("adequate");
  });

  it("preserves materialName and uom pass-through unchanged", () => {
    const row = computeShortageRow(demand({ materialName: "40mm Aggregate", uom: "CUM" }), 0, false, 0, 1);
    expect(row.materialName).toBe("40mm Aggregate");
    expect(row.uom).toBe("CUM");
  });
});
