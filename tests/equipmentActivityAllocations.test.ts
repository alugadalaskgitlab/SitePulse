import { describe, expect, it } from "vitest";
import {
  EquipmentActivityAllocationError,
  calculateEquipmentAllocationHours,
  attributeEquipmentActivitySegmentBoqHours,
  formatEquipmentAllocationDuration,
  groupLegacyEquipmentActivityAllocations,
  resolveEquipmentAllocationParentDuration,
  resolveEquipmentAllocationParentHours,
  resolveEquipmentBoqHours,
  validateEquipmentActivityAllocations,
  validateEquipmentActivitySegments,
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
    ], 8)).toThrow(/exceeds the machine-day limit/i);
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
    expect(resolveEquipmentAllocationParentDuration({ hoursWorked: 7.5, startTime: "09:15", endTime: "17:21" }))
      .toEqual({ hours: 8.1, basis: "clock_duration" });
    expect(resolveEquipmentAllocationParentDuration({ hoursWorked: null, startTime: "09:15", endTime: "17:21" }))
      .toEqual({ hours: 8.1, basis: "clock_duration" });
    expect(formatEquipmentAllocationDuration("09:15", "12:30")).toBe("3 h 15 min");
  });

  it("rejects invalid BOQ and programme identities before persistence", () => {
    expect(() => validateEquipmentActivityAllocations([allocation(0, "08:00", "09:00")], 8))
      .toThrow(EquipmentActivityAllocationError);
    expect(() => validateEquipmentActivityAllocations([
      { ...allocation(11, "08:00", "09:00"), programmeBarId: -1 },
    ], 8)).toThrow(/work reach is invalid/i);
  });

  it("uses the parent clock window rather than meter working hours", () => {
    const result = validateEquipmentActivityAllocations(
      [allocation(11, "09:30", "18:10")],
      resolveEquipmentAllocationParentHours({ hoursWorked: 7.4, startTime: "09:30", endTime: "18:10" }),
      { startTime: "09:30", endTime: "18:10" },
    );
    expect(result.allocatedHours).toBeCloseTo(8.666667);
    expect(result.unallocatedHours).toBe(0);
    expect(() => validateEquipmentActivityAllocations(
      [allocation(11, "09:00", "12:00")],
      8.666667,
      { startTime: "09:30", endTime: "18:10" },
    )).toThrow(/before the machine-day Start Time/i);
    expect(() => validateEquipmentActivityAllocations(
      [allocation(11, "16:00", "18:30")],
      8.666667,
      { startTime: "09:30", endTime: "18:10" },
    )).toThrow(/after the machine-day End Time/i);
  });

  it("normalizes one physical segment with several unique BOQ links", () => {
    const result = validateEquipmentActivitySegments([{
      startTime: "08:00",
      endTime: "12:00",
      boqItems: [
        { boqItemId: 11, programmeBarId: 101 },
        { boqItemId: 22 },
      ],
      hoursWorked: 999,
    }], 8, { startTime: "08:00", endTime: "16:00" });

    expect(result.physicalHours).toBe(4);
    expect(result.unallocatedHours).toBe(4);
    expect(result.segments[0].hoursWorked).toBe(4);
    expect(result.segments[0].boqItems).toEqual([
      { boqItemId: 11, programmeBarId: 101 },
      { boqItemId: 22, programmeBarId: null },
    ]);
  });

  it("rejects duplicate links and overlapping distinct segments", () => {
    expect(() => validateEquipmentActivitySegments([{
      startTime: "08:00",
      endTime: "10:00",
      boqItems: [{ boqItemId: 11 }, { boqItemId: 11, programmeBarId: 101 }],
    }], 8)).toThrow(/linked only once/i);

    expect(() => validateEquipmentActivitySegments([
      { startTime: "08:00", endTime: "11:00", boqItems: [{ boqItemId: 11 }] },
      { startTime: "10:00", endTime: "12:00", boqItems: [{ boqItemId: 22 }] },
    ], 8)).toThrow(/cannot overlap/i);
  });

  it("attributes full duration to every BOQ while counting physical time once", () => {
    const validated = validateEquipmentActivitySegments([{
      startTime: "08:00",
      endTime: "12:00",
      boqItems: [{ boqItemId: 11 }, { boqItemId: 22 }],
    }], 8);
    expect(attributeEquipmentActivitySegmentBoqHours(validated.segments)).toEqual({
      boqHours: [
        { boqItemId: 11, programmeBarId: null, hoursWorked: 4 },
        { boqItemId: 22, programmeBarId: null, hoursWorked: 4 },
      ],
      physicalHours: 4,
    });
    expect(resolveEquipmentBoqHours({
      boqItemId: 99,
      hoursWorked: 8,
      activityAllocations: [{ boqItemId: 99, hoursWorked: 8 }],
      activitySegments: validated.segments,
    }).map(row => row.source)).toEqual(["activity_segment", "activity_segment"]);
  });

  it("groups only identical legacy time ranges for explicit conversion editing", () => {
    const grouped = groupLegacyEquipmentActivityAllocations([
      allocation(11, "09:30", "13:00"),
      allocation(22, "09:30", "13:00"),
      allocation(33, "12:30", "14:00"),
    ]);
    expect(grouped).toEqual([
      {
        startTime: "09:30",
        endTime: "13:00",
        hoursWorked: undefined,
        boqItems: [
          { boqItemId: 11, programmeBarId: null },
          { boqItemId: 22, programmeBarId: null },
        ],
      },
      {
        startTime: "12:30",
        endTime: "14:00",
        hoursWorked: undefined,
        boqItems: [{ boqItemId: 33, programmeBarId: null }],
      },
    ]);
    expect(() => validateEquipmentActivitySegments(
      grouped,
      4.5,
      { startTime: "09:30", endTime: "14:00" },
    )).toThrow(/cannot overlap/i);
  });
});