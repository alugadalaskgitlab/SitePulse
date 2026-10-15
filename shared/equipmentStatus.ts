export const EQUIPMENT_USAGE_STATUSES = [
  "working",
  "idle_no_work",
  "idle_no_operator",
  "breakdown",
] as const;

export type EquipmentUsageStatus = typeof EQUIPMENT_USAGE_STATUSES[number];
export type FleetDayStatus = EquipmentUsageStatus | "logged_unspecified" | "not_logged";
export type EquipmentStatusSource = "dpr_log" | "plant_usage";

export interface EquipmentStatusRecord {
  source: EquipmentStatusSource;
  recordId: number;
  equipmentId: number;
  date: string;
  status: EquipmentUsageStatus | null;
  reason: string | null;
  plantUsageId?: number | null;
}

type EquipmentStatusSourceRow = {
  recordId: number;
  equipmentId: number | null;
  date: string;
  status?: unknown;
  reason?: string | null;
  plantUsageId?: number | null;
};

/** Maps the existing DPR and Plant Usage query results into the shared status contract. */
export function assembleEquipmentStatusRecords(
  dprRows: readonly EquipmentStatusSourceRow[],
  usageRows: readonly EquipmentStatusSourceRow[],
): EquipmentStatusRecord[] {
  return [
    ...dprRows.map((row) => ({
      source: "dpr_log" as const,
      recordId: row.recordId,
      equipmentId: Number(row.equipmentId),
      date: row.date,
      status: (row.status ?? null) as EquipmentUsageStatus | null,
      reason: row.reason ?? null,
      plantUsageId: row.plantUsageId ?? null,
    })),
    ...usageRows.map((row) => ({
      source: "plant_usage" as const,
      recordId: row.recordId,
      equipmentId: Number(row.equipmentId),
      date: row.date,
      status: (row.status ?? null) as EquipmentUsageStatus | null,
      reason: row.reason ?? null,
    })),
  ];
}

export interface FleetStatusDayRecord {
  source: EquipmentStatusSource;
  recordId: number;
  status: EquipmentUsageStatus | null;
  reason: string | null;
}

export interface FleetStatusDay {
  date: string;
  status: FleetDayStatus;
  reason: string | null;
  source?: "recorded_status" | "maintenance_log" | "both" | "none";
  maintenanceLogs?: Array<{ id: number; description: string | null }>;
  legacyLogged?: boolean;
  conflict?: boolean;
  records?: FleetStatusDayRecord[];
}

export interface FleetEquipmentStatus {
  equipmentId: number;
  name: string;
  ownership: string | null;
  vendorName: string | null;
  meterType: string;
  summary: {
    working: number;
    idleNoWork: number;
    idleNoOperator: number;
    breakdown: number;
    loggedUnspecified: number;
    notLogged: number;
  };
  days: FleetStatusDay[];
}

export interface FleetStatusResponse {
  dateFrom: string;
  dateTo: string;
  equipment: FleetEquipmentStatus[];
}

export type FleetMaintenanceSourceRow = {
  id: number;
  equipmentId: number;
  date: string;
  description?: string | null;
  sourceType?: string | null;
  sourceRecordId?: number | null;
};

/** Restrict maintenance-only report evidence to exact already-authorized source rows. */
export function filterFleetMaintenanceLogsByVisibleSources<
  TDpr extends { recordId: number; equipmentId: number | null; date: string },
  TUsage extends { recordId: number; equipmentId: number | null; date: string },
>(
  logs: readonly FleetMaintenanceSourceRow[],
  permittedSiteNames: readonly string[] | null,
  visibleDprRows: readonly TDpr[],
  visibleUsageRows: readonly TUsage[],
): FleetMaintenanceSourceRow[] {
  if (permittedSiteNames === null) return [...logs];
  const dprById = new Map(visibleDprRows.map(row => [Number(row.recordId), row]));
  const usageById = new Map(visibleUsageRows.map(row => [Number(row.recordId), row]));
  return logs.filter(log => {
    const sources = log.sourceType === "dpr_log" ? dprById
      : log.sourceType === "plant_usage" ? usageById
      : null;
    if (!sources || log.sourceRecordId == null) return false;
    const source = sources.get(Number(log.sourceRecordId));
    return !!source
      && Number(source.equipmentId) === Number(log.equipmentId)
      && String(source.date).slice(0, 10) === String(log.date).slice(0, 10);
  });
}

const STATUS_PRIORITY: Record<EquipmentUsageStatus, number> = {
  working: 1,
  idle_no_work: 2,
  idle_no_operator: 3,
  breakdown: 4,
};

export function isEquipmentUsageStatus(value: unknown): value is EquipmentUsageStatus {
  return typeof value === "string"
    && (EQUIPMENT_USAGE_STATUSES as readonly string[]).includes(value);
}

/** Applied on entry/save, never as a historical-record read gate. */
export function equipmentStatusRequiresReason(status: unknown, dprEntry = false): boolean {
  return status === "idle_no_work" || (dprEntry && status === "breakdown");
}

export function equipmentStatusInputError(input: {
  usageStatus?: unknown;
  usageStatusReason?: unknown;
}, dprEntry = false): string | null {
  const status = input.usageStatus;
  if (status == null || status === "") return null;
  if (!isEquipmentUsageStatus(status)) return "Invalid equipment usage status";
  if (equipmentStatusRequiresReason(status, dprEntry) && !String(input.usageStatusReason ?? "").trim()) {
    if (status === "breakdown") return "Enter the breakdown reason";
    return "A reason is required for Idle — No Work status";
  }
  return null;
}

export function assertValidEquipmentStatus(input: {
  usageStatus?: unknown;
  usageStatusReason?: unknown;
}, dprEntry = false): void {
  const error = equipmentStatusInputError(input, dprEntry);
  if (error) throw new Error(error);
}

