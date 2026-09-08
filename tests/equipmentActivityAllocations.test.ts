import { describe, expect, it } from "vitest";
import {
  EquipmentActivityAllocationError,
  calculateEquipmentAllocationHours,
  resolveEquipmentAllocationParentHours,
  resolveEquipmentBoqHours,
  validateEquipmentActivityAllocations,
} from "../shared/equipmentActivityAllocations";

const allocation = (
  boqItemId: number,
  startTime: string,
  endTime: string,
  programmeBarId: number | null = null,
) => ({ boqItemId, startTime, endTime, programmeBarId });

describe("equipment activity allocations", () => {
  it("A: attributes one eight-hour equipment day to one BOQ activity", () => {
    const result = validateEquipmentActivityAllocations([allocation(11, "08:00", "16:00")], 8);
    expect(result.allocations).toEqual([{
      boqItemId: 11,
      programmeBarId: null,
      startTime: "08:00",
      endTime: "16:00",
      hoursWorked: 8,
    }]);
    expect(result.allocatedHours).toBe(8);
    expect(result.unallocatedHours).toBe(0);
  });

  it("B: splits one parent across two activities without changing the parent total", () => {
    const parent = { hoursWorked: 8, diesel: 42, plantUsageId: 901 };
    const result = validateEquipmentActivityAllocations([
      allocation(11, "08:00", "12:00"),
      allocation(22, "12:00", "16:00"),
    ], parent.hoursWorked);
    expect(result.allocations.map(row => [row.boqItemId, row.hoursWorked])).toEqual([[11, 4], [22, 4]]);
    expect(result.allocations.reduce((sum, row) => sum + row.hoursWorked, 0)).toBe(parent.hoursWorked);
    expect(parent).toEqual({ hoursWorked: 8, diesel: 42, plantUsageId: 901 });
  });

  it("C: aggregates three child activities correctly", () => {
    const result = validateEquipmentActivityAllocations([
      allocation(11, "08:00", "10:30"),
      allocation(22, "10:30", "13:00"),
      allocation(33, "14:00", "16:00"),
    ], 8);
    expect(result.allocations.map(row => row.hoursWorked)).toEqual([2.5, 2.5, 2]);
    expect(result.allocatedHours).toBe(7);
    expect(result.unallocatedHours).toBe(1);
  });

  it("D: blocks overlapping and duplicate time segments", () => {
    expect(() => validateEquipmentActivityAllocations([
      allocation(11, "08:00", "12:00"),
      allocation(22, "11:00", "14:00"),
    ], 8)).toThrow(/cannot overlap/i);
    expect(() => validateEquipmentActivityAllocations([
      allocation(11, "08:00", "12:00"),
      allocation(22, "08:00", "12:00"),
    ], 8)).toThrow(/duplicate/i);
  });

  it("E: blocks allocations that exceed parent operating hours", () => {
    expect(() => validateEquipmentActivityAllocations([
      allocation(11, "08:00", "13:00"),
      allocation(22, "13:00", "17:00"),
    ], 8)).toThrow(/exceeds parent operating time/i);
  });

  it("F: allows partial allocation and reports unallocated time", () => {
    const result = validateEquipmentActivityAllocations([
      allocation(11, "08:00", "14:00"),
    ], 8);
    expect(result.allocatedHours).toBe(6);
    expect(result.unallocatedHours).toBe(2);
  });

  it("G: preserves legacy parent BOQ attribution when children are absent", () => {
    expect(resolveEquipmentBoqHours({
      boqItemId: 11,
      hoursWorked: 8,
      activityAllocations: [],
    })).toEqual([{
      boqItemId: 11,
      programmeBarId: null,
      hoursWorked: 8,
      source: "legacy_parent",
    }]);
  });

  it("H: treats children as authoritative and never adds the parent again", () => {
    const slices = resolveEquipmentBoqHours({
      boqItemId: 11,
      hoursWorked: 8,
      activityAllocations: [
        { boqItemId: 11, programmeBarId: 101, hoursWorked: 4 },
        { boqItemId: 22, programmeBarId: 202, hoursWorked: 4 },
      ],
    });
    expect(slices).toHaveLength(2);
    expect(slices.reduce((sum, row) => sum + row.hoursWorked, 0)).toBe(8);
    expect(slices.every(row => row.source === "activity_allocation")).toBe(true);
  });

  it("I: does not fabricate a second embankment allocation for excavation reuse", () => {
    const slices = resolveEquipmentBoqHours({
      boqItemId: 11,
      hoursWorked: 4,
      activityAllocations: [{ boqItemId: 11, programmeBarId: null, hoursWorked: 4 }],
    });
    expect(slices).toEqual([{
      boqItemId: 11,
      programmeBarId: null,
      hoursWorked: 4,
      source: "activity_allocation",
    }]);
  });

  it("J/K: allocation resolution does not multiply hire attendance or diesel facts", () => {
    const parent = {
      hoursWorked: 8,
      diesel: 35,
      plantUsageId: 44,
      activityAllocations: [
        { boqItemId: 11, programmeBarId: null, hoursWorked: 4 },
        { boqItemId: 22, programmeBarId: null, hoursWorked: 4 },
      ],
    };
    expect(resolveEquipmentBoqHours(parent)).toHaveLength(2);
    expect(parent.hoursWorked).toBe(8);
    expect(parent.diesel).toBe(35);
    expect(parent.plantUsageId).toBe(44);
  });

  it("uses strict same-day HH:MM durations and parent time fallback", () => {
    expect(calculateEquipmentAllocationHours("08:15", "09:45")).toBe(1.5);
    expect(calculateEquipmentAllocationHours("23:00", "01:00")).toBeNull();
    expect(calculateEquipmentAllocationHours("8:00", "09:00")).toBeNull();
    expect(resolveEquipmentAllocationParentHours({ hoursWorked: null, startTime: "08:00", endTime: "16:00" })).toBe(8);
  });

  it("rejects invalid BOQ and programme identities before persistence", () => {
    expect(() => validateEquipmentActivityAllocations([allocation(0, "08:00", "09:00")], 8))
      .toThrow(EquipmentActivityAllocationError);
    expect(() => validateEquipmentActivityAllocations([
      { ...allocation(11, "08:00", "09:00"), programmeBarId: -1 },
    ], 8)).toThrow(/invalid programme bar/i);
  });
});