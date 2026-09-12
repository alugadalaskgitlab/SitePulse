import { calculateEquipmentClockDuration, computeEquipmentUsage, type UsageBasis } from "./equipmentUsage";

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
  /** Fuel issued/added on this source record; never a consumption fallback. */
  dieselIssued: number | null;
  openingTank: number | null;
  closingTank: number | null;
  /** Individual start-to-end duration; null means the record cannot supply one. */
  clockDuration: number | null;
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
  /** Management-facing period readings and calculations. */
  ownerVendor: string;
  meterUnit: "h" | "km";
  openingMeter: number | null;
  closingMeter: number | null;
  workingHours: number | null;
  workingHoursIncomplete: boolean;
  clockDuration: number | null;
  clockDurationIncomplete: boolean;
  dieselIssued: number | null;
  openingTank: number | null;
  closingTank: number | null;
  dieselConsumed: number | null;
  expectedDiesel: number | null;
  difference: number | null;
  consumptionRate: number | null;
  consumptionRateUnit: "L/hr" | "L/km" | null;
  consumptionIncomplete: boolean;
  /** Precomputed from the full canonical stream; contains selected rows only. */
  dailyRows: EquipmentPerformanceDailyRow[];
}

export interface EquipmentPerformanceDailyRow {
  key: string;
  date: string;
  projectSite: string;
  openingMeter: number | null;
  closingMeter: number | null;
  workingHours: number | null;
  workingHoursIncomplete: boolean;
  startTime: string | null;
  endTime: string | null;
  multipleTimeSegments: boolean;
  clockDuration: number | null;
  clockDurationIncomplete: boolean;
  dieselIssued: number | null;
  openingTank: number | null;
  closingTank: number | null;
  dieselConsumed: number | null;
  expectedDiesel: number | null;
  difference: number | null;
  consumptionRate: number | null;
  consumptionRateUnit: "L/hr" | "L/km" | null;
  consumptionIncomplete: boolean;
  events: EquipmentPerformanceEvent[];
}

export interface EquipmentPerformanceReport {
  filterOptions: {
    projects: Array<{ id: number; name: string }>;
    ownership: string[];
    equipmentTypes: string[];
    equipment: Array<{
      id: number;
      name: string;
      registrationNumber: string | null;
      ownership?: string | null;
      vendorName?: string | null;
      meterType?: string | null;
    }>;
    scopes: Array<{ value: EquipmentScope; label: string }>;
  };
  totals: {
    eventCount: number; linkedCount: number; confirmedLegacyCount: number; unclassifiedCount: number;
    runtimeHours: number; totalKm: number; trips: number; dieselActual: number; dieselExpected: number; dieselVariance: number;
    activeDays: number; efficiencyPercent: number | null; dieselBasis: DieselPerformanceBasis;
    dieselComparedActual: number; dieselComparisonIncomplete: boolean;
  };
  reviewRows: Array<{
    logId: number;
    date: string;
    machine: string;
    project: string;
    site: string | null;
    usageValue: number;
    source: EquipmentEventSource;
    dprId: number | null;
    suggestions: EquipmentSuggestion[];
  }>;
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

function validOperationalTime(value: string | null): value is string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "");
}

/** Date first, then an actual recorded start time.  Record ids never imply order. */
function sortOperationalEvents(rows: EquipmentPerformanceEvent[]): EquipmentPerformanceEvent[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (validOperationalTime(a.startTime) && validOperationalTime(b.startTime) && a.startTime !== b.startTime) {
      return a.startTime.localeCompare(b.startTime);
    }
    return a.key.localeCompare(b.key);
  });
}

function hasAmbiguousSameDayOrdering(rows: EquipmentPerformanceEvent[]): boolean {
  const perDay = new Map<string, EquipmentPerformanceEvent[]>();
  for (const row of rows) perDay.set(row.date, [...(perDay.get(row.date) ?? []), row]);
  return Array.from(perDay.values()).some((dayRows) => {
    if (dayRows.length < 2) return false;
    const times = dayRows.map((row) => row.startTime);
    return times.some((time) => !validOperationalTime(time)) || new Set(times).size !== times.length;
  });
}

