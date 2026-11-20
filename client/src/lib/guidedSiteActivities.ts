import type { DprSiteActivity } from "@/components/DprSiteActivitiesEditor";

/**
 * Guided draft saves use explicit persistedId identity. Omitting the property
 * until the section is loaded is essential: an empty array would delete rows
 * saved from the Detailed DPR.
 */
export function guidedSiteActivitiesPayload(
  loaded: boolean,
  activities: DprSiteActivity[],
): { siteActivities?: Array<Record<string, unknown>> } {
  if (!loaded) return {};
  return {
    siteActivities: activities.map((activity, index) => {
      const {
        id,
        dprId: _dprId,
        staff: _staff,
        staffNames: _staffNames,
        file: _file,
        ...fields
      } = activity as any;
      return {
        ...fields,
        ...(activity.persistedId ?? id ? { persistedId: activity.persistedId ?? id } : {}),
        sortOrder: index,
        personnelIds: activity.personnelIds ?? [],
      };
    }),
  };
}
