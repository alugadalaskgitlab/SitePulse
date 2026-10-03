import { useEffect, useRef } from "react";
import type { DprEquipmentFields } from "@/components/DprEquipmentCompact";
import type { EquipmentActivitySegment } from "@/components/EquipmentActivityAllocationEditor";
import { resourceSuggestion, suggestedEquipmentSegment, todaysResourceActivities, type ResourceActivity } from "@/lib/resourceSuggestions";

// Keep suggestions current even when the Guided equipment step is unmounted.
// The caller supplies the same segment-assignment callback used by its editor.
export function useEquipmentResourceSuggestions<T>(
  rows: T[], progress: ResourceActivity[],
  readRow: (row: T) => DprEquipmentFields,
  isNew: (row: T) => boolean,
  onWorkAssignmentChange: (index: number, segments: EquipmentActivitySegment[], source: "suggestion") => void,
) {
  const callbacks = useRef({ readRow, isNew, onWorkAssignmentChange });
  callbacks.current = { readRow, isNew, onWorkAssignmentChange };
  const activityKey = JSON.stringify(todaysResourceActivities(progress));
  const barsKey = JSON.stringify(progress.flatMap(row => !row.noSiteWork && row.boqItemId != null && row.programmeBarId != null
    ? [{ id: row.programmeBarId, boqItemId: row.boqItemId }] : []));
  useEffect(() => {
    rows.forEach((input, index) => {
      const row = callbacks.current.readRow(input);
      const provenance = row[resourceSuggestion];
      if (!callbacks.current.isNew(input) || row.persistedId != null || row.resourceScope === "general" || provenance === "manual") return;
      if (provenance !== "suggested" && (row.activitySegments?.length || row.activityAllocations?.length || row.boqItemId != null)) return;
      const suggestion = suggestedEquipmentSegment(row, JSON.parse(activityKey), JSON.parse(barsKey));
      const current = (row.activitySegments ?? []).map(({ startTime, endTime, boqItems }) => ({
        startTime, endTime, boqItems: boqItems.map(({ boqItemId, programmeBarId }) => ({ boqItemId, programmeBarId })),
      }));
      if (JSON.stringify(suggestion) !== JSON.stringify(current)) callbacks.current.onWorkAssignmentChange(index, suggestion, "suggestion");
    });
  }, [rows, activityKey, barsKey]);
}