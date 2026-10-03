import { describe, it, expect } from "vitest";
import { evaluateDprSubmitReadiness as evaluate } from "../shared/dprSubmitReadiness";
import { createDprRequestSchema } from "../shared/schema";

const progress = [{ boqItemId: 7, activity: "WMM", quantity: 10 }];
describe("BOQ-LINK-01 resource attribution advice", () => {
  it("adds row-addressable advice without blocking submission", () => {
    const result = evaluate({ progress, equipment: [{ machine: "DG", hoursWorked: 2 }], labour: [{ category: "Skilled", count: 2 }], materials: [{ material: "Aggregate", quantity: 1, uom: "MT" }] });
    expect(result.ready).toBe(true);
    expect(result.mandatory).toEqual([]);
    expect(result.advisories.filter(i => i.message.includes("not linked"))).toMatchObject([
      { section: "equipment", rowIndex: 0 }, { section: "labour", rowIndex: 0 }, { section: "materials", rowIndex: 0 },
    ]);
  });
  it("skips all attribution advice without BOQ-linked progress", () => {
    expect(evaluate({ progress: [{ noSiteWork: true, noSiteWorkDescription: "Rain" }], equipment: [{ machine: "DG", hoursWorked: 2 }] }).advisories).toEqual([]);
  });
  it("accepts General and partial assignments", () => {
    const result = evaluate({ progress, equipment: [
      { machine: "DG", hoursWorked: 8, resourceScope: "general" },
      { machine: "Roller", hoursWorked: 8, activitySegments: [{ startTime: "09:00", endTime: "10:00", hoursWorked: 1, boqItems: [{ boqItemId: 7 }] }] },
    ], labour: [{ category: "Watchman", count: 1, resourceScope: "general" }] });
    expect(result.advisories).toEqual([]);
  });
  it("honours segment precedence over a stale parent link", () => {
    const result = evaluate({ progress, equipment: [{ machine: "DG", hoursWorked: 8, boqItemId: 7, activitySegments: [{ startTime: "09:00", endTime: "10:00", hoursWorked: 1, boqItems: [] }] }] });
    expect(result.advisories[0].message).toContain("not linked");
  });
  it("recognizes unsaved editor segments without inventing times", () => {
    expect(evaluate({ progress, equipment: [{ machine: "Roller", startTime: "09:00", endTime: "17:00", activitySegments: [{ startTime: "09:00", endTime: "10:00", boqItems: [{ boqItemId: 7 }] }] }] }).advisories).toEqual([]);
  });
  it("preserves all resource scopes through request parsing", () => {
    const result = createDprRequestSchema.parse({ date: "2026-10-03", site: "TEST", engineer: "TEST", equipment: [{ machine: "DG", resourceScope: "general" }], labour: [{ category: "Skilled", count: 1, resourceScope: "general" }], materials: [{ type: "Issued", material: "Aggregate", resourceScope: "general" }] });
    for (const row of [...result.equipment!, ...result.labour!, ...result.materials!]) expect(row.resourceScope).toBe("general");
  });
});