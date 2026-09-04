import { computeEquipmentUsage, type UsageBasis } from "./equipmentUsage";

export type EquipmentConfidence = "linked" | "confirmed_legacy_match" | "unclassified";
export type EquipmentEventSource = "plant_usage" | "dpr_log";
export type EquipmentScope = "plant" | "site";
export type DieselPerformanceBasis = "tank_measured" | "issued_only" | "mixed" | "unavailable";

export interface EquipmentPerformanceProject {
  id: number;
  name: string;
  status: string;
}

export interface EquipmentPerformanceDpr {
  id: number;
  date: string;
  site: string;
  boqProjectId: number | null;
  dprStatus?: string | null;
  isDeleted?: boolean | null;
  isCancelled?: boolean | null;
  isSuperseded?: boolean | null;
}

export interface EquipmentPerformanceMaster {
  id: number;
  name: string;
  registrationNumber?: string | null;
  equipmentType?: string | null;
  ownership?: string | null;
  vendorName?: string | null;
  meterType?: string | null;
  consumptionNorm?: number | null;
  plantName?: string | null;
  isActive?: number | null;
  hireStartDate?: string | null;
  hireEndDate?: string | null;
}

export interface EquipmentPerformanceUsage {
  id: number;
  date: string;
  equipmentId: number;
  dprId?: number | null;
  entryType?: string | null;
  openingReading?: number | null;
  closingReading?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  tripBasedEntry?: boolean | null;
  numberOfTrips?: number | null;
  tripDistance?: number | null;
  dieselIssued?: number | null;
  openingDiesel?: number | null;
  closingDiesel?: number | null;
  dieselBalanceInTank?: number | null;
  dieselBalanceConfirmed?: boolean | null;
  operator?: string | null;
  task?: string | null;
  remarks?: string | null;
  siteName?: string | null;
  plantName?: string | null;
  destinationSite?: string | null;
  status?: string | null;
}

export interface EquipmentPerformanceLog {
  id: number;
  dprId: number;
  machine: string;
  equipmentId?: number | null;
  plantUsageId?: number | null;
  entryType?: string | null;
  openingReading?: number | null;
  closingReading?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  numberOfTrips?: number | null;
  tripDistance?: number | null;
  diesel?: number | null;
  operator?: string | null;
  task?: string | null;
}

export interface EquipmentPerformanceBreakdown {
  sourceType?: string | null;
  sourceRecordId?: number | null;
  description: string;
  fromTime?: string | null;
  toTime?: string | null;
  remarks?: string | null;
}

export interface EquipmentSuggestion {
  equipmentId: number;
  name: string;
  registrationNumber: string | null;
  match: "exact" | "substring";
}

export interface EquipmentPerformanceEvent {
  key: string;
  date: string;
  projectId: number | null;
  project: string;
  scope: EquipmentScope;
  site: string | null;
  plant: string | null;
  equipmentId: number | null;
  machine: string;
  equipmentType: string | null;
  ownership: string | null;
  task: string | null;
  openingReading: number | null;
  closingReading: number | null;
  startTime: string | null;
  endTime: string | null;
  trips: number | null;
  usageBasis: UsageBasis;
  usageValue: number;
  runtimeHours: number | null;
  totalKm: number | null;
  dieselActual: number | null;
  /** Whether dieselActual is physical tank consumption or only fuel issued. */
  dieselBasis: Exclude<DieselPerformanceBasis, "mixed">;
  dieselExpected: number | null;
  dieselVariance: number | null;
  /** Measured consumption or issued-fuel fallback per hour/km, never a percentage. */
  actualConsumptionRate: number | null;
  dieselEfficiencyUnit: "L/hr" | "L/km";
  /** Expected / reported diesel × 100, available only when reported diesel is positive. */
  efficiencyPercent: number | null;
  operator: string | null;
  source: EquipmentEventSource;
  link: EquipmentConfidence;
  reference: { dprId: number | null; equipmentLogId: number | null; plantUsageId: number | null };
  notes: string | null;
  breakdownNotes: string[];
  confidence: EquipmentConfidence;
  suggestions: EquipmentSuggestion[];
}

