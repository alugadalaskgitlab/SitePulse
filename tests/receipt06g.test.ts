/**
 * Batch 06G — rapid repeat-trip + daily-allocation visibility tests.
 * Covers the shared seams: strip visibility rule inputs (receiptRelevanceForType),
 * today's operational fulfilment resolution (findDailyFulfilmentForItem),
 * daily-allocation display precedence, mixed-UoM aggregation, and the
 * timestamp display formatter (never raw ISO, never fabricated).
 */
import { describe, it, expect } from "vitest";
import {
  receiptRelevanceForType,
  aggregateReceived,
} from "../shared/materialReceiptSummary";
import { findDailyFulfilmentForItem } from "../shared/requirementFulfilment";
import { fmtDateTime, fmtTimeOnly } from "../client/src/lib/dateTimeDisplay";

describe("strip visibility inputs (06G §2)", () => {
  it("no arrangement (undefined type) is receipt-relevant — strip must NOT hide", () => {
    expect(receiptRelevanceForType(null)).not.toBe("none");
    expect(receiptRelevanceForType(undefined)).not.toBe("none");
  });
  it("reused excavated material remains receipt-irrelevant (still suppressed)", () => {
    expect(receiptRelevanceForType("reused_excavated")).toBe("none");
  });
  it("vendor-delivered arrangements are primary receipt evidence", () => {
    expect(receiptRelevanceForType("vendor_material_delivered")).toBe("primary");
  });
});

describe("findDailyFulfilmentForItem (06G §3-4)", () => {
  const reqRow = (boqItemId: number | null, materials: any[], materialItems: any[]) => ({
    plannedWork: { boqItemId },
    materials,
    allocationStatus: { materialItems },
  });

  it("returns the matching item's fulfilment entry (lineKey matching)", () => {
    const rows = [
      reqRow(11, [{ materialName: "GSB", lineKey: "rl_x" }], [{ lineKey: "rl_x", index: 0, fulfilmentType: "arrangement", arrangementId: 4, agencyNameSnapshot: "MARSIMULU" }]),
    ];
    const m = findDailyFulfilmentForItem(rows, 11);
    expect(m?.entry.arrangementId).toBe(4);
    expect(m?.materialName).toBe("GSB");
  });

  it("ignores requirements for other BOQ items", () => {
    const rows = [
      reqRow(99, [{ materialName: "Soil", lineKey: "rl_a" }], [{ lineKey: "rl_a", index: 0, fulfilmentType: "hlc" }]),
    ];
    expect(findDailyFulfilmentForItem(rows, 11)).toBeNull();
  });

  it("ignores entries without a fulfilment decision (status-only allocations)", () => {
    const rows = [
      reqRow(11, [{ materialName: "Soil", lineKey: "rl_a" }], [{ lineKey: "rl_a", index: 0, status: "arranged" }]),
    ];
    expect(findDailyFulfilmentForItem(rows, 11)).toBeNull();
  });

  it("legacy index-keyed entries still resolve", () => {
    const rows = [
      reqRow(11, [{ materialName: "Soil" }], [{ index: 0, fulfilmentType: "other_agency", agencyNameSnapshot: "ABC" }]),
    ];
    const m = findDailyFulfilmentForItem(rows, 11);
    expect(m?.entry.fulfilmentType).toBe("other_agency");
    expect(m?.entry.agencyNameSnapshot).toBe("ABC");
  });

  it("null/empty inputs → null (HLC default downstream, never an error)", () => {
    expect(findDailyFulfilmentForItem(null, 11)).toBeNull();
    expect(findDailyFulfilmentForItem([], 11)).toBeNull();
    expect(findDailyFulfilmentForItem([reqRow(11, [], [])], null)).toBeNull();
  });
});

describe("running totals (06G §12) — mixed UoMs never summed", () => {
  it("same UoM sums; trip count correct", () => {
    const r = aggregateReceived([
      { quantity: 14, uom: "Cum" }, { quantity: 14, uom: "Cum" },
    ] as any);
    expect(r.receivedQty).toBe(28);
    expect(r.tripCount).toBe(2);
    expect(r.mixedUoms).toBe(false);
  });
  it("mixed UoMs stay separate", () => {
    const r = aggregateReceived([
      { quantity: 112, uom: "Cum" }, { quantity: 25, uom: "MT" },
    ] as any);
    expect(r.mixedUoms).toBe(true);
    const byUom = Object.fromEntries(r.byUom.map((x: any) => [x.uom, x.qty]));
    expect(byUom["Cum"]).toBe(112);
    expect(byUom["MT"]).toBe(25);
  });
});

describe("fmtDateTime (06G §24) — local display, never fabricated", () => {
  it("formats a stored timestamp as local '<d MMM yyyy> · <h:mm AM/PM>'", () => {
    const s = fmtDateTime(new Date(2026, 7, 12, 8, 48)); // local 12 Aug 2026 8:48
    expect(s).toBe("12 Aug 2026 · 8:48 AM");
  });
  it("returns null for missing/invalid values (legacy records omit gracefully)", () => {
    expect(fmtDateTime(null)).toBeNull();
    expect(fmtDateTime(undefined)).toBeNull();
    expect(fmtDateTime("")).toBeNull();
    expect(fmtDateTime("not-a-date")).toBeNull();
  });
  it("never returns a raw ISO string", () => {
    const s = fmtDateTime("2026-08-12T03:18:00.000Z");
    expect(s).not.toMatch(/T\d{2}:\d{2}/);
    expect(s).toMatch(/·/);
  });
  it("fmtTimeOnly renders compact time", () => {
    expect(fmtTimeOnly(new Date(2026, 7, 12, 9, 20))).toBe("9:20 AM");
    expect(fmtTimeOnly(null)).toBeNull();
  });
});
