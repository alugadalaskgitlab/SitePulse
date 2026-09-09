import { formatEquipmentDuration } from "./equipmentUsage";

export const EQUIPMENT_ALLOCATION_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type EquipmentActivityAllocationInput = {
  boqItemId: number;
  programmeBarId?: number | null;
  startTime: string;
  endTime: string;
  hoursWorked?: number;
};

export type EquipmentActivitySegmentInput = {
  startTime: string;
  endTime: string;
  boqItems: Array<{
    boqItemId: number;
    programmeBarId?: number | null;
  }>;
  hoursWorked?: number;
};

export type NormalizedEquipmentActivitySegment = {
  startTime: string;
  endTime: string;
  hoursWorked: number;
  boqItems: Array<{
    boqItemId: number;
    programmeBarId: number | null;
  }>;
};

export type EquipmentActivitySegmentValidation = {
  segments: NormalizedEquipmentActivitySegment[];
  physicalHours: number;
  unallocatedHours: number | null;
};

export type NormalizedEquipmentActivityAllocation = {
  boqItemId: number;
  programmeBarId: number | null;
  startTime: string;
  endTime: string;
  hoursWorked: number;
};

export type EquipmentAllocationValidation = {
  allocations: NormalizedEquipmentActivityAllocation[];
  allocatedHours: number;
  unallocatedHours: number | null;
};

export class EquipmentActivityAllocationError extends Error {
  readonly code = "EQUIPMENT_ACTIVITY_ALLOCATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "EquipmentActivityAllocationError";
  }
}