function hasOmittedInterveningEvent(
  rows: EquipmentPerformanceEvent[],
  fullEquipmentEvents: EquipmentPerformanceEvent[],
): boolean {
  const orderedRows = sortOperationalEvents(rows);
  const selectedKeys = new Set(orderedRows.map((row) => row.key));
  return fullEquipmentEvents.some((row) =>
    row.date >= orderedRows[0].date && row.date <= orderedRows.at(-1)!.date && !selectedKeys.has(row.key),
  );
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
    const issued = finiteNonnegative(usage.dieselIssued);
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

function firstFinite(rows: EquipmentPerformanceEvent[], field: "openingReading" | "openingTank"): number | null {
  for (const row of rows) {
    const value = finiteNonnegative(row[field]);
    if (value != null) return value;
  }
  return null;
}

function lastFinite(rows: EquipmentPerformanceEvent[], field: "closingReading" | "closingTank"): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = finiteNonnegative(rows[index][field]);
    if (value != null) return value;
  }
  return null;
}

/**
 * Period tank consumption deliberately uses the opening balance from the first
 * included record, every recorded issue in the window, and the closing balance
 * from the last included record.  The two boundary records must each pass the
 * existing confirmed-tank rule; issued fuel is never substituted as actual
 * consumption when they do not.
 */
function managementMetrics(
  rows: EquipmentPerformanceEvent[],
  master: Pick<EquipmentPerformanceMaster, "meterType"> | undefined,
  fullEquipmentEvents: EquipmentPerformanceEvent[] = rows,
  forceConsumptionIncomplete = false,
) {
  const orderedRows = sortOperationalEvents(rows);
  const first = orderedRows[0];
  const last = orderedRows.at(-1)!;
  const hourMeter = master?.meterType !== "odometer";
  const meterUnit: "h" | "km" = hourMeter ? "h" : "km";
  // Working hours are meter-derived. Start/end time is reported separately as
  // clock duration and must never be silently presented as meter working time.
  const hourRows = orderedRows.filter((row) => row.usageBasis === "hour_meter" && row.runtimeHours != null);
  const workingHours = hourMeter && hourRows.length
    ? hourRows.reduce((sum, row) => sum + row.runtimeHours!, 0)
    : null;
  const workingHoursIncomplete = hourMeter && orderedRows.some((row) => row.usageBasis !== "hour_meter" || row.runtimeHours == null);
  const durationRows = orderedRows.filter((row) => row.clockDuration != null);
  const clockDuration = durationRows.length
    ? durationRows.reduce((sum, row) => sum + row.clockDuration!, 0)
    : null;
  const clockDurationIncomplete = durationRows.length > 0 && durationRows.length !== orderedRows.length;
  const issuedValues = orderedRows.map((row) => finiteNonnegative(row.dieselIssued));
  const everyIssuedValid = issuedValues.every((value) => value != null);
  const dieselIssued = everyIssuedValid
    ? issuedValues.reduce((sum, value) => sum + value!, 0)
    : null;
  const firstBoundaryReliable = first.dieselBasis === "tank_measured" && finiteNonnegative(first.openingTank) != null;
  const lastBoundaryReliable = last.dieselBasis === "tank_measured" && finiteNonnegative(last.closingTank) != null;
  const omittedInterveningEvent = hasOmittedInterveningEvent(orderedRows, fullEquipmentEvents);
  const ambiguousOrdering = hasAmbiguousSameDayOrdering(orderedRows);
  const candidateConsumption = firstBoundaryReliable && lastBoundaryReliable && everyIssuedValid && !omittedInterveningEvent && !ambiguousOrdering && !forceConsumptionIncomplete
    ? first.openingTank! + dieselIssued! - last.closingTank!
    : null;
  const dieselConsumed = candidateConsumption != null && candidateConsumption >= 0 ? candidateConsumption : null;
  const expectedDiesel = orderedRows.length && orderedRows.every((row) => row.dieselExpected != null)
    ? orderedRows.reduce((sum, row) => sum + row.dieselExpected!, 0)
    : null;
  const rateUnits = new Set(orderedRows.filter((row) => row.usageValue > 0).map((row) => row.dieselEfficiencyUnit));
  const rateUnit = rateUnits.size === 1 ? Array.from(rateUnits)[0] : null;
  const rateRuntime = rateUnit == null
    ? null
    : orderedRows.filter((row) => row.dieselEfficiencyUnit === rateUnit).reduce((sum, row) => sum + row.usageValue, 0);
  const consumptionRate = dieselConsumed != null && rateUnit != null && rateRuntime != null && rateRuntime > 0
    ? dieselConsumed / rateRuntime
    : null;
  return {
    meterUnit,
    openingMeter: ambiguousOrdering ? null : firstFinite(orderedRows, "openingReading"),
    closingMeter: ambiguousOrdering ? null : lastFinite(orderedRows, "closingReading"),
    workingHours,
    workingHoursIncomplete,
    clockDuration,
    clockDurationIncomplete,
    dieselIssued,
    // Display the same boundary records evaluated for consumption.  Do not
    // jump over an unreliable boundary to make a later tank reading look valid.
    openingTank: ambiguousOrdering ? null : finiteNonnegative(first.openingTank),
    closingTank: ambiguousOrdering ? null : finiteNonnegative(last.closingTank),
    dieselConsumed,
    expectedDiesel,
    difference: dieselConsumed != null && expectedDiesel != null ? dieselConsumed - expectedDiesel : null,
    consumptionRate,
    consumptionRateUnit: consumptionRate == null ? null : rateUnit,
    consumptionIncomplete: dieselConsumed == null,
  };
}

