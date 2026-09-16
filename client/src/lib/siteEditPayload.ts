/**
 * Keep values restored from older SiteEdit drafts compatible with the current
 * request schema.  These fields are optional controls/child collections, so a
 * legacy null means "not supplied" rather than an explicit business value.
 *
 * Do not turn arbitrary malformed values into valid values here.  Anything
 * other than null/undefined is retained so the request schema can report the
 * actual bad field.
 */
export function normalizeSiteEditProgressPayload<T extends Record<string, any>>(row: T): T {
  const {
    persistedId,
    personnelIds,
    uomOverrideReason,
    ...rest
  } = row;

  return {
    ...rest,
    ...(persistedId == null ? {} : { persistedId }),
    ...(personnelIds == null ? {} : { personnelIds }),
    ...(uomOverrideReason == null ? {} : { uomOverrideReason }),
  } as T;
}

export function normalizeSiteEditEquipmentPayload<T extends Record<string, any>>(row: T): T {
  const {
    persistedId,
    activitySegments,
    activityAllocations,
    breakdowns,
    ...rest
  } = row;

  const normalizedBreakdowns = Array.isArray(breakdowns)
    ? breakdowns.map((breakdown: any) => {
        if (!breakdown || typeof breakdown !== "object") return breakdown;
        const {
          maintenanceLogId,
          fromTime,
          toTime,
          description,
          responsibility,
          repairScope,
          debitableToVendor,
          remarks,
          attachment,
          ...breakdownRest
        } = breakdown;
        const normalizedAttachment = attachment && typeof attachment === "object"
          ? Object.fromEntries(
              Object.entries(attachment).filter(([, value]) => value != null),
            )
          : attachment;
        return {
          ...breakdownRest,
          ...(maintenanceLogId == null ? {} : { maintenanceLogId }),
          ...(fromTime == null ? {} : { fromTime }),
          ...(toTime == null ? {} : { toTime }),
          ...(description == null ? {} : { description }),
          ...(responsibility == null ? {} : { responsibility }),
          ...(repairScope == null ? {} : { repairScope }),
          ...(debitableToVendor == null ? {} : { debitableToVendor }),
          ...(remarks == null ? {} : { remarks }),
          ...(attachment == null ? {} : { attachment: normalizedAttachment }),
        };
      })
    : breakdowns;
  const normalizedActivitySegments = Array.isArray(activitySegments)
    ? activitySegments.map((segment: any) => {
        if (!segment || typeof segment !== "object") return segment;
        const { hoursWorked, ...segmentRest } = segment;
        return {
          ...segmentRest,
          ...(hoursWorked == null ? {} : { hoursWorked }),
        };
      })
    : activitySegments;
  const normalizedActivityAllocations = Array.isArray(activityAllocations)
    ? activityAllocations.map((allocation: any) => {
        if (!allocation || typeof allocation !== "object") return allocation;
        const { hoursWorked, ...allocationRest } = allocation;
        return {
          ...allocationRest,
          ...(hoursWorked == null ? {} : { hoursWorked }),
        };
      })
    : activityAllocations;

  return {
    ...rest,
    ...(persistedId == null ? {} : { persistedId }),
    ...(activitySegments == null ? {} : { activitySegments: normalizedActivitySegments }),
    ...(activityAllocations == null ? {} : { activityAllocations: normalizedActivityAllocations }),
    ...(breakdowns == null ? {} : { breakdowns: normalizedBreakdowns }),
  } as T;
}