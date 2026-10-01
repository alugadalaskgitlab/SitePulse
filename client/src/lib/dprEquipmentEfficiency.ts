import {
  buildEquipmentPerformanceDailyRows,
  type EquipmentPerformanceReport,
} from "@shared/equipmentPerformance";
import { linkedUsageId } from "@/lib/equipmentLifecycle";
import { resolvePermittedSiteIds, type SiteAccessUserLike } from "@shared/siteAccess";

export type DprPerformanceContext = {
  id: number;
  date: string;
  dprStatus?: string | null;
  isDeleted?: boolean | null;
  isCancelled?: boolean | null;
  isSuperseded?: boolean | null;
};
export type DprEfficiencyRow = {
  id?: number | null;
  equipmentId?: number | null;
  plantUsageId?: number | null;
  equipmentUsageId?: number | null;
  usageId?: number | null;
  linkedUsageId?: number | null;
  passthrough?: { plantUsageId?: number | null };
};
export type DprActualEfficiency =
  | { state: "available"; rate: number; unit: "L/hr" | "L/km"; provenance: string }
  | { state: "pending" | "unavailable" | "loading"; reason: string };

const unavailable = (reason: string): DprActualEfficiency => ({ state: "unavailable", reason });
const positiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export function isLiveDprPerformanceContext(dpr?: DprPerformanceContext | null): boolean {
  return !!dpr && positiveId(dpr.id) != null && /^\d{4}-\d{2}-\d{2}$/.test(dpr.date)
    && dpr.dprStatus !== "draft" && !dpr.isDeleted && !dpr.isCancelled && !dpr.isSuperseded;
}

/** /api/auth/me returns the safe user including the explicit all-sites grant.
 * The performance API excludes unauthorized records before building its day
 * flags, so those flags alone cannot establish complete context for a caller
 * whose site access is restricted or unknown. Reuse the existing access
 * resolver; do not change permission semantics or infer access from zero rows. */
export function hasCompleteDprPerformanceContext(user?: SiteAccessUserLike | null): boolean {
  return resolvePermittedSiteIds(user, []) === null;
}

/** Do not narrow by site/project: the report's canonical day context and
 * completeness guards must survive even when this DPR uses only one machine. */
export function dprEquipmentPerformanceUrl(date: string): string {
  const params = new URLSearchParams({ dateFrom: date, dateTo: date });
  return `/api/reports/equipment-performance?${params}`;
}

/** Maps a single saved source record, never a fleet/day aggregate. No fuel or
 * efficiency arithmetic lives here: the exported daily wrapper calls the
 * existing managementMetrics implementation. */
