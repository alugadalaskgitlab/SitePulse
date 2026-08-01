import { describe, it, expect } from "vitest";
import { computeShortageRow, type ShortageMaterialDemand, type ShortageRowOpts } from "@shared/planningEngine";

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

// ──────────────────────────────────────────────────────────────────────────────
// v2 logic — opts-based horizon-aware paths (Instruction 017)
// ──────────────────────────────────────────────────────────────────────────────

function demandV2(overrides: Partial<ShortageMaterialDemand> = {}): ShortageMaterialDemand {
  return {
    materialName: "Bitumen VG30",
    uom: "MT",
    totalQty: 300,
    monthlyQty: { 1: 100, 2: 100, 3: 100 },
    ...overrides,
  };
}

// Base opts — all optional fields from ShortageRowOpts, no extras.
const baseOpts: ShortageRowOpts = {
  hlcRecordedStock: 0,
  stockWithOtherParties: 0,
  confirmedIncomingPurchase: 0,
  confirmedInternalIncoming: 0,
  horizonMonthIndex: 3,         // cover all 3 months
  materialMappingUnresolved: false,
  projectStartDate: "2025-01-01",
  isProgrammed: true,
};

describe("computeShortageRow v2 (opts param)", () => {
  it("flags resolve_mapping when materialMappingUnresolved = true", () => {
    const row = computeShortageRow(demandV2(), 0, false, 0, 1, 0, {
      ...baseOpts, materialMappingUnresolved: true,
    });
    expect(row.materialMappingUnresolved).toBe(true);
    expect(row.suggestion).toBe("resolve_mapping");
    // actionableShortfall is still computed (demand - coverage) even when unresolved;
    // the route uses materialMappingUnresolved to hide those numbers in the UI
    expect(typeof row.actionableShortfall).toBe("number");
  });

  it("flags adequate_selected_horizon when HLC stock covers demand to horizon", () => {
    // 200 hlcRecordedStock covers the 200 demand in months 1–2 (horizonMonthIndex=2)
    const row = computeShortageRow(demandV2(), 0, true, 0, 1, 0, {
      ...baseOpts,
      hlcRecordedStock: 200,
      horizonMonthIndex: 2,
    });
    expect(row.suggestion).toBe("adequate_selected_horizon");
    expect(row.actionableShortfall).toBe(0);
    expect(row.demandUpToSelectedDate).toBe(200);
    expect(row.futureRequirement).toBe(100);   // month 3 demand falls beyond horizon
  });

  it("flags review_hlc_stock when HLC stock is partial but non-zero", () => {
    // 50 hlcRecordedStock, 200 demand to horizon, no incoming → partial coverage
    const row = computeShortageRow(demandV2(), 0, true, 0, 1, 0, {
      ...baseOpts,
      hlcRecordedStock: 50,
      horizonMonthIndex: 2,
    });
    expect(row.suggestion).toBe("review_hlc_stock");
    expect(row.actionableShortfall).toBeGreaterThan(0);
    expect(row.hlcRecordedStock).toBe(50);
  });

  it("flags raise_pi when HLC stock = 0 and no confirmed incoming", () => {
    const row = computeShortageRow(demandV2(), 0, true, 0, 1, 0, {
      ...baseOpts,
      hlcRecordedStock: 0,
      horizonMonthIndex: 2,
    });
    expect(row.suggestion).toBe("raise_pi");
    expect(row.actionableShortfall).toBe(200);
  });

  it("nets confirmedIncomingPurchase against demandUpToSelectedDate", () => {
    // 200 demand to horizon, 150 confirmed incoming → only 50 actionable
    const row = computeShortageRow(demandV2(), 0, true, 0, 1, 0, {
      ...baseOpts,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 150,
      horizonMonthIndex: 2,
    });
    expect(row.actionableShortfall).toBe(50);
    expect(row.confirmedIncomingPurchase).toBe(150);
  });

  it("demandUpToSelectedDate accumulates only months ≤ horizonMonthIndex", () => {
    // monthlyQty: {1:100, 2:100, 3:100} — horizon at month 2 → demand = 200
    const row = computeShortageRow(demandV2(), 0, true, 0, 1, 0, {
      ...baseOpts,
      horizonMonthIndex: 2,
    });
    expect(row.demandUpToSelectedDate).toBe(200);
    expect(row.futureRequirement).toBe(100);
  });

  it("entire programme horizon (horizonMonthIndex = maxMonth) gives demandUpToSelectedDate = totalDemand", () => {
    const row = computeShortageRow(demandV2(), 0, true, 0, 1, 0, {
      ...baseOpts,
      horizonMonthIndex: 3,
    });
    expect(row.demandUpToSelectedDate).toBe(300);
    expect(row.futureRequirement).toBe(0);
  });

  it("requiredByDate is derived from projectStartDate + first-shortfall month offset", () => {
    // Pass currentStock=200 (positional arg) so v1 breakdown covers months 1+2
    // (running balance: start 200 → month1 -100 = 100 → month2 -100 = 0 → month3 shortfall).
    // First shortfall month = 3; monthIndexToDate(3, "2025-01-01") ≈ "2025-03-0x"
    const row = computeShortageRow(demandV2(), 200, true, 0, 1, 0, {
      ...baseOpts,
      projectStartDate: "2025-01-01",
      horizonMonthIndex: 3,
    });
    expect(row.requiredByDate).toBeDefined();
    expect(row.requiredByDate).toMatch(/^2025-03/);
  });

  it("isProgrammed is passed through to the result", () => {
    const row = computeShortageRow(demandV2(), 0, false, 0, 1, 0, {
      ...baseOpts, isProgrammed: false,
    });
    expect(row.isProgrammed).toBe(false);
  });
});