export interface EquipmentPerformanceFilters {
  dateFrom?: string;
  dateTo?: string;
  projectId?: number;
  scope?: EquipmentScope;
  ownership?: string;
  equipmentType?: string;
  equipmentId?: number;
  machine?: string;
}

export interface EquipmentPerformanceFleetRow {
  key: string;
  equipmentId: number | null;
  machine: string;
  registrationNumber: string | null;
  equipmentType: string | null;
  ownership: string;
  confidence: EquipmentConfidence;
  usageBasis: UsageBasis | "mixed";
  currentLocation: string | null;
  currentStatus: string | null;
  firstIncludedDate: string;
  lastUsedDate: string;
  eventCount: number;
  activeDays: number;
  runtimeHours: number;
  totalKm: number;
  trips: number;
  dieselActual: number | null;
  dieselBasis: DieselPerformanceBasis;
  /** Diesel denominator used for expected/variance/efficiency comparisons. */
  dieselComparedActual: number | null;
  dieselComparisonIncomplete: boolean;
  dieselExpected: number | null;
  dieselVariance: number | null;
  efficiencyPercent: number | null;
  dataQualityWarnings: string[];
  hired?: {
    hireStartDate: string | null;
    hireEndDate: string | null;
    elapsedDays: number | null;
    usedDays: number | null;
    gapDays: number | null;
    utilizationPercent: number | null;
  };
  owned?: { daysSinceLastUse: number };
}

export interface EquipmentPerformanceReport {
  filterOptions: {
    projects: Array<{ id: number; name: string }>;
    ownership: string[];
    equipmentTypes: string[];
    equipment: Array<{ id: number; name: string; registrationNumber: string | null }>;
    scopes: Array<{ value: EquipmentScope; label: string }>;
  };
  totals: {
    eventCount: number; linkedCount: number; confirmedLegacyCount: number; unclassifiedCount: number;
    runtimeHours: number; totalKm: number; trips: number; dieselActual: number; dieselExpected: number; dieselVariance: number;
    activeDays: number; efficiencyPercent: number | null; dieselBasis: DieselPerformanceBasis;
    dieselComparedActual: number; dieselComparisonIncomplete: boolean;
  };
  reviewRows: Array<{ logId: number; date: string; machine: string; project: string; site: string | null; usageValue: number; suggestions: EquipmentSuggestion[] }>;
  events: EquipmentPerformanceEvent[];
  fleet: EquipmentPerformanceFleetRow[];
  projects: Array<{
    projectId: number | null;
    project: string;
    historyFrom: string;
    eventCount: number;
    linkedCount: number;
    confirmedLegacyCount: number;
    unclassifiedCount: number;
    runtimeHours: number;
    totalKm: number;
    trips: number;
    dieselActual: number;
    dieselComparedActual: number;
    dieselComparisonIncomplete: boolean;
    dieselExpected: number;
  }>;
}

export function normalizeEquipmentLabel(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function suggestEquipment(machine: string, masters: EquipmentPerformanceMaster[]): EquipmentSuggestion[] {
  const needle = normalizeEquipmentLabel(machine);
  if (!needle) return [];
  return masters.flatMap((master) => {
    const labels = [master.name, master.registrationNumber].map(normalizeEquipmentLabel).filter(Boolean);
    const exact = labels.some((label) => label === needle);
    const substring = !exact && labels.some((label) => label.includes(needle) || needle.includes(label));
    return exact || substring ? [{
      equipmentId: master.id,
      name: master.name,
      registrationNumber: master.registrationNumber ?? null,
      match: exact ? "exact" as const : "substring" as const,
    }] : [];
  }).sort((a, b) => (a.match === b.match ? a.name.localeCompare(b.name) : a.match === "exact" ? -1 : 1));
}

function liveDpr(dpr: EquipmentPerformanceDpr | undefined): dpr is EquipmentPerformanceDpr {
  return !!dpr && !dpr.isDeleted && !dpr.isCancelled && !dpr.isSuperseded && dpr.dprStatus !== "draft";
}

function inclusiveDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 86400000) + 1 : 0;
}

function dayDifference(from: string, to: string): number {
  return Math.max(0, inclusiveDays(from, to) - 1);
}

