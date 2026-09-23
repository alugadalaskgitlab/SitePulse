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

export function equipmentStatusInputError(input: {
  usageStatus?: unknown;
  usageStatusReason?: unknown;
}): string | null {
  const status = input.usageStatus;
  if (status == null || status === "") return null;
  if (!isEquipmentUsageStatus(status)) return "Invalid equipment usage status";
  if (status !== "working" && !String(input.usageStatusReason ?? "").trim()) {
    return "A reason is required when equipment is idle or broken down";
  }
  return null;
}

export function assertValidEquipmentStatus(input: {
  usageStatus?: unknown;
  usageStatusReason?: unknown;
}): void {
  const error = equipmentStatusInputError(input);
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
): FleetEquipmentStatus[] {
  const dates = datesInclusive(dateFrom, dateTo);
  const grouped = new Map<string, EquipmentStatusRecord[]>();
  for (const record of records) {
    const key = `${record.equipmentId}|${record.date}`;
    const rows = grouped.get(key) ?? [];
    rows.push(record);
    grouped.set(key, rows);
  }
  return masters.map((master) => {
    const days = dates.map((date) =>
      resolveFleetStatusDay(date, grouped.get(`${master.id}|${date}`) ?? []));
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