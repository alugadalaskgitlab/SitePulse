import { describe, expect, it } from "vitest";
import { buildEquipmentComparison, type ComparisonInput } from "./dieselComparisonEquipment";

const input: ComparisonInput = {
  masters: [
    { id: 1, name: "Roller", registrationNumber: "A1" },
    { id: 2, name: "Roller", registrationNumber: "A2" },
    { id: 3, name: "Mixer", registrationNumber: null },
  ],
  requirements: [
    { id: 10, date: "2026-09-15", totalPlanned: 100, qtyPurchased: 100 },
    { id: 11, date: "2026-09-15", totalPlanned: 30, qtyPurchased: 50 },
    { id: 12, date: "2026-09-16", totalPlanned: 10, qtyPurchased: 10 },
  ],
  items: [
    { requirementId: 10, equipmentId: 1, equipmentName: "Roller", plannedQty: 100 },
    { requirementId: 11, equipmentId: 2, equipmentName: "Roller", plannedQty: 10 },
    { requirementId: 11, equipmentId: 3, equipmentName: "Mixer", plannedQty: 20 },
    { requirementId: 12, equipmentId: null, equipmentName: "not in master", plannedQty: 10 },
  ],
  usage: [{ date: "2026-09-15", equipmentId: 1, dieselIssued: 20 }, { date: "2026-09-16", equipmentId: 3, dieselIssued: 10 }],
  logs: [
    { date: "2026-09-15", equipmentId: 2, machine: "Roller", diesel: 20 },
    { date: "2026-09-15", equipmentId: null, machine: "Roller", diesel: 5 },
    { date: "2026-09-16", equipmentId: null, machine: "Mixer", diesel: 2 },
  ],
  dateWise: [
    { date: "2026-09-15", planned: 130, purchased: 150, actual: 45 },
    { date: "2026-09-16", planned: 10, purchased: 10, actual: 12 },
  ],
};
describe("diesel comparison equipment attribution", () => {
  it("reconciles day and range to unchanged date totals including unattributed purchases", () => {
    for (const [from, to, expected] of [
      ["2026-09-15", "2026-09-15", [130, 150, 45]],
      ["2026-09-15", "2026-09-16", [140, 160, 57]],
    ] as const) {
      const rows = buildEquipmentComparison(input, from, to);
      expect(rows.reduce((n, row) => n + row.planned, 0)).toBe(expected[0]);
      expect(rows.reduce((n, row) => n + row.purchased, 0)).toBe(expected[1]);
      expect(rows.reduce((n, row) => n + row.actual, 0)).toBe(expected[2]);
    }
  });
  it("retains distinct same-name equipment by ID; ambiguous names stay unassigned", () => {
    const rows = buildEquipmentComparison(input, "2026-09-15", "2026-09-15");
    expect(rows.find(r => r.equipmentId === 1)).toMatchObject({ purchased: 100, actual: 20, gapFlag: true });
    expect(rows.find(r => r.equipmentId === 2)).toMatchObject({ purchased: 0, actual: 20, gapFlag: false });
    expect(rows.find(r => r.equipmentId === null)).toMatchObject({ purchased: 50, actual: 5, gapFlag: false });
  });
  it("does not flag exact, negative, or sub-threshold purchase gaps", () => {
    const data: ComparisonInput = { ...input, requirements: [{ id: 10, date: "2026-09-15", totalPlanned: 100, qtyPurchased: 100 }], items: input.items.slice(0, 1), dateWise: [{ date: "2026-09-15", planned: 100, purchased: 100, actual: 0 }], logs: [] };
    for (const [issued, flag] of [[100, false], [105, false], [94, false], [80, true]] as const) {
      const rows = buildEquipmentComparison({ ...data, usage: [{ date: "2026-09-15", equipmentId: 1, dieselIssued: issued }], dateWise: [{ date: "2026-09-15", planned: 100, purchased: 100, actual: issued }] }, "2026-09-15", "2026-09-15");
      expect(rows.find(r => r.equipmentId === 1)?.gapFlag).toBe(flag);
    }
  });
});