function finiteNonnegative(value: unknown): number | null {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Tank consumption is trustworthy only when the operator explicitly confirmed
 * the physical closing balance and all inputs produce a non-negative result.
 * Unconfirmed/invalid rows retain the historical issued-fuel fallback.
 */
export function resolveDieselPerformance(
  usage: EquipmentPerformanceUsage | null,
  issuedFallback: number | null | undefined,
): { diesel: number | null; basis: Exclude<DieselPerformanceBasis, "mixed"> } {
  if (usage?.dieselBalanceConfirmed === true) {
    const opening = finiteNonnegative(usage.openingDiesel);
    const closing = finiteNonnegative(usage.dieselBalanceInTank ?? usage.closingDiesel);
    const issued = usage.dieselIssued == null ? 0 : finiteNonnegative(usage.dieselIssued);
    if (opening != null && closing != null && issued != null) {
      const consumed = opening + issued - closing;
      if (consumed >= 0) return { diesel: consumed, basis: "tank_measured" };
    }
  }
  const issued = finiteNonnegative(issuedFallback);
  return issued == null
    ? { diesel: null, basis: "unavailable" }
    : { diesel: issued, basis: "issued_only" };
}

function aggregateDieselBasis(rows: EquipmentPerformanceEvent[]): DieselPerformanceBasis {
  const available = new Set(rows.map((row) => row.dieselBasis).filter((basis) => basis !== "unavailable"));
  if (available.size === 0) return "unavailable";
  if (available.size > 1) return "mixed";
  return Array.from(available)[0];
}

function isClearlyPlantLocation(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /\b(hmp|rmc)\b/.test(normalized) || /\bplant$/.test(normalized);
}

/**
 * A no-DPR row is admitted only when its own fields clearly identify Plant,
 * HMP, or RMC operations. Arbitrary site text never creates a Site/project link.
 */
export function isStandalonePlantUsage(usage: EquipmentPerformanceUsage): boolean {
  if (usage.dprId != null) return false;
  if (!String(usage.siteName ?? "").trim()) return !!String(usage.plantName ?? "").trim();
  return isClearlyPlantLocation(usage.siteName);
}

/**
 * Pure report builder. Identity is explicit only: a log is collapsed solely
 * when its plantUsageId resolves to a supplied canonical usage row.
 */
export function buildEquipmentPerformanceReport(input: {
  projects: EquipmentPerformanceProject[];
  dprs: EquipmentPerformanceDpr[];
  masters: EquipmentPerformanceMaster[];
  /** Optional response/suggestion subset for site-scoped callers. */
  filterMasters?: EquipmentPerformanceMaster[];
  usages: EquipmentPerformanceUsage[];
  logs: EquipmentPerformanceLog[];
  breakdowns?: EquipmentPerformanceBreakdown[];
  filters?: EquipmentPerformanceFilters;
  asOfDate?: string;
}): EquipmentPerformanceReport {
  const filters = input.filters ?? {};
  const projects = new Map(input.projects.filter((p) => p.status === "active").map((p) => [p.id, p]));
  const dprs = new Map(input.dprs.filter((d) => liveDpr(d) && d.boqProjectId != null && projects.has(d.boqProjectId)).map((d) => [d.id, d]));
  const masters = new Map(input.masters.map((m) => [m.id, m]));
  const usages = new Map(input.usages.map((u) => [u.id, u]));
  const representedUsageIds = new Set<number>();
  const events: EquipmentPerformanceEvent[] = [];

  const makeEvent = (
    source: EquipmentEventSource,
    row: EquipmentPerformanceUsage | EquipmentPerformanceLog,
    dpr: EquipmentPerformanceDpr | null,
    confidence: EquipmentConfidence,
    log: EquipmentPerformanceLog | null,
  ) => {
    const usage = source === "plant_usage" ? row as EquipmentPerformanceUsage : null;
    const equipmentId = usage?.equipmentId ?? log?.equipmentId ?? null;
    const master = equipmentId == null ? undefined : masters.get(equipmentId);
    const calculated = computeEquipmentUsage(master, row);
    const diesel = resolveDieselPerformance(usage, usage ? usage.dieselIssued : log?.diesel);
    const actual = diesel.diesel;
    const expected = calculated.expectedDiesel;
    const site = dpr ? dpr.site : usage?.siteName ?? usage?.destinationSite ?? null;
    const plant = usage?.plantName ?? master?.plantName ?? null;
    // Record source remains `source`; scope reflects where work happened.
    const scope: EquipmentScope = dpr ? "site" : "plant";
    const projectId = dpr?.boqProjectId ?? null;
    const project = projectId == null ? "Plant Operations / HMP" : projects.get(projectId)!.name;
    const machine = master?.name ?? log?.machine ?? `Equipment #${equipmentId}`;
    const runtimeForEfficiency = calculated.totalKm ?? calculated.hoursWorked;
    const qualityWarnings = [
      calculated.warning,
      !master
        ? "Equipment Master link missing — meter type and consumption norm are unavailable."
        : !master.meterType
          ? "Meter Type is missing in Equipment Master."
          : null,
      master && master.consumptionNorm == null
        ? "Consumption Norm is missing in Equipment Master; expected diesel is unavailable."
        : null,
    ].filter((message): message is string => !!message);
    const notes = [usage?.remarks, ...qualityWarnings].filter(Boolean).join(" · ") || null;
    const breakdownNotes = (input.breakdowns ?? [])
      .filter((breakdown) =>
        (breakdown.sourceType === "dpr_log" && log != null && breakdown.sourceRecordId === log.id) ||
        (breakdown.sourceType === "plant_usage" && usage != null && breakdown.sourceRecordId === usage.id),
      )
      .map((breakdown) => [
        breakdown.description,
        breakdown.fromTime || breakdown.toTime ? `${breakdown.fromTime || "?"}–${breakdown.toTime || "?"}` : null,
        breakdown.remarks,
      ].filter(Boolean).join(" · "));
    events.push({
      key: `${source}:${row.id}`,
      date: usage?.date ?? dpr!.date,
      projectId,
      project,
      scope, site, plant, equipmentId, machine,
      equipmentType: master?.equipmentType ?? null,
      ownership: master?.ownership ?? null,
      task: row.task ?? null,
      openingReading: row.openingReading ?? null,
      closingReading: row.closingReading ?? null,
      startTime: row.startTime ?? null,
      endTime: row.endTime ?? null,
      trips: row.numberOfTrips ?? null,
      usageBasis: calculated.basis,
      usageValue: calculated.runtime,
      runtimeHours: calculated.hoursWorked,
      totalKm: calculated.totalKm,
      dieselActual: actual,
      dieselBasis: diesel.basis,
      dieselExpected: expected,
      dieselVariance: actual != null && expected != null ? actual - expected : null,
      actualConsumptionRate: actual != null && runtimeForEfficiency != null && runtimeForEfficiency > 0 ? actual / runtimeForEfficiency : null,
      dieselEfficiencyUnit: calculated.efficiencyUnit,
      efficiencyPercent: actual != null && actual > 0 && expected != null ? expected / actual * 100 : null,
      operator: row.operator ?? null,
      source,
      link: confidence,
      reference: { dprId: dpr?.id ?? null, equipmentLogId: log?.id ?? null, plantUsageId: usage?.id ?? log?.plantUsageId ?? null },
      notes,
      breakdownNotes,
      confidence,
      suggestions: confidence === "unclassified" && log ? suggestEquipment(log.machine, input.filterMasters ?? input.masters) : [],
    });
  };

  // Linked DPR rows own project attribution and are represented by canonical
  // usage. Invalid plantUsageId values deliberately fall through as log rows.
  for (const log of input.logs) {
    const dpr = dprs.get(log.dprId);
    if (!dpr) continue;
    const usage = log.plantUsageId == null ? undefined : usages.get(log.plantUsageId);
    if (usage) {
      if (!representedUsageIds.has(usage.id)) {
        representedUsageIds.add(usage.id);
        makeEvent("plant_usage", usage, dpr, "linked", log);
      }
    } else {
      makeEvent("dpr_log", log, dpr, log.equipmentId == null ? "unclassified" : "confirmed_legacy_match", log);
    }
  }
  // A canonical usage may independently establish its project only by a live
  // explicit DPR link. Machine/date/site are never consulted for attribution.
  for (const usage of input.usages) {
    if (representedUsageIds.has(usage.id)) continue;
    if (usage.dprId == null) {
      if (isStandalonePlantUsage(usage)) makeEvent("plant_usage", usage, null, "linked", null);
      continue;
    }
    const dpr = dprs.get(usage.dprId);
    if (dpr) makeEvent("plant_usage", usage, dpr, "linked", null);
  }

  const projectHistoryFrom = new Map<number | null, string>();
  for (const event of events) {
    const current = projectHistoryFrom.get(event.projectId);
    if (!current || event.date < current) projectHistoryFrom.set(event.projectId, event.date);
  }
  const normalizedMachine = normalizeEquipmentLabel(filters.machine);
  const filtered = events.filter((event) =>
    (!filters.dateFrom || event.date >= filters.dateFrom) &&
    (!filters.dateTo || event.date <= filters.dateTo) &&
    (!filters.projectId || event.projectId === filters.projectId) &&
    (!filters.scope || event.scope === filters.scope) &&
    (!filters.ownership || event.ownership === filters.ownership) &&
    (!filters.equipmentType || event.equipmentType === filters.equipmentType) &&
    (!filters.equipmentId || event.equipmentId === filters.equipmentId) &&
    (!normalizedMachine || normalizeEquipmentLabel(event.machine).includes(normalizedMachine))
  ).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

  const projectGroups = new Map<number | null, EquipmentPerformanceEvent[]>();
  for (const event of filtered) projectGroups.set(event.projectId, [...(projectGroups.get(event.projectId) ?? []), event]);
  const projectRows = Array.from(projectGroups.entries()).map(([projectId, rows]) => ({
    ...(() => {
      const dieselRows = rows.filter((row) => row.dieselActual != null);
      const comparableRows = dieselRows.filter((row) => row.dieselExpected != null);
      return {
        dieselActual: dieselRows.reduce((n, row) => n + row.dieselActual!, 0),
        dieselComparedActual: comparableRows.reduce((n, row) => n + row.dieselActual!, 0),
        dieselComparisonIncomplete: comparableRows.length !== dieselRows.length,
        dieselExpected: comparableRows.reduce((n, row) => n + row.dieselExpected!, 0),
      };
    })(),
    projectId,
    project: rows[0].project,
    historyFrom: projectHistoryFrom.get(projectId) ?? rows[0].date,
    eventCount: rows.length,
    linkedCount: rows.filter((r) => r.confidence === "linked").length,
    confirmedLegacyCount: rows.filter((r) => r.confidence === "confirmed_legacy_match").length,
    unclassifiedCount: rows.filter((r) => r.confidence === "unclassified").length,
    runtimeHours: rows.reduce((n, r) => n + (r.runtimeHours ?? 0), 0),
    totalKm: rows.reduce((n, r) => n + (r.totalKm ?? 0), 0),
    trips: rows.reduce((n, r) => n + (r.trips ?? 0), 0),
  }));

  const byEquipment = new Map<number, EquipmentPerformanceEvent[]>();
  for (const event of filtered) if (event.equipmentId != null) byEquipment.set(event.equipmentId, [...(byEquipment.get(event.equipmentId) ?? []), event]);
  const asOf = input.asOfDate ?? filters.dateTo ?? filtered.at(-1)?.date;
  const sumNullable = (rows: EquipmentPerformanceEvent[], field: "dieselActual" | "dieselExpected" | "dieselVariance"): number | null => {
    const values = rows.map((row) => row[field]).filter((value): value is number => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const rowWarnings = (rows: EquipmentPerformanceEvent[]): string[] =>
    Array.from(new Set(rows.flatMap((row) => row.notes?.split(" · ") ?? []).filter((message) =>
      /missing|unavailable|cannot compute|not entered|using .*fallback/i.test(message),
    )));
  const fleet = Array.from(byEquipment.entries()).flatMap(([equipmentId, rows]) => {
    const master = masters.get(equipmentId);
    if (!master || !asOf) return [];
    const first = rows[0].date;
    const last = rows.at(-1)!;
    const dieselRows = rows.filter((row) => row.dieselActual != null);
    const comparableDieselRows = dieselRows.filter((row) => row.dieselExpected != null);
    const base: EquipmentPerformanceFleetRow = {
      key: `equipment:${equipmentId}`, equipmentId, machine: master.name, registrationNumber: master.registrationNumber ?? null,
      equipmentType: master.equipmentType ?? null, ownership: master.ownership === "hired" ? "hired" : "owned",
      confidence: rows.some((row) => row.confidence === "linked") ? "linked" : "confirmed_legacy_match",
      usageBasis: new Set(rows.map((row) => row.usageBasis)).size === 1 ? rows[0].usageBasis : "mixed",
      currentLocation: last.site ?? last.plant,
      currentStatus: master.isActive === 0
        ? "inactive"
        : last.source === "plant_usage"
          ? input.usages.find((usage) => usage.id === Number(last.key.split(":")[1]))?.status ?? "active"
          : "active",
      firstIncludedDate: first, lastUsedDate: last.date, eventCount: rows.length,
      activeDays: new Set(rows.map((row) => row.date)).size,
      runtimeHours: rows.reduce((n, row) => n + (row.runtimeHours ?? 0), 0),
      totalKm: rows.reduce((n, row) => n + (row.totalKm ?? 0), 0),
      trips: rows.reduce((n, row) => n + (row.trips ?? 0), 0),
      dieselActual: sumNullable(dieselRows, "dieselActual"),
      dieselBasis: aggregateDieselBasis(dieselRows),
      dieselComparedActual: sumNullable(comparableDieselRows, "dieselActual"),
      dieselComparisonIncomplete: comparableDieselRows.length !== dieselRows.length,
      dieselExpected: sumNullable(comparableDieselRows, "dieselExpected"),
      dieselVariance: sumNullable(comparableDieselRows, "dieselVariance"),
      efficiencyPercent: (() => {
        const actual = comparableDieselRows.reduce((n, row) => n + row.dieselActual!, 0);
        const expected = comparableDieselRows.reduce((n, row) => n + row.dieselExpected!, 0);
        return actual > 0 ? expected / actual * 100 : null;
      })(),
      dataQualityWarnings: rowWarnings(rows),
    };
    if (base.ownership === "hired") {
      if (master.hireStartDate && master.hireEndDate) {
        const start = [filters.dateFrom ?? first, master.hireStartDate].sort().at(-1)!;
        const end = [filters.dateTo ?? asOf, master.hireEndDate].sort()[0];
        const elapsedDays = inclusiveDays(start, end);
        const usedDays = new Set(rows.filter((r) => r.date >= start && r.date <= end).map((r) => r.date)).size;
        base.hired = {
          hireStartDate: master.hireStartDate,
          hireEndDate: master.hireEndDate,
          elapsedDays,
          usedDays,
          gapDays: Math.max(0, elapsedDays - usedDays),
          utilizationPercent: elapsedDays ? usedDays / elapsedDays * 100 : 0,
        };
      } else {
        base.dataQualityWarnings.push("Hire start and end dates are required before utilization or gap days can be calculated.");
        base.hired = {
          hireStartDate: master.hireStartDate ?? null,
          hireEndDate: master.hireEndDate ?? null,
          elapsedDays: null,
          usedDays: null,
          gapDays: null,
          utilizationPercent: null,
        };
      }
    } else {
      base.owned = { daysSinceLastUse: dayDifference(last.date, asOf) };
    }
    return [base];
  });
  // Unclassified DPR logs are intentionally represented in fleet as a
  // non-master group, rather than disappearing because equipmentId is null.
  const unclassifiedGroups = new Map<string, EquipmentPerformanceEvent[]>();
  for (const event of filtered.filter((event) => event.confidence === "unclassified")) {
    const key = normalizeEquipmentLabel(event.machine) || "unknown";
    unclassifiedGroups.set(key, [...(unclassifiedGroups.get(key) ?? []), event]);
  }
  for (const [key, rows] of Array.from(unclassifiedGroups.entries())) {
    const last = rows.at(-1)!;
    const dieselRows = rows.filter((row) => row.dieselActual != null);
    const comparableDieselRows = dieselRows.filter((row) => row.dieselExpected != null);
    fleet.push({
      key: `unclassified:${key}`, equipmentId: null, machine: last.machine, registrationNumber: null,
      equipmentType: null, ownership: "unclassified", confidence: "unclassified",
      usageBasis: new Set(rows.map((row) => row.usageBasis)).size === 1 ? rows[0].usageBasis : "mixed",
      currentLocation: last.site ?? last.plant, currentStatus: null,
      firstIncludedDate: rows[0].date, lastUsedDate: last.date, eventCount: rows.length,
      activeDays: new Set(rows.map((row) => row.date)).size,
      runtimeHours: rows.reduce((n, row) => n + (row.runtimeHours ?? 0), 0),
      totalKm: rows.reduce((n, row) => n + (row.totalKm ?? 0), 0),
      trips: rows.reduce((n, row) => n + (row.trips ?? 0), 0),
      dieselActual: sumNullable(dieselRows, "dieselActual"),
      dieselBasis: aggregateDieselBasis(dieselRows),
      dieselComparedActual: sumNullable(comparableDieselRows, "dieselActual"),
      dieselComparisonIncomplete: comparableDieselRows.length !== dieselRows.length,
      dieselExpected: sumNullable(comparableDieselRows, "dieselExpected"),
      dieselVariance: sumNullable(comparableDieselRows, "dieselVariance"),
      efficiencyPercent: (() => {
        const actual = comparableDieselRows.reduce((n, row) => n + row.dieselActual!, 0);
        return actual > 0 ? comparableDieselRows.reduce((n, row) => n + row.dieselExpected!, 0) / actual * 100 : null;
      })(),
      dataQualityWarnings: rowWarnings(rows),
    });
  }
  const total = (field: keyof EquipmentPerformanceEvent) => filtered.reduce((sum, event) => sum + (Number(event[field]) || 0), 0);
  const dieselRows = filtered.filter((event) => event.dieselActual != null);
  const comparableDieselRows = dieselRows.filter((event) => event.dieselExpected != null);
  const totalDieselActual = dieselRows.reduce((sum, event) => sum + event.dieselActual!, 0);
  const totalDieselComparedActual = comparableDieselRows.reduce((sum, event) => sum + event.dieselActual!, 0);
  const totalDieselExpected = comparableDieselRows.reduce((sum, event) => sum + event.dieselExpected!, 0);
  return {
    filterOptions: {
      projects: Array.from(projects.values()).map(({ id, name }) => ({ id, name })),
      ownership: Array.from(new Set((input.filterMasters ?? input.masters).map((m) => m.ownership).filter((v): v is string => !!v))).sort(),
      equipmentTypes: Array.from(new Set((input.filterMasters ?? input.masters).map((m) => m.equipmentType).filter((v): v is string => !!v))).sort(),
      equipment: (input.filterMasters ?? input.masters).map((m) => ({ id: m.id, name: m.name, registrationNumber: m.registrationNumber ?? null })),
      scopes: [
        { value: "site", label: "Site / road operations" },
        { value: "plant", label: "Plant / HMP / RMC operations" },
      ],
    },
    totals: {
      eventCount: filtered.length, linkedCount: filtered.filter((e) => e.confidence === "linked").length,
      confirmedLegacyCount: filtered.filter((e) => e.confidence === "confirmed_legacy_match").length,
      unclassifiedCount: filtered.filter((e) => e.confidence === "unclassified").length,
      runtimeHours: total("runtimeHours"), totalKm: total("totalKm"), trips: total("trips"),
      dieselActual: totalDieselActual, dieselExpected: totalDieselExpected,
      dieselComparedActual: totalDieselComparedActual,
      dieselComparisonIncomplete: comparableDieselRows.length !== dieselRows.length,
      dieselVariance: comparableDieselRows.reduce((sum, event) => sum + event.dieselVariance!, 0),
      activeDays: fleet.reduce((sum, row) => sum + row.activeDays, 0),
      efficiencyPercent: totalDieselComparedActual > 0 ? totalDieselExpected / totalDieselComparedActual * 100 : null,
      dieselBasis: aggregateDieselBasis(dieselRows),
    },
    reviewRows: filtered.filter((e) => e.confidence === "unclassified").map((e) => ({
      logId: e.reference.equipmentLogId!, date: e.date, machine: e.machine, project: e.project,
      site: e.site, usageValue: e.usageValue, suggestions: e.suggestions,
    })),
    events: filtered, fleet, projects: projectRows,
  };
}