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
    expect(compact).toContain("Physical tank balance confirmed");
    expect(compact).toContain("Actual consumed");
    expect(compact).toContain("Variance");
    expect(compact).toContain("Actual rate");
    expect(plant).toContain("computeEquipmentFuelSummary");
    expect(plant).toContain("const consumed = fuel.actualConsumed");
  });

  it("keeps allocation rows simple, chains time defaults, and hides programme bars unless ambiguous", () => {
    expect(allocation).toContain("previous?.endTime");
    expect(allocation).toContain("parentStartTime");
    expect(allocation).toContain("parentEndTime");
    expect(allocation).toContain('const needsBarPicker = bars.length > 1');
    expect(allocation).toContain("bars.length === 1");
    expect(allocation).not.toContain(">Task<");
  });

  it("shows the same parent equipment summary in both submitted DPR views", () => {
    expect(submitted).toContain("<DprEquipmentCompact");
    expect(report).toContain("<DprEquipmentCompact");
    expect(compact).toContain("<EquipmentActivityAllocationEditor");
    expect(compact).toContain("editable={editable}");
  });
});