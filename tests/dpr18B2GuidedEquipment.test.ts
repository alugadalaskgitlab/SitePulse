import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildGuidedEquipmentPayload, splitGuidedEquipmentRow } from "../shared/guidedEquipment";
import { withNewEquipmentWorkingDefault } from "../shared/equipmentUsage";

const source = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");

describe("DPR18 B2 Guided grouped machine day", () => {
  it("uses the four B1 slots, with exactly one draft-only stoppage editor", () => {
    expect(source).toContain("equipmentPickerSlot={equipmentPickerSlot}");
    expect(source).toContain("ownerTypeSlot={ownerTypeSlot}");
    expect(source).toContain("dieselSourceSlot={dieselSourceSlot}");
    expect(source).toContain("stoppageSlot={<BreakdownStoppageEditor");
    expect(source.match(/<BreakdownStoppageEditor/g)).toHaveLength(1);
    expect(source).toContain("draftOnly");
    expect(source).toContain("value={(pt.breakdowns ?? []) as StagedBreakdown[]}");
    expect(source).toContain("activitySegments,");
    expect(source).toContain("workAssignmentEdited: true");
    expect(source).toContain("enableTankContinuity={pt.dieselSource === \"plant_stock\"}");
    expect(source).toContain("!isVisibleEquipmentRow(");
  });

  it("preserves all untouched fields and explicitly stored statuses across Guided saves", () => {
    for (const status of [null, "idle_no_work", "idle_no_operator", "breakdown", "working"] as const) {
      const hydrated = splitGuidedEquipmentRow({
        id: 22, machine: "Roller", equipmentId: 7, usageStatus: status,
        plantUsageId: 14, dieselSource: "plant_stock", openingDiesel: 18,
        breakdowns: [{ id: 92, fromTime: "09:00", toTime: "09:30" }],
        activitySegments: [{ boqItemId: 42, startTime: "08:00", endTime: "16:00" }],
      });
      const payload = buildGuidedEquipmentPayload(hydrated);
      expect(payload).toMatchObject({
        persistedId: 22, usageStatus: status, plantUsageId: 14, equipmentId: 7,
        openingDiesel: 18, breakdowns: [{ id: 92 }],
      });
      expect(payload).not.toHaveProperty("newlyCreatedInGuided");
    }
  });

  it("only defaults identified explicitly new nonlinked rows", () => {
    const blank = { equipmentId: null, machine: "", usageStatus: undefined };
    expect(withNewEquipmentWorkingDefault(blank, { isNew: true }).usageStatus).toBeUndefined();
    expect(withNewEquipmentWorkingDefault({ ...blank, machine: "Tanker" }, { isNew: true }).usageStatus).toBe("working");
    for (const candidate of [
      { ...blank, machine: "Tanker", usageStatus: null },
      { ...blank, machine: "Tanker", plantUsageId: 100 },
      { ...blank, machine: "Tanker", persistedId: 100 },
    ]) {
      expect(withNewEquipmentWorkingDefault(candidate, { isNew: false }).usageStatus).toBe(candidate.usageStatus);
    }
    expect(withNewEquipmentWorkingDefault({ ...blank, machine: "Tanker", plantUsageId: 100 }, { isNew: true }).usageStatus).toBeUndefined();
    expect(source).toContain("newlyCreatedInGuided: true");
    expect(source).toContain("r.newlyCreatedInGuided && nextPt.plantUsageId == null");
    expect(source).not.toContain("r.newlyCreatedInGuided && !nextPt.startTime");
    expect(source).not.toContain("withEquipmentCreationStartTime");
    expect(source).toContain('passthrough: newResourceRow({ startTime: "", endTime: "", usageStatus: "working" })');
    expect(source).toContain("if (open && r.workingDefaultedInGuided) delete nextPt.usageStatus");
    expect(source).toContain('hasOwnProperty.call(patch, "usageStatus")');
    expect(source).toContain("equipment: equipment.map(({ newlyCreatedInGuided, workingDefaultedInGuided, ...row }) => row)");
  });
});