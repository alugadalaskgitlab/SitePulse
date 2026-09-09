import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("equipment usage form reorganisation contracts", () => {
  const guided = read("client/src/pages/GuidedDpr.tsx");
  const detailed = read("client/src/pages/SiteEntry.tsx");
  const edit = read("client/src/pages/SiteEdit.tsx");
  const compact = read("client/src/components/DprEquipmentCompact.tsx");
  const allocation = read("client/src/components/EquipmentActivityAllocationEditor.tsx");
  const submitted = read("client/src/pages/DprDetails.tsx");
  const report = read("client/src/pages/SiteReport.tsx");
  const plant = read("client/src/pages/PlantEquipmentUsage.tsx");

  it("uses creation-only local-time defaults without changing hydration helpers", () => {
    expect(guided).toContain("newGuidedEquipmentRowForCreation()");
    expect(guided).toContain("...newGuidedEquipmentRow(), ...e");
    expect(detailed).toContain("withEquipmentCreationStartTime(");
    expect(edit).toContain("withEquipmentCreationStartTime(");
    expect(edit).toContain("setEquipment(draft.equipment)");
  });

  it("keeps the canonical continuity lookup in Guided, Detailed and Edit DPR", () => {
    for (const source of [guided, detailed, edit]) {
      expect(source).toContain("fetchLatestPriorClosing(");
      expect(source).toContain("{ inclusive: true }");
    }
  });

  it("renders true fuel facts from one shared formula and labels physical confirmation clearly", () => {
    expect(compact).toContain("computeEquipmentFuelSummary");
    expect(compact).toContain("Physical Tank Balance Confirmed");
    expect(compact).toContain("Actual Consumed");
    expect(compact).toContain("Variance");
    expect(compact).toContain("Actual Consumption Rate");
    expect(plant).toContain("computeEquipmentFuelSummary");
    expect(plant).toContain("const consumed = fuel.actualConsumed");
  });

  it("renders physical activity segments once with one or more BOQ items", () => {
    expect(allocation).toContain("previous?.endTime");
    expect(allocation).toContain("parentStartTime");
    expect(allocation).toContain("parentEndTime");
    expect(allocation).toContain("bars.length === 1");
    expect(allocation).not.toContain("Which work reach?");
    expect(allocation).not.toContain("Choose the work reach");
    expect(allocation).not.toContain("workReachName");
    expect(allocation).not.toContain("Programme distinction");
    expect(allocation).toContain("formatEquipmentAllocationDuration");
    expect(allocation).not.toContain("Add another activity");
    expect(allocation).toContain("Assign Item");
    expect(allocation).toContain("Add Item");
    expect(allocation).toContain("Add BOQ Item");
    expect(allocation).toContain("Segment Duration");
    expect(allocation).toContain("boqItems:");
    expect(allocation).toContain("Work Assignment");
    expect(allocation).toContain("BOQ Item");
    expect(allocation).not.toContain(">Task<");
    expect(allocation).not.toContain("calendar-picker-indicator");
    expect(compact).toContain("row.activitySegments");
    expect(compact).toContain("row.activityAllocations");
    expect(compact).toContain("onChange({ activitySegments, activityAllocations: undefined })");
    for (const source of [guided, detailed, edit, submitted, report]) {
      expect(source).toContain("programmeBarId");
    }
    expect(guided).toContain("programmeBars={entries.flatMap");
    expect(detailed).toContain("programmeBars={progress.flatMap");
    expect(edit).toContain("programmeBars={progress.flatMap");
  });

  it("shows separate readable usage and fuel performance blocks", () => {
    expect(compact).toContain("Meter Working Hours");
    expect(compact).toContain("Clock Duration");
    expect(compact).toContain("Usage Summary");
    expect(compact).toContain("Fuel Performance");
    expect(compact).not.toContain('label={preview.totalKm != null ? "Distance" : "Operating time"}');
    expect(allocation).toContain("Assignment validation uses the machine-day Clock Duration");
    expect(compact).not.toContain("hoursWorked: preview.basis");
    expect(guided).not.toContain("input-eq-task-");
    expect(detailed).not.toContain("input-equipment-task-");
    expect(edit).not.toContain("input-equipment-task-");
    expect(allocation).not.toMatch(/text-\[(?:9|10)px\]/);
  });

  it("shows the same parent equipment summary in both submitted DPR views", () => {
    expect(submitted).toContain("<DprEquipmentCompact");
    expect(report).toContain("<DprEquipmentCompact");
    expect(compact).toContain("<EquipmentActivityAllocationEditor");
    expect(compact).toContain("editable={editable}");
  });
});