export function equipmentTimeToMinutes(value: string): number | null {
  if (!EQUIPMENT_ALLOCATION_TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function calculateEquipmentAllocationHours(startTime: string, endTime: string): number | null {
  const start = equipmentTimeToMinutes(startTime);
  const end = equipmentTimeToMinutes(endTime);
  if (start == null || end == null || end <= start) return null;
  return Math.round(((end - start) / 60) * 1_000_000) / 1_000_000;
}

export function formatEquipmentAllocationDuration(startTime: string, endTime: string): string {
  return formatEquipmentDuration(calculateEquipmentAllocationHours(startTime, endTime));
}

export type EquipmentAllocationParentBasis = "meter_working_hours" | "clock_duration" | "none";

export function resolveEquipmentAllocationParentDuration(row: {
  hoursWorked?: number | null;
  startTime?: string | null;
  endTime?: string | null;
}): { hours: number | null; basis: EquipmentAllocationParentBasis } {
  const clockHours = row.startTime && row.endTime
    ? calculateEquipmentAllocationHours(row.startTime, row.endTime)
    : null;
  return {
    hours: clockHours,
    basis: clockHours == null ? "none" : "clock_duration",
  };
}

export function resolveEquipmentAllocationParentHours(row: {
  hoursWorked?: number | null;
  startTime?: string | null;
  endTime?: string | null;
}): number | null {
  return resolveEquipmentAllocationParentDuration(row).hours;
}

export function validateEquipmentActivityAllocations(
  inputs: EquipmentActivityAllocationInput[] | undefined,
  parentHours: number | null | undefined,
  parentTimeRange?: { startTime?: string | null; endTime?: string | null },
): EquipmentAllocationValidation {
  const allocations: NormalizedEquipmentActivityAllocation[] = [];
  const segments = new Set<string>();

  const rows = inputs ?? [];
  for (let index = 0; index < rows.length; index += 1) {
    const input = rows[index];
    if (!Number.isInteger(input.boqItemId) || input.boqItemId <= 0) {
      throw new EquipmentActivityAllocationError(`Allocation ${index + 1}: select a valid BOQ item.`);
    }
    if (input.programmeBarId != null && (!Number.isInteger(input.programmeBarId) || input.programmeBarId <= 0)) {
      throw new EquipmentActivityAllocationError(`Allocation ${index + 1}: the selected work reach is invalid.`);
    }
    const hoursWorked = calculateEquipmentAllocationHours(input.startTime, input.endTime);
    if (hoursWorked == null) {
      throw new EquipmentActivityAllocationError(`Allocation ${index + 1}: End Time must be later than Start Time on the same day.`);
    }
    if (parentTimeRange?.startTime && input.startTime < parentTimeRange.startTime) {
      throw new EquipmentActivityAllocationError(`Allocation ${index + 1}: Start Time cannot be before the machine-day Start Time.`);
    }
    if (parentTimeRange?.endTime && input.endTime > parentTimeRange.endTime) {
      throw new EquipmentActivityAllocationError(`Allocation ${index + 1}: End Time cannot be after the machine-day End Time.`);
    }
    const segmentKey = `${input.startTime}|${input.endTime}`;
    if (segments.has(segmentKey)) {
      throw new EquipmentActivityAllocationError(`Allocation ${index + 1}: duplicate time segment.`);
    }
    segments.add(segmentKey);
    allocations.push({
      boqItemId: input.boqItemId,
      programmeBarId: input.programmeBarId ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      hoursWorked,
    });
  }

  const chronological = [...allocations].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
  for (let index = 1; index < chronological.length; index++) {
    if (chronological[index].startTime < chronological[index - 1].endTime) {
      throw new EquipmentActivityAllocationError("Equipment activity allocation time segments cannot overlap.");
    }
  }

  const allocatedHours = Math.round(allocations.reduce((sum, row) => sum + row.hoursWorked, 0) * 1_000_000) / 1_000_000;
  const finiteParentHours = parentHours == null ? null : Number(parentHours);
  if (finiteParentHours != null && Number.isFinite(finiteParentHours) && allocatedHours > finiteParentHours + 0.000001) {
    throw new EquipmentActivityAllocationError(
      `Allocated time (${formatEquipmentDuration(allocatedHours)}) exceeds the machine-day limit (${formatEquipmentDuration(finiteParentHours)}).`,
    );
  }
  return {
    allocations,
    allocatedHours,
    unallocatedHours: finiteParentHours != null && Number.isFinite(finiteParentHours)
      ? Math.max(0, Math.round((finiteParentHours - allocatedHours) * 1_000_000) / 1_000_000)
      : null,
  };
}

/**
 * Validates normalized physical intervals. A segment's duration is counted
 * once even when that same interval is attributed to several BOQ items.
 */
export function validateEquipmentActivitySegments(
  inputs: EquipmentActivitySegmentInput[] | undefined,
  parentHours: number | null | undefined,
  parentTimeRange?: { startTime?: string | null; endTime?: string | null },
): EquipmentActivitySegmentValidation {
  const segments: NormalizedEquipmentActivitySegment[] = [];
  for (let index = 0; index < (inputs ?? []).length; index += 1) {
    const input = inputs![index];
    const hoursWorked = calculateEquipmentAllocationHours(input.startTime, input.endTime);
    if (hoursWorked == null) {
      throw new EquipmentActivityAllocationError(`Segment ${index + 1}: End Time must be later than Start Time on the same day.`);
    }
    if (parentTimeRange?.startTime && input.startTime < parentTimeRange.startTime) {
      throw new EquipmentActivityAllocationError(`Segment ${index + 1}: Start Time cannot be before the machine-day Start Time.`);
    }
    if (parentTimeRange?.endTime && input.endTime > parentTimeRange.endTime) {
      throw new EquipmentActivityAllocationError(`Segment ${index + 1}: End Time cannot be after the machine-day End Time.`);
    }
    if (!Array.isArray(input.boqItems) || input.boqItems.length === 0) {
      throw new EquipmentActivityAllocationError(`Segment ${index + 1}: select at least one BOQ item.`);
    }
    const seenBoqs = new Set<number>();
    const boqItems = input.boqItems.map((link, linkIndex) => {
      if (!Number.isInteger(link.boqItemId) || link.boqItemId <= 0) {
        throw new EquipmentActivityAllocationError(`Segment ${index + 1}, BOQ ${linkIndex + 1}: select a valid BOQ item.`);
      }
      if (seenBoqs.has(link.boqItemId)) {
        throw new EquipmentActivityAllocationError(`Segment ${index + 1}: each BOQ item may be linked only once.`);
      }
      seenBoqs.add(link.boqItemId);
      if (link.programmeBarId != null && (!Number.isInteger(link.programmeBarId) || link.programmeBarId <= 0)) {
        throw new EquipmentActivityAllocationError(`Segment ${index + 1}, BOQ ${linkIndex + 1}: the selected work reach is invalid.`);
      }
      return { boqItemId: link.boqItemId, programmeBarId: link.programmeBarId ?? null };
    });
    segments.push({
      startTime: input.startTime,
      endTime: input.endTime,
      hoursWorked,
      boqItems,
    });
  }

  const chronological = [...segments].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
  for (let index = 1; index < chronological.length; index += 1) {
    if (chronological[index].startTime < chronological[index - 1].endTime) {
      throw new EquipmentActivityAllocationError("Equipment activity segments cannot overlap.");
    }
  }

  const physicalHours = Math.round(segments.reduce((sum, segment) => sum + segment.hoursWorked, 0) * 1_000_000) / 1_000_000;
  const finiteParentHours = parentHours == null ? null : Number(parentHours);
  if (finiteParentHours != null && Number.isFinite(finiteParentHours) && physicalHours > finiteParentHours + 0.000001) {
    throw new EquipmentActivityAllocationError(
      `Segment time (${formatEquipmentDuration(physicalHours)}) exceeds the machine-day limit (${formatEquipmentDuration(finiteParentHours)}).`,
    );
  }
  return {
    segments,
    physicalHours,
    unallocatedHours: finiteParentHours != null && Number.isFinite(finiteParentHours)
      ? Math.max(0, Math.round((finiteParentHours - physicalHours) * 1_000_000) / 1_000_000)
      : null,
  };
}

export type EquipmentSegmentBoqAttribution = {
  boqHours: Array<{
    boqItemId: number;
    programmeBarId: number | null;
    hoursWorked: number;
  }>;
  physicalHours: number;
};

export function attributeEquipmentActivitySegmentBoqHours(
  segments: NormalizedEquipmentActivitySegment[],
): EquipmentSegmentBoqAttribution {
  return {
    boqHours: segments.flatMap(segment => segment.boqItems.map(link => ({
      ...link,
      hoursWorked: segment.hoursWorked,
    }))),
    physicalHours: Math.round(segments.reduce((sum, segment) => sum + segment.hoursWorked, 0) * 1_000_000) / 1_000_000,
  };
}

export type EquipmentBoqHoursSlice = {
  boqItemId: number;
  programmeBarId: number | null;
  hoursWorked: number;
  source: "activity_segment" | "activity_allocation" | "legacy_parent";
};

export function resolveEquipmentBoqHours(row: {
  boqItemId?: number | null;
  hoursWorked?: number | null;
  activityAllocations?: Array<{
    boqItemId: number;
    programmeBarId?: number | null;
    hoursWorked: number;
  }> | null;
  activitySegments?: Array<{
    startTime: string;
    endTime: string;
    hoursWorked: number;
    boqItems: Array<{ boqItemId: number; programmeBarId?: number | null }>;
  }> | null;
}): EquipmentBoqHoursSlice[] {
  if (row.activitySegments?.length) {
    return row.activitySegments.flatMap(segment => segment.boqItems
      .filter(() => Number(segment.hoursWorked) > 0)
      .map(link => ({
        boqItemId: Number(link.boqItemId),
        programmeBarId: link.programmeBarId ?? null,
        hoursWorked: Number(segment.hoursWorked),
        source: "activity_segment" as const,
      })));
  }
  if (row.activityAllocations?.length) {
    return row.activityAllocations
      .filter(allocation => Number(allocation.hoursWorked) > 0)
      .map(allocation => ({
        boqItemId: Number(allocation.boqItemId),
        programmeBarId: allocation.programmeBarId ?? null,
        hoursWorked: Number(allocation.hoursWorked),
        source: "activity_allocation" as const,
      }));
  }
  if (row.boqItemId == null || !(Number(row.hoursWorked) > 0)) return [];
  return [{
    boqItemId: Number(row.boqItemId),
    programmeBarId: null,
    hoursWorked: Number(row.hoursWorked),
    source: "legacy_parent",
  }];
}