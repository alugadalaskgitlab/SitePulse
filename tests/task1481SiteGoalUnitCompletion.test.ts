import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PlanVsActualRow, BoqItemWithCategory } from "../shared/schema";
import { buildSiteGoalRows } from "../client/src/pages/FieldHome";
import {
  buildBoqItemEditPatch,
  initialBoqItemEditForm,
} from "../client/src/pages/BoqProjectDetail";

function row(overrides: Partial<PlanVsActualRow>): PlanVsActualRow {
  return {
    boqItemId: 1,
    itemCode: "1.01",
    description: "Surface work",
    unit: "Sqm",
    categoryName: null,
    currentQty: 10_000,
    totalPlanned: 4_000,
    totalActual: 4_800,
    percentComplete: 48,
    lastActivityDate: "2026-03-18",
    clientRate: 4.04,
    boqAmount: 40_400,
    plannedAmount: 16_160,
    actualAmount: 19_392,
    actualIncomplete: false,
    conversionWarnings: [],
    ...overrides,
  };
}

describe("task1481 Today's Site Goal nullable unit contract", () => {
  it("shows two eligible physical rows as 4,800 in the saved Sqm unit", () => {
    const [goal] = buildSiteGoalRows([row({ totalActual: 4_800, unit: "Sqm" })]);
    expect(goal.completed).toBe("4,800 Sqm");
    expect(goal.toDo).toBe("+800 Sqm ahead");
  });

  it("shows the same physical total converted for a genuine Ha contract item", () => {
    const [goal] = buildSiteGoalRows([row({
      unit: "Ha",
      currentQty: 1,
      totalPlanned: 0.4,
      totalActual: 0.48,
      percentComplete: 48,
    })]);
    expect(goal.planned).toBe("0.4 Ha");
    expect(goal.completed).toBe("0.48 Ha");
    expect(goal.toDo).toBe("+0.08 Ha ahead");
  });

  it("retains valid warning-bearing credit", () => {
    const [goal] = buildSiteGoalRows([row({
      totalActual: 4_800,
      conversionWarnings: ["Ignored stale conversion factor 0.0001"],
    })]);
    expect(goal.completed).toBe("4,800 Sqm");
    expect(goal.actualIncomplete).toBe(false);
    expect(goal.unitNote).toBe("Unit warning · completed value retained");
  });

  it("keeps a planned-zero unresolved row visible without a fabricated completion or balance", () => {
    const [goal] = buildSiteGoalRows([row({
      totalPlanned: 0,
      totalActual: null,
      percentComplete: null,
      actualAmount: null,
      actualIncomplete: true,
      conversionWarnings: ["CUM→MT requires an explicit factor"],
    })]);
    expect(goal.planned).toBe("0 Sqm");
    expect(goal.completed).toBe("Needs unit review");
    expect(goal.toDo).toBe("Needs unit review");
    expect(goal.unitNote).toContain("no balance calculated");
  });
});

describe("task1481 related consumers and BOQ editing", () => {
  it("preserves the saved raw contractual unit in the actual PATCH when clearing a factor", () => {
    const item = {
      description: "Surface work",
      unit: "SQ.M",
      canonicalUnit: "Sqm",
      itemCode: "1.01",
      clientRate: 4.04,
      currentQty: 10_000,
      workCategory: null,
      dprConversionFactor: 0.0001,
    } as BoqItemWithCategory;
    const form = initialBoqItemEditForm(item);
    expect(form.unit).toBe("SQ.M");
    form.dprConversionFactor = "";
    expect(buildBoqItemEditPatch(form, item.currentQty)).toMatchObject({
      unit: "SQ.M",
      dprConversionFactor: null,
    });
  });

  it("uses the shared nullable contract and blocks unresolved productivity", () => {
    const source = readFileSync("client/src/pages/WorkDemand.tsx", "utf8");
    expect(source).toContain("import type { BoqProject, PlanVsActualRow }");
    expect(source).toContain("Map<number, number | null>");
    expect(source).toContain("actualQtyCompleted != null && actualEquipHours > 0");
    expect(source).toContain("Needs unit review");
    expect(source).not.toContain("interface PlanVsActualRowLite");
  });

  it("explains that the goal plan is cumulative through the current month", () => {
    const source = readFileSync("client/src/pages/FieldHome.tsx", "utf8");
    expect(source).toContain("Cumulative programme plan through the current month vs completed to date");
  });
});