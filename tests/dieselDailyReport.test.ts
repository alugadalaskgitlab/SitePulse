import { describe, expect, it } from "vitest";
import { buildDailyDieselEquipmentReport, buildEquipmentComparison, dailyDieselStatus, type ComparisonInput } from "../server/dieselComparisonEquipment";

const input: ComparisonInput = {
  masters: [{ id: 1, name: "Roller", registrationNumber: "A1" }, { id: 2, name: "Roller", registrationNumber: "A2" }, { id: 3, name: "Mixer", registrationNumber: null }],
  requirements: [
    { id: 1, date: "2026-09-15", totalPlanned: 100, qtyPurchased: 100 },
    { id: 2, date: "2026-09-16", totalPlanned: 60, qtyPurchased: 60 },
    { id: 3, date: "2026-09-16", totalPlanned: 5, qtyPurchased: 5 },
  ],
  items: [
    { requirementId: 1, equipmentId: 1, equipmentName: "Roller", plannedQty: 100 },
    { requirementId: 2, equipmentId: 1, equipmentName: "Roller", plannedQty: 30 },
    { requirementId: 2, equipmentId: 2, equipmentName: "Roller", plannedQty: 30 },
    { requirementId: 3, equipmentId: null, equipmentName: "  MIXER  ", plannedQty: 5 },
  ],
  usage: [{ date: "2026-09-15", equipmentId: 1, dieselIssued: 20 }],
  logs: [
    { date: "2026-09-15", equipmentId: 2, machine: "Wrong name ignored", diesel: 5 },
    { date: "2026-09-16", equipmentId: null, machine: "Roller", diesel: 10 },
    { date: "2026-09-16", equipmentId: null, machine: " mixer ", diesel: 0 },
    { date: "2026-09-17", equipmentId: null, machine: " a2 ", diesel: null },
  ],
  dateWise: [{ date: "2026-09-15", planned: 100, purchased: 100, actual: 25 }, { date: "2026-09-16", planned: 65, purchased: 65, actual: 10 }],
};
describe("DIESEL-05 daily aggregation", () => {
  it("retains all seven calendar groups including empty dates and reconciles unchanged comparison values", () => {
    const report = buildDailyDieselEquipmentReport(input, "2026-09-11", "2026-09-17");
    expect(report.groups.map(g => g.date)).toEqual(Array.from({ length: 7 }, (_, i) => `2026-09-${i + 11}`));
    expect(report.groups.slice(0, 4).every(g => g.rows.length === 0 && g.issueCount === 0)).toBe(true);
    expect(report.totals).toEqual({ planned: 165, purchased: 165, issued: 35, issueCount: 5 });
    for (const group of report.groups) {
      for (const old of buildEquipmentComparison(input, group.date, group.date)) {
        expect(group.rows.find(r => r.equipmentId === old.equipmentId)).toMatchObject({ planned: old.planned, purchased: old.purchased, issued: old.actual });
      }
    }
    expect(report.groups[5].rows.find(r => r.equipmentId === null)).toMatchObject({ purchased: 60, issued: 10, statusFlag: "Purchased not issued" });
  });
  it("filters every date and totals, omitting inactive equipment rows without dropping dates", () => {
    const result = buildDailyDieselEquipmentReport(input, "2026-09-11", "2026-09-17", 1);
    expect(result.groups).toHaveLength(7);
    expect(result.groups.flatMap(g => g.rows).every(r => r.equipmentId === 1)).toBe(true);
    expect(result.groups[0].rows).toEqual([]);
    expect(result.totals).toEqual({ planned: 130, purchased: 100, issued: 20, issueCount: 2 });
    expect(buildDailyDieselEquipmentReport(input, "2026-09-11", "2026-09-17", 999).totals).toEqual({ planned: 0, purchased: 0, issued: 0, issueCount: 0 });
  });
  it("uses ID priority, unique normalized names/registration, ambiguity and zero-diesel DPR/usage entries", () => {
    const result = buildDailyDieselEquipmentReport(input, "2026-09-15", "2026-09-17");
    expect(result.groups[0].rows.find(r => r.equipmentId === 2)?.loggedWork).toBe(true);
    expect(result.groups[1].rows.find(r => r.equipmentId === null)?.loggedWork).toBe(true);
    expect(result.groups[1].rows.find(r => r.equipmentId === 3)).toMatchObject({ loggedWork: true, issued: 0, statusFlag: "Worked but no diesel issued" });
    expect(result.groups[2].rows).toMatchObject([{ equipmentId: 2, loggedWork: true, issued: 0, statusFlag: "OK" }]);
    const usageOnly = buildDailyDieselEquipmentReport({ ...input, logs: [], usage: [{ date: "2026-09-17", equipmentId: 3, dieselIssued: 0 }] }, "2026-09-17", "2026-09-17");
    expect(usageOnly.groups[0].rows).toMatchObject([{ equipmentId: 3, loggedWork: true, statusFlag: "OK" }]);
  });
  it("groups across leap day and year boundary", () => {
    const empty = { ...input, requirements: [], items: [], usage: [], logs: [], dateWise: [] };
    expect(buildDailyDieselEquipmentReport(empty, "2024-02-28", "2024-03-01").groups.map(g => g.date)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    expect(buildDailyDieselEquipmentReport(empty, "2025-12-31", "2026-01-01").groups).toHaveLength(2);
  });
  it.each([
    [10, 0, 0, true, "Not purchased"],
    [10, 0, 10, false, "Not purchased"],
    [10, 100, 20, false, "Purchased not issued"],
    [0, 0, 10, false, "Issued but not logged"],
    [5, 5, 0, true, "Worked but no diesel issued"],
    [100, 100, 90, true, "OK"],
    [100, 100, 89.99, true, "Purchased not issued"],
    [10, 10, 5, true, "OK"],
    [10, 10, 4.99, true, "Purchased not issued"],
    [0, 0, 0, false, "OK"],
  ] as const)("status priority/strict threshold %s/%s/%s/%s → %s", (planned, purchased, issued, logged, status) => {
    expect(dailyDieselStatus(planned, purchased, issued, logged)).toBe(status);
  });
});