import { describe, expect, it } from "vitest";
import { withNewEquipmentWorkingDefault } from "../shared/equipmentUsage";
import {
  buildGuidedEquipmentPayload,
  newGuidedEquipmentRowForCreation,
  splitGuidedEquipmentRow,
} from "../shared/guidedEquipment";

describe("DPR-18 B2: new equipment daily-status default", () => {
  it("sets working only for a genuinely new identified master or unlisted machine", () => {
    for (const row of [
      { equipmentId: 12, machine: "", usageStatus: null },
      { equipmentId: null, machine: "Excavator", usageStatus: null },
      { equipmentId: null, machine: "", vehicleNo: "MH12AB1234" },
    ]) {
      const result = withNewEquipmentWorkingDefault(row, { isNew: true });
      expect(result).toEqual({ ...row, usageStatus: "working" });
      expect(result).not.toBe(row);
    }
  });

  it("does not turn blank form placeholders, operator prompts, or default labels into working days", () => {
    for (const row of [
      { machine: "", vehicleNo: "", equipmentId: null, usageStatus: null },
      { machine: " Operating ", vehicleNo: " ", operator: "Driver", startTime: "09:00", diesel: 12 },
      { machine: "time_meter", vehicleNo: "", equipmentId: 0 },
      { machine: " ", vehicleNo: " ", equipmentId: -1, usageStatusReason: "Retained note" },
    ]) {
      expect(withNewEquipmentWorkingDefault(row, { isNew: true })).toBe(row);
    }
  });

  it("never fills existing hydrated, persisted, or draft null statuses", () => {
    const hydrated = { id: 44, machine: "Roller", usageStatus: null };
    const draft = { machine: "Roller", usageStatus: null, usageStatusReason: "Historical note" };
    expect(withNewEquipmentWorkingDefault(hydrated, { isNew: false })).toBe(hydrated);
    expect(withNewEquipmentWorkingDefault(hydrated, { isNew: true })).toBe(hydrated);
    expect(withNewEquipmentWorkingDefault(draft, { isNew: false })).toBe(draft);
    expect(withNewEquipmentWorkingDefault({ persistedId: 45, equipmentId: 3, usageStatus: null }, { isNew: true }).usageStatus).toBeNull();
  });

  it("keeps linked Plant Usage status, including null, unchanged", () => {
    for (const status of [null, "working", "idle_no_operator", "breakdown"]) {
      const linked = { machine: "Paver", equipmentId: 2, plantUsageId: 93, usageStatus: status };
      expect(withNewEquipmentWorkingDefault(linked, { isNew: true })).toBe(linked);
    }
  });

  it("preserves every explicit status and reason without normalizing them", () => {
    for (const status of ["working", "idle_no_work", "idle_no_operator", "breakdown", ""]) {
      const row = { machine: "Roller", usageStatus: status, usageStatusReason: "Existing reason" };
      expect(withNewEquipmentWorkingDefault(row, { isNew: true })).toBe(row);
    }
    const fresh = { machine: "Roller", usageStatus: null, usageStatusReason: "Keep this reason", task: "Compaction" };
    expect(withNewEquipmentWorkingDefault(fresh, { isNew: true })).toEqual({
      ...fresh, usageStatus: "working",
    });
    expect(fresh.usageStatus).toBeNull();
  });

  it("can be applied to Guided's creation passthrough without persisting provenance", () => {
    const guided = newGuidedEquipmentRowForCreation();
    guided.machine = "Unlisted grader";
    guided.passthrough = withNewEquipmentWorkingDefault(
      { ...guided.passthrough, machine: guided.machine, vehicleNo: guided.vehicleNo },
      { isNew: true },
    );
    const payload = buildGuidedEquipmentPayload(guided);
    expect(payload.usageStatus).toBe("working");
    expect(payload).not.toHaveProperty("isNew");

    const historical = splitGuidedEquipmentRow({
      id: 18, machine: "Unlisted grader", usageStatus: null, usageStatusReason: "Historic",
    });
    const unchanged = withNewEquipmentWorkingDefault(
      { ...historical.passthrough, machine: historical.machine, persistedId: historical.persistedId },
      { isNew: false },
    );
    expect(unchanged.usageStatus).toBeNull();
    expect(buildGuidedEquipmentPayload(historical).usageStatus).toBeNull();
  });
});