export function resolveDprActualEfficiency({
  dpr, row, report, canView, hasCompleteContext = false, isLoading = false, error,
}: {
  dpr: DprPerformanceContext;
  row: DprEfficiencyRow;
  report?: EquipmentPerformanceReport;
  canView: boolean;
  hasCompleteContext?: boolean;
  isLoading?: boolean;
  error?: Error | null;
}): DprActualEfficiency {
  if (!canView) return unavailable("performance access not granted");
  if (!isLiveDprPerformanceContext(dpr)) return unavailable("DPR is not included in live performance data");
  if (!hasCompleteContext) return unavailable("complete equipment-day access is not verified");
  if (error) return unavailable(error.message);
  if (isLoading) return { state: "loading", reason: "checking confirmed performance data" };
  if (!report || !Array.isArray(report.events) || !Array.isArray(report.fleet)) {
    return unavailable("verified performance data is unavailable");
  }

  const usageId = positiveId(linkedUsageId(row));
  const logId = positiveId(row.id);
  if (usageId == null && logId == null) return unavailable("no saved source record");
  const matches = report.events.filter(event => {
    if (event.date !== dpr.date || event.reference.dprId !== dpr.id) return false;
    if (usageId != null) {
      // A usage's canonical record may not have a log, but when it does, do
      // not attribute the first log's measurement to a duplicate DPR row.
      return event.source === "plant_usage" && event.reference.plantUsageId === usageId
        && (event.reference.equipmentLogId == null || logId == null || event.reference.equipmentLogId === logId);
    }
    return event.reference.equipmentLogId === logId;
  });
  if (matches.length !== 1) {
    return unavailable(matches.length ? "source record is ambiguous" : "no matching canonical performance record");
  }
  const event = matches[0];
  const basis: string = event.usageBasis;
  if (basis === "estimated_distance" || (basis === "time_fallback" && event.dieselEfficiencyUnit === "L/km")) {
    return unavailable("distance is estimated, not measured or recorded from trips");
  }
  if (!Number.isFinite(event.usageValue) || event.usageValue < 0) {
    return unavailable("runtime or distance is missing");
  }
  const equipmentId = positiveId(event.equipmentId);
  if (equipmentId == null || (row.equipmentId != null && positiveId(row.equipmentId) !== equipmentId)) {
    return unavailable("equipment source identity is unavailable or inconsistent");
  }

  const context = report.events.filter(candidate => candidate.equipmentId === equipmentId && candidate.date === dpr.date);
  const fleet = report.fleet.filter(candidate => candidate.equipmentId === equipmentId);
  const days = fleet.flatMap(candidate => candidate.dailyRows ?? []).filter(day => day.date === dpr.date);
  if (fleet.length !== 1 || days.length !== 1 || typeof days[0].consumptionIncomplete !== "boolean") {
    return unavailable("verified performance context is unavailable");
  }
  // Carry the server's incomplete-day flag. A restricted/filtered report must
  // not become "confirmed" merely because the visible subset has tank values.
  const master = report.filterOptions?.equipment?.find(candidate => candidate.id === equipmentId);
  if (!master || (master.meterType !== "hour_meter" && master.meterType !== "odometer")) {
    return unavailable("equipment master / meter type is unavailable");
  }
  let provenance: string;
  if (basis === "hour_meter" && event.dieselEfficiencyUnit === "L/hr" && master.meterType === "hour_meter") {
    provenance = "Confirmed tank consumption; runtime from recorded hour-meter readings.";
  } else if (basis === "odometer" && event.dieselEfficiencyUnit === "L/km" && master.meterType === "odometer") {
    provenance = "Confirmed tank consumption; distance from recorded odometer readings.";
  } else if (basis === "trip_based" && event.dieselEfficiencyUnit === "L/km") {
    provenance = "Confirmed tank consumption; distance from recorded trips and one-way distance (round trips).";
  } else if ((basis === "time_fallback" || basis === "time_based") && event.dieselEfficiencyUnit === "L/hr") {
    const recordedTime = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!recordedTime.test(event.startTime ?? "") || !recordedTime.test(event.endTime ?? "")
      || event.clockDuration == null || !Number.isFinite(event.clockDuration) || event.clockDuration <= 0) {
      return unavailable("recorded clock runtime is unavailable");
    }
    provenance = "Confirmed tank consumption; runtime from recorded start/end clock time, not hour-meter readings.";
  } else if (basis === "none") {
    return unavailable("runtime or distance is missing");
  } else {
    return unavailable("runtime/distance basis or consumption-rate unit is unavailable or inconsistent");
  }
  const metrics = buildEquipmentPerformanceDailyRows(
    [event], master, context, days[0].consumptionIncomplete,
  )[0];
  if (metrics.consumptionIncomplete) {
    if (context.length > 1) {
      return unavailable("multiple same-day records; source rate cannot be isolated safely");
    }
    return { state: "pending", reason: "pending confirmed tank / usage data" };
  }
  if (metrics.consumptionRate == null || !Number.isFinite(metrics.consumptionRate)
    || (metrics.consumptionRateUnit !== "L/hr" && metrics.consumptionRateUnit !== "L/km")) {
    return unavailable("runtime or distance is missing");
  }
  return { state: "available", rate: metrics.consumptionRate, unit: metrics.consumptionRateUnit, provenance };
}

export async function fetchDprEquipmentPerformance(date: string, signal?: AbortSignal): Promise<EquipmentPerformanceReport> {
  const response = await fetch(dprEquipmentPerformanceUrl(date), { credentials: "include", signal });
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403
      ? "performance access denied" : `performance request failed (HTTP ${response.status})`;
    throw new Error(reason);
  }
  return response.json();
}