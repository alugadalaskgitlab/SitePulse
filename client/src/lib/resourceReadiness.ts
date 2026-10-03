import type { DprReadinessIssue, DprReadinessResult, DprReadinessSection } from "@shared/dprSubmitReadiness";

export function isResourceAttributionAdvisory(issue: DprReadinessIssue) {
  return ["equipment", "labour", "materials"].includes(issue.section)
    && issue.message.includes("not linked to a work item");
}

// Write payloads intentionally omit unchanged saved assignments. Readiness
// needs the hydrated assignments, without altering any operational values.
export function equipmentReadinessAttribution<T extends object>(payload: T, source: {
  activitySegments?: unknown; activityAllocations?: unknown; resourceScope?: unknown;
}) {
  return { ...payload, activitySegments: source.activitySegments,
    activityAllocations: source.activityAllocations, resourceScope: source.resourceScope };
}

// Keep all pre-existing mandatory and advisory indexes exactly as before.
// Only the new attribution advisory maps filtered payload indexes back to UI.
export function remapAttributionAdvisories(
  result: DprReadinessResult,
  indexes: Partial<Record<DprReadinessSection, number[]>>,
): DprReadinessResult {
  return { ...result, advisories: result.advisories.map(issue =>
    isResourceAttributionAdvisory(issue) && issue.rowIndex != null && indexes[issue.section]?.[issue.rowIndex] != null
      ? { ...issue, rowIndex: indexes[issue.section]![issue.rowIndex] } : issue) };
}