export function normalizeEquipmentStatusFields<T extends {
  usageStatus?: unknown;
  usageStatusReason?: unknown;
}>(input: T): T {
  assertValidEquipmentStatus(input);
  return {
    ...input,
    ...(input.usageStatus === "" ? { usageStatus: null } : {}),
    ...(typeof input.usageStatusReason === "string"
      ? { usageStatusReason: input.usageStatusReason.trim() || null } : {}),
  };
}

function datesInclusive(dateFrom: string, dateTo: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function dedupeMirroredRecords(records: EquipmentStatusRecord[]): EquipmentStatusRecord[] {
  const usageIds = new Set(
    records.filter((row) => row.source === "plant_usage").map((row) => row.recordId),
  );
  // The canonical plant row is authoritative when the linked pair is present.
  // Keep an orphaned DPR link if its referenced usage is outside the query.
  return records.filter((row) =>
    row.source !== "dpr_log"
    || row.plantUsageId == null
    || !usageIds.has(Number(row.plantUsageId)));
}

/**
 * Resolves one equipment-day without hiding bad source data. A linked DPR /
 * plant pair is one event. Distinct explicit statuses conflict when they
 * disagree; the displayed winner is deterministic:
 * breakdown > idle/no operator > idle/no work > working.
 */
export function resolveFleetStatusDay(
  date: string,
  inputRecords: EquipmentStatusRecord[],
): FleetStatusDay {
  const records = dedupeMirroredRecords(inputRecords);
  if (records.length === 0) return { date, status: "not_logged", reason: null };

  const explicit = records.filter(
    (row): row is EquipmentStatusRecord & { status: EquipmentUsageStatus } =>
      isEquipmentUsageStatus(row.status),
  );
  if (explicit.length === 0) {
    return { date, status: "logged_unspecified", reason: null, legacyLogged: true };
  }

  const statuses = new Set(explicit.map((row) => row.status));
  const winner = [...explicit].sort((a, b) =>
    STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status]
      || (a.source === b.source ? b.recordId - a.recordId : a.source === "dpr_log" ? -1 : 1),
  )[0];
  const conflict = statuses.size > 1;
  const publicRecords = records.map((row) => ({
    source: row.source,
    recordId: row.recordId,
    status: row.status,
    reason: row.reason,
  }));
  return {
    date,
    status: winner.status,
    reason: winner.reason,
    ...(conflict ? { conflict: true, records: publicRecords } : {}),
  };
}

export function buildFleetEquipmentStatus(
  masters: Array<{
    id: number;
    name: string;
    ownership?: string | null;
    vendorName?: string | null;
    meterType: string;
  }>,
  records: EquipmentStatusRecord[],
  dateFrom: string,
  dateTo: string,
  maintenanceLogs: Array<{
    id: number;
    equipmentId: number;
    date: string;
    description?: string | null;
  }> = [],
): FleetEquipmentStatus[] {
  const dates = datesInclusive(dateFrom, dateTo);
  const grouped = new Map<string, EquipmentStatusRecord[]>();
  for (const record of records) {
    const key = `${record.equipmentId}|${record.date}`;
    const rows = grouped.get(key) ?? [];
    rows.push(record);
    grouped.set(key, rows);
  }
  const maintenanceByDay = new Map<string, typeof maintenanceLogs>();
  for (const log of maintenanceLogs) {
    const key = `${log.equipmentId}|${log.date.slice(0, 10)}`;
    maintenanceByDay.set(key, [...(maintenanceByDay.get(key) ?? []), log]);
  }
  return masters.map((master) => {
    const days = dates.map((date) => {
      const statusRecords = grouped.get(`${master.id}|${date}`) ?? [];
      const dayMaintenance = maintenanceByDay.get(`${master.id}|${date}`) ?? [];
      const resolved = resolveFleetStatusDay(date, statusRecords);
      const hasExplicitStatus = statusRecords.some((row) => isEquipmentUsageStatus(row.status));
      // The existing bill working sheet uses a maintenance breakdown when no
      // explicit usage status was ticked. Keep that same date-level precedence
      // here without inferring anything on dates that have no evidence.
      const status = dayMaintenance.length > 0 && !hasExplicitStatus
        ? "breakdown" as const
        : resolved.status;
      const source = statusRecords.length > 0
        ? dayMaintenance.length > 0 ? "both" as const : "recorded_status" as const
        : dayMaintenance.length > 0 ? "maintenance_log" as const : "none" as const;
      const descriptions = dayMaintenance.map((log) => ({
        id: log.id,
        description: log.description ?? null,
      }));
      return {
        ...resolved,
        status,
        reason: resolved.reason ?? (status === "breakdown" ? descriptions.find((log) => log.description)?.description ?? null : null),
        source,
        ...(descriptions.length ? { maintenanceLogs: descriptions } : {}),
      };
    });
    const summary = {
      working: 0,
      idleNoWork: 0,
      idleNoOperator: 0,
      breakdown: 0,
      loggedUnspecified: 0,
      notLogged: 0,
    };
    for (const day of days) {
      if (day.status === "working") summary.working++;
      else if (day.status === "idle_no_work") summary.idleNoWork++;
      else if (day.status === "idle_no_operator") summary.idleNoOperator++;
      else if (day.status === "breakdown") summary.breakdown++;
      else if (day.status === "logged_unspecified") summary.loggedUnspecified++;
      else summary.notLogged++;
    }
    return {
      equipmentId: master.id,
      name: master.name,
      ownership: master.ownership ?? null,
      vendorName: master.vendorName ?? null,
      meterType: master.meterType,
      summary,
      days,
    };
  });
}