/** Builds daily management rows from an already de-duplicated event list. */
export function buildEquipmentPerformanceDailyRows(
  events: EquipmentPerformanceEvent[],
  master?: Pick<EquipmentPerformanceMaster, "meterType">,
  fullEquipmentEvents: EquipmentPerformanceEvent[] = events,
  forceConsumptionIncomplete = false,
): EquipmentPerformanceDailyRow[] {
  const byDate = new Map<string, EquipmentPerformanceEvent[]>();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  return Array.from(byDate.entries()).map(([date, rows]) => {
    const orderedRows = sortOperationalEvents(rows);
    const metrics = managementMetrics(orderedRows, master, fullEquipmentEvents, forceConsumptionIncomplete);
    const ambiguousOrdering = hasAmbiguousSameDayOrdering(orderedRows);
    const locations = Array.from(new Set(orderedRows.map((row) => [row.project, row.site ?? row.plant].filter(Boolean).join(" / "))));
    return {
      key: `${orderedRows[0].equipmentId ?? "unclassified"}:${date}`,
      date,
      projectSite: locations.join(" · "),
      ...metrics,
      startTime: !ambiguousOrdering && validOperationalTime(orderedRows[0].startTime) ? orderedRows[0].startTime : null,
      endTime: !ambiguousOrdering && validOperationalTime(orderedRows.at(-1)!.endTime) ? orderedRows.at(-1)!.endTime : null,
      multipleTimeSegments: orderedRows.length > 1,
      events: orderedRows,
    };
  });
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
      dieselIssued: finiteNonnegative(usage?.dieselIssued ?? log?.diesel),
      openingTank: finiteNonnegative(usage?.openingDiesel),
      closingTank: finiteNonnegative(usage?.dieselBalanceInTank ?? usage?.closingDiesel),
      clockDuration: calculateEquipmentClockDuration(row.startTime, row.endTime),
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
  const dateWindowEvents = events.filter((event) =>
    (!filters.dateFrom || event.date >= filters.dateFrom) &&
    (!filters.dateTo || event.date <= filters.dateTo),
  );
  // Keep the complete, already de-duplicated identified stream for each
  // equipment in this date window. Project/scope filters must not conceal an
  // intervening event while presenting a tank balance as complete.
  const fullEventsByEquipment = new Map<number, EquipmentPerformanceEvent[]>();
  for (const event of dateWindowEvents) {
    if (event.equipmentId != null) {
      fullEventsByEquipment.set(event.equipmentId, [...(fullEventsByEquipment.get(event.equipmentId) ?? []), event]);
    }
  }
  const filtered = dateWindowEvents.filter((event) =>
    (!filters.projectId || event.projectId === filters.projectId) &&
    (!filters.scope || event.scope === filters.scope) &&
    (!filters.ownership || event.ownership === filters.ownership) &&
    (!filters.equipmentType || event.equipmentType === filters.equipmentType) &&
    (!filters.equipmentId || event.equipmentId === filters.equipmentId) &&
    (!normalizedMachine || normalizeEquipmentLabel(event.machine).includes(normalizedMachine))
  );
  const orderedFiltered = sortOperationalEvents(filtered);

  const projectGroups = new Map<number | null, EquipmentPerformanceEvent[]>();
  for (const event of orderedFiltered) projectGroups.set(event.projectId, [...(projectGroups.get(event.projectId) ?? []), event]);
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
  for (const event of orderedFiltered) if (event.equipmentId != null) byEquipment.set(event.equipmentId, [...(byEquipment.get(event.equipmentId) ?? []), event]);
  const asOf = input.asOfDate ?? filters.dateTo ?? orderedFiltered.at(-1)?.date;
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
    const fullEquipmentRows = fullEventsByEquipment.get(equipmentId) ?? rows;
    const periodHasFilteredGap = hasOmittedInterveningEvent(rows, fullEquipmentRows);
    const dieselRows = rows.filter((row) => row.dieselActual != null);
    const comparableDieselRows = dieselRows.filter((row) => row.dieselExpected != null);
    const base: EquipmentPerformanceFleetRow = {
      key: `equipment:${equipmentId}`, equipmentId, machine: master.name, registrationNumber: master.registrationNumber ?? null,
      equipmentType: master.equipmentType ?? null,
      ownership: master.ownership === "hired" ? "hired" : master.ownership === "owned" ? "owned" : "—",
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
      ownerVendor: master.ownership === "hired"
        ? master.vendorName?.trim() || "—"
        : master.ownership === "owned" ? master.vendorName?.trim() || "HLC / OWNED" : "—",
      ...managementMetrics(rows, master, fullEquipmentRows),
      dailyRows: buildEquipmentPerformanceDailyRows(rows, master, fullEquipmentRows, periodHasFilteredGap),
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
    } else if (base.ownership === "owned") {
      base.owned = { daysSinceLastUse: dayDifference(last.date, asOf) };
    }
    return [base];
  });
  const total = (field: keyof EquipmentPerformanceEvent) => orderedFiltered.reduce((sum, event) => sum + (Number(event[field]) || 0), 0);
  const dieselRows = orderedFiltered.filter((event) => event.dieselActual != null);
  const comparableDieselRows = dieselRows.filter((event) => event.dieselExpected != null);
  const totalDieselActual = dieselRows.reduce((sum, event) => sum + event.dieselActual!, 0);
  const totalDieselComparedActual = comparableDieselRows.reduce((sum, event) => sum + event.dieselActual!, 0);
  const totalDieselExpected = comparableDieselRows.reduce((sum, event) => sum + event.dieselExpected!, 0);
  return {
    filterOptions: {
      projects: Array.from(projects.values()).map(({ id, name }) => ({ id, name })),
      ownership: Array.from(new Set((input.filterMasters ?? input.masters).map((m) => m.ownership).filter((v): v is string => !!v))).sort(),
      equipmentTypes: Array.from(new Set((input.filterMasters ?? input.masters).map((m) => m.equipmentType).filter((v): v is string => !!v))).sort(),
      equipment: (input.filterMasters ?? input.masters).map((m) => ({
        id: m.id,
        name: m.name,
        registrationNumber: m.registrationNumber ?? null,
        ownership: m.ownership ?? null,
        vendorName: m.vendorName ?? null,
        meterType: m.meterType ?? null,
      })),
      scopes: [
        { value: "site", label: "Site / road operations" },
        { value: "plant", label: "Plant / HMP / RMC operations" },
      ],
    },
    totals: {
      eventCount: orderedFiltered.length, linkedCount: orderedFiltered.filter((e) => e.confidence === "linked").length,
      confirmedLegacyCount: orderedFiltered.filter((e) => e.confidence === "confirmed_legacy_match").length,
      unclassifiedCount: orderedFiltered.filter((e) => e.confidence === "unclassified").length,
      runtimeHours: total("runtimeHours"), totalKm: total("totalKm"), trips: total("trips"),
      dieselActual: totalDieselActual, dieselExpected: totalDieselExpected,
      dieselComparedActual: totalDieselComparedActual,
      dieselComparisonIncomplete: comparableDieselRows.length !== dieselRows.length,
      dieselVariance: comparableDieselRows.reduce((sum, event) => sum + event.dieselVariance!, 0),
      activeDays: fleet.reduce((sum, row) => sum + row.activeDays, 0),
      efficiencyPercent: totalDieselComparedActual > 0 ? totalDieselExpected / totalDieselComparedActual * 100 : null,
      dieselBasis: aggregateDieselBasis(dieselRows),
    },
    reviewRows: orderedFiltered.filter((e) => e.confidence === "unclassified").map((e) => ({
      logId: e.reference.equipmentLogId!, date: e.date, machine: e.machine, project: e.project,
      site: e.site, usageValue: e.usageValue, source: e.source, dprId: e.reference.dprId,
      suggestions: e.suggestions,
    })),
    events: orderedFiltered, fleet, projects: projectRows,
  };
}