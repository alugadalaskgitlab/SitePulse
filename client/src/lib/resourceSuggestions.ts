import type { EquipmentActivitySegment } from "@/components/EquipmentActivityAllocationEditor";

// Client-only provenance. Symbols survive row spreads but are never serialized
// to draft storage or API payloads, so reopening a saved row cannot default it.
export const resourceSuggestion = Symbol("resourceSuggestion");
export type SuggestionRow = {
  [resourceSuggestion]?: "eligible" | "suggested" | "manual";
  persistedId?: number;
  boqItemId?: number | null;
  resourceScope?: string | null;
  structureId?: string | null;
};
export type ResourceActivity = {
  boqItemId?: number | null;
  programmeBarId?: number | null;
  noSiteWork?: boolean;
};

export function todaysResourceActivities(rows: ResourceActivity[]) {
  return Array.from(new Set(rows.filter(row => !row.noSiteWork && row.boqItemId != null)
    .map(row => row.boqItemId!)));
}

export function newResourceRow<T extends object>(row: T): T & SuggestionRow {
  return { ...row, [resourceSuggestion]: "eligible" };
}

export function suggestResourceItem<T extends SuggestionRow>(row: T, activities: number[], enabled = true): T {
  if (row.persistedId != null || !["eligible", "suggested"].includes(row[resourceSuggestion] ?? "")) return row;
  if (!enabled) return row[resourceSuggestion] === "suggested"
    ? { ...row, boqItemId: null, resourceScope: null, structureId: null, [resourceSuggestion]: "eligible" } : row;
  const boqItemId = activities.length === 1 ? activities[0] : null;
  const provenance = boqItemId == null ? "eligible" : "suggested";
  if (row.boqItemId === boqItemId && row[resourceSuggestion] === provenance) return row;
  return { ...row, boqItemId, resourceScope: null, structureId: null, [resourceSuggestion]: provenance };
}

export function chooseResourceItem<T extends SuggestionRow>(row: T, value: string): T {
  return {
    ...row, [resourceSuggestion]: "manual",
    boqItemId: value === "general" || value === "none" ? null : Number(value),
    resourceScope: value === "general" ? "general" : null, structureId: null,
  };
}

export function suggestedEquipmentSegment(
  row: { startTime?: string; endTime?: string },
  activityIds: number[],
  bars: Array<{ id: number; boqItemId: number }>,
): EquipmentActivitySegment[] {
  if (activityIds.length !== 1 || !row.startTime || !row.endTime) return [];
  const matching = Array.from(new Map(bars.filter(bar => bar.boqItemId === activityIds[0]).map(bar => [bar.id, bar])).values());
  if (matching.length !== 1) return [];
  // Leave clock validation and hours calculation to the existing editor.
  return [{
    startTime: row.startTime, endTime: row.endTime,
    boqItems: [{ boqItemId: activityIds[0], programmeBarId: matching[0].id }],
  }];
}