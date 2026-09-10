import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_EQUIPMENT_PERFORMANCE_FILTERS,
  EQUIPMENT_PERFORMANCE_FILTER_KEYS,
  equipmentPerformanceUrl,
  equipmentSourceHref,
  hasEquipmentPerformanceFilters,
  parseEquipmentPerformanceFilters,
} from "../client/src/lib/equipmentPerformanceNav";
import { resolveReturnTo } from "../client/src/lib/progressReportNav";

describe("Fleet Performance URL and source navigation", () => {
  const filters = {
    dateFrom: "2026-01-02",
    dateTo: "2026-02-03",
    projectId: "17",
    scope: "site",
    ownership: "hired",
    equipmentType: "Excavator",
    equipmentId: "91",
  };

  it("round-trips all seven filters and selected machine", () => {
    expect(EQUIPMENT_PERFORMANCE_FILTER_KEYS).toHaveLength(7);
    const url = equipmentPerformanceUrl(filters, "master:91");
    expect(parseEquipmentPerformanceFilters(url.split("?")[1])).toEqual(filters);
    expect(new URLSearchParams(url.split("?")[1]).get("machine")).toBe("master:91");
  });

  it("allows URL filters to be detected and keeps defaults without them", () => {
    expect(hasEquipmentPerformanceFilters("?machine=x")).toBe(false);
    expect(parseEquipmentPerformanceFilters("?machine=x")).toEqual(EMPTY_EQUIPMENT_PERFORMANCE_FILTERS);
    expect(hasEquipmentPerformanceFilters("?scope=plant")).toBe(true);
  });

  it("DPR source links carry the exact Fleet return URL", () => {
    const origin = equipmentPerformanceUrl(filters, "master:91");
    const href = equipmentSourceHref(
      { source: "dpr_log", date: "2026-01-10", reference: { dprId: 42, plantUsageId: null } },
      origin,
    )!;
    expect(href.startsWith("/site/edit/42?returnTo=")).toBe(true);
    expect(resolveReturnTo(`?${href.split("?")[1]}`, "/site/dashboard")).toBe(origin);
  });

  it("links plant usage to its source register and retains the Fleet return", () => {
    const origin = equipmentPerformanceUrl(filters);
    const href = equipmentSourceHref(
      { source: "plant_usage", date: "2026-01-10", reference: { dprId: null, plantUsageId: 700 } },
      origin,
    )!;
    expect(href).toContain("/plant/equipment-usage?dateFrom=2026-01-10&dateTo=2026-01-10&returnTo=");
    expect(resolveReturnTo(`?${href.split("?")[1]}`, "/equipment/hub")).toBe(origin);
  });

  it("does not invent links for missing or mismatched source references", () => {
    expect(equipmentSourceHref(
      { source: "dpr_log", reference: { dprId: null, plantUsageId: 700 } },
      "/reports/equipment-performance",
    )).toBeNull();
  });

  it("unsafe return paths remain rejected by the shared resolver", () => {
    expect(resolveReturnTo("?returnTo=%2F%2Fevil.example", "/site/dashboard")).toBe("/site/dashboard");
    expect(resolveReturnTo("?returnTo=%2F%5Cevil.example", "/site/dashboard")).toBe("/site/dashboard");
    expect(resolveReturnTo("?returnTo=%2Fjavascript%3Aalert(1)", "/site/dashboard")).toBe("/site/dashboard");
  });

  it("the explicit Reset clears persisted filters rather than only changing UI state", () => {
    const source = readFileSync("client/src/pages/EquipmentPerformanceReport.tsx", "utf8");
    expect(source).toContain("usePersistedFilters(");
    expect(source).toMatch(/const reset = \(\) => \{[\s\S]*?resetPersistedFilters\(\)/);
    expect(source).toMatch(/onClick=\{reset\}/);
  });

  it("both ledger surfaces use the generic source helper", () => {
    const source = readFileSync("client/src/pages/EquipmentPerformanceReport.tsx", "utf8");
    expect(source.match(/equipmentSourceHref\(e, returnTo\)/g)).toHaveLength(2);
  });
});