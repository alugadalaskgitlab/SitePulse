/**
 * Pure hired-equipment statement calculation.  It deliberately has no
 * database dependency: callers pass canonical operational rows and persist
 * the resulting snapshot/exception decisions themselves.
 */
export type HireBillingBasis = "monthly" | "daily" | "hourly" | "trip";
export type MonthlyDivisorType = "calendar" | "30" | "custom";
export type HireExceptionDecision = "full_day" | "half_day" | "none" | "manual";

export interface HireTerms {
  billingBasis: HireBillingBasis;
  rate: number;
  hireStartDate?: string | null;
  hireEndDate?: string | null;
  monthlyDivisorType?: MonthlyDivisorType | null;
  monthlyDivisor?: number | null;
  breakdownDeductionEnabled?: boolean | null;
}

export interface HireUsage {
  id?: number;
  date: string;
  entryType?: string | null;
  hoursOrKmRun?: number | null;
  numberOfTrips?: number | null;
  status?: string | null;
}

export interface HireMaintenance {
  id?: number;
  date: string;
  eventType?: string | null;
  description?: string | null;
  downtimeHours?: number | null;
}

export interface HireExceptionDecisionInput {
  sourceType: "usage" | "maintenance" | "manual";
  sourceId?: number | null;
  exceptionType?: string;
  date?: string;
  decision?: HireExceptionDecision;
  /** Used only when decision is manual. */
  manualDeductionAmount?: number | null;
  remarks?: string | null;
}

export interface HireDailyDecision {
  date: string;
  decision: "full_day" | "half_day" | "exclude";
  reason?: string | null;
}

export interface HireBillingException {
  sourceType: "usage" | "maintenance" | "manual";
  sourceId?: number;
  exceptionType: "open_usage" | "missing_hours" | "invalid_trips" | "breakdown" | "manual";
  date?: string;
  description: string;
  downtimeHours?: number;
  decision?: HireExceptionDecision;
  manualDeductionAmount?: number;
  deductionAmount: number;
}

export interface HireBillingInput {
  terms: HireTerms;
  periodFrom: string;
  periodTo: string;
  usage?: readonly HireUsage[];
  maintenance?: readonly HireMaintenance[];
  /** Daily attendance defaults to full; this is its explicit half-day override. */
  dailyDecisions?: readonly HireDailyDecision[];
  exceptionDecisions?: readonly HireExceptionDecisionInput[];
}

export interface HireBillingResult {
  periodFrom: string;
  periodTo: string;
  billablePeriodFrom?: string;
  billablePeriodTo?: string;
  quantity: number;
  payableDays: readonly { date: string; fraction: 1 | 0.5 | 0; reason?: string }[];
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  exceptions: HireBillingException[];
  requiresReview: boolean;
  /** The only permitted lifecycle for this calculated statement. */
  workflow: readonly ("draft" | "reviewed" | "approved" | "billed")[];
}

export function planHireRegisterRows<
  TStatement extends { equipmentId: number; periodFrom: string; periodTo: string },
  TEquipment extends { id: number; hireStartDate?: string | null; hireEndDate?: string | null },
>(
  statements: readonly TStatement[],
  configuredEquipment: readonly TEquipment[],
  periodFrom: string,
  periodTo: string,
): { persistedStatements: TStatement[]; transientEquipment: TEquipment[] } {
  const persistedStatements = statements.filter(statement =>
    statement.periodFrom <= periodTo && statement.periodTo >= periodFrom
  );
  const equipmentWithStatement = new Set(persistedStatements.map(statement => statement.equipmentId));
  const transientEquipment = configuredEquipment.filter(equipment =>
    !equipmentWithStatement.has(equipment.id) &&
    (!equipment.hireStartDate || equipment.hireStartDate <= periodTo) &&
    (!equipment.hireEndDate || equipment.hireEndDate >= periodFrom)
  );
  return { persistedStatements, transientEquipment };
}

const DAY_MS = 86_400_000;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dateAtUtc = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
const iso = (value: number) => new Date(value).toISOString().slice(0, 10);
const isValidDate = (value: string | null | undefined) =>
  typeof value === "string" && Number.isFinite(dateAtUtc(value));
const overlap = (date: string, from: number, to: number) =>
  isValidDate(date) && dateAtUtc(date) >= from && dateAtUtc(date) <= to;

function exceptionKey(value: Pick<HireBillingException, "sourceType" | "sourceId" | "exceptionType" | "date">) {
  return `${value.sourceType}:${value.sourceId ?? ""}:${value.exceptionType}:${value.date ?? ""}`;
}

function monthlyGross(from: number, to: number, terms: HireTerms): number {
  let result = 0;
  let cursor = from;
  while (cursor <= to) {
    const start = new Date(cursor);
    const monthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
    const nextMonth = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    const monthEnd = nextMonth - DAY_MS;
    const segmentEnd = Math.min(to, monthEnd);
    const days = Math.round((segmentEnd - cursor) / DAY_MS) + 1;
    const daysInMonth = Math.round((monthEnd - monthStart) / DAY_MS) + 1;
    // A complete calendar month always earns its agreed monthly rate.  The
    // divisor applies only to a partial month, avoiding a 31/30 overcharge.
    if (cursor === monthStart && segmentEnd === monthEnd) result += terms.rate;
    else {
      const divisor = terms.monthlyDivisorType === "calendar"
        ? daysInMonth
        : terms.monthlyDivisorType === "custom" && (terms.monthlyDivisor ?? 0) > 0
          ? terms.monthlyDivisor!
          : 30;
      result += terms.rate * days / divisor;
    }
    cursor = segmentEnd + DAY_MS;
  }
  return money(result);
}

function monthlyDailyRate(date: string | undefined, terms: HireTerms): number {
  if (terms.monthlyDivisorType === "custom" && (terms.monthlyDivisor ?? 0) > 0) return terms.rate / terms.monthlyDivisor!;
  if (terms.monthlyDivisorType === "calendar" && date && isValidDate(date)) {
    const value = new Date(dateAtUtc(date));
    return terms.rate / new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  }
  return terms.rate / 30;
}

/** Calculates a constrained statement without mutating any supplied record. */
export function calculateHireBilling(input: HireBillingInput): HireBillingResult {
  const { terms } = input;
  if (!isValidDate(input.periodFrom) || !isValidDate(input.periodTo)) throw new Error("A valid statement period is required.");
  if (dateAtUtc(input.periodFrom) > dateAtUtc(input.periodTo)) throw new Error("Statement periodFrom must be on or before periodTo.");
  if (!Number.isFinite(terms.rate) || terms.rate < 0) throw new Error("Hire rate must be a non-negative number.");

  if ((terms.hireStartDate && !isValidDate(terms.hireStartDate)) || (terms.hireEndDate && !isValidDate(terms.hireEndDate))) throw new Error("Hire dates must be valid ISO dates.");
  const constrainedFrom = Math.max(dateAtUtc(input.periodFrom), terms.hireStartDate ? dateAtUtc(terms.hireStartDate) : -Infinity);
  const constrainedTo = Math.min(dateAtUtc(input.periodTo), terms.hireEndDate ? dateAtUtc(terms.hireEndDate) : Infinity);
  if (constrainedFrom > constrainedTo) {
    return { periodFrom: input.periodFrom, periodTo: input.periodTo, quantity: 0, payableDays: [], grossAmount: 0, deductionAmount: 0, netAmount: 0, exceptions: [], requiresReview: false, workflow: ["draft", "approved", "billed"] };
  }

  const periodUsage = (input.usage ?? []).filter(row => overlap(row.date, constrainedFrom, constrainedTo));
  const exceptions: HireBillingException[] = [];
  const usage = periodUsage.filter(row => {
    if (terms.billingBasis === "monthly" || row.status !== "open") return true;
    exceptions.push({
      sourceType: "usage",
      sourceId: row.id,
      exceptionType: "open_usage",
      date: row.date,
      description: "Open equipment movement/usage is not billable until it is closed.",
      deductionAmount: 0,
    });
    return false;
  });
  let payableDays: { date: string; fraction: 1 | 0.5 | 0; reason?: string }[] = [];
  let quantity = 0;
  let grossAmount = 0;

  if (terms.billingBasis === "monthly") {
    quantity = 1;
    grossAmount = monthlyGross(constrainedFrom, constrainedTo, terms);
  } else if (terms.billingBasis === "daily") {
    // Segments entered on the same operational date are one payable day.
    const decisions = new Map((input.dailyDecisions ?? []).map(value => [value.date, value]));
    payableDays = Array.from(new Set(usage.map(row => row.date.slice(0, 10)))).sort().map(date => {
      const decision = decisions.get(date);
      return { date, fraction: decision?.decision === "exclude" ? 0 : decision?.decision === "half_day" ? 0.5 : 1, reason: decision?.reason ?? undefined };
    });
    quantity = payableDays.reduce((total, day) => total + day.fraction, 0);
    grossAmount = money(quantity * terms.rate);
  } else if (terms.billingBasis === "hourly") {
    for (const row of usage) {
      if (typeof row.hoursOrKmRun === "number" && Number.isFinite(row.hoursOrKmRun) && row.hoursOrKmRun > 0) quantity += row.hoursOrKmRun;
      else exceptions.push({ sourceType: "usage", sourceId: row.id, exceptionType: "missing_hours", date: row.date, description: "Usage has missing or nonpositive reliable hours/KM.", deductionAmount: 0 });
    }
    grossAmount = money(quantity * terms.rate);
  } else {
    for (const row of usage) {
      if (row.entryType === "trip_based" && typeof row.numberOfTrips === "number" && Number.isFinite(row.numberOfTrips) && row.numberOfTrips > 0) quantity += row.numberOfTrips;
      else exceptions.push({ sourceType: "usage", sourceId: row.id, exceptionType: "invalid_trips", date: row.date, description: "Only trip_based usage with a positive numberOfTrips is billable.", deductionAmount: 0 });
    }
    grossAmount = money(quantity * terms.rate);
  }

  for (const row of input.maintenance ?? []) {
    if (row.eventType === "breakdown" && overlap(row.date, constrainedFrom, constrainedTo)) {
      exceptions.push({ sourceType: "maintenance", sourceId: row.id, exceptionType: "breakdown", date: row.date, description: row.description || "Equipment breakdown requires review.", downtimeHours: row.downtimeHours ?? undefined, deductionAmount: 0 });
    }
  }

  // A reviewer may add a non-derived exception (for example an agreed
  // contractual deduction).  Operational exceptions are never fabricated.
  for (const decision of input.exceptionDecisions ?? []) {
    if (decision.sourceType === "manual") {
      if (!decision.date || !overlap(decision.date, constrainedFrom, constrainedTo)) {
        throw Object.assign(new Error("Manual exception dates must fall within the active billed period."), { code: "BAD_REQUEST" });
      }
      exceptions.push({
        sourceType: "manual",
        sourceId: decision.sourceId ?? undefined,
        exceptionType: "manual",
        date: decision.date,
        description: decision.remarks || "Manual hire billing exception.",
        deductionAmount: 0,
      });
    }
  }

  const decisionByKey = new Map((input.exceptionDecisions ?? []).map(value => [
    exceptionKey({ sourceType: value.sourceType, sourceId: value.sourceId ?? undefined, exceptionType: (value.exceptionType ?? "manual") as HireBillingException["exceptionType"], date: value.date }),
    value,
  ]));
  let deductionAmount = 0;
  for (const item of exceptions) {
    const decision = decisionByKey.get(exceptionKey(item));
    if (!decision) continue;
    item.decision = decision.decision;
    item.manualDeductionAmount = decision.manualDeductionAmount ?? undefined;
    const breakdownBlocked = item.exceptionType === "breakdown" && !terms.breakdownDeductionEnabled;
    const dailyDeduction = breakdownBlocked ? 0 : terms.billingBasis === "monthly" ? monthlyDailyRate(item.date, terms) : terms.rate;
    item.deductionAmount = breakdownBlocked
      ? 0
      : money(decision.decision === "full_day" ? dailyDeduction : decision.decision === "half_day" ? dailyDeduction / 2 : decision.decision === "manual" ? Math.max(0, decision.manualDeductionAmount ?? 0) : 0);
    deductionAmount += item.deductionAmount;
  }
  deductionAmount = money(Math.min(grossAmount, deductionAmount));
  return {
    periodFrom: input.periodFrom, periodTo: input.periodTo, billablePeriodFrom: iso(constrainedFrom), billablePeriodTo: iso(constrainedTo),
    quantity, payableDays, grossAmount, deductionAmount, netAmount: money(Math.max(0, grossAmount - deductionAmount)),
    exceptions, requiresReview: exceptions.length > 0,
    workflow: exceptions.length ? ["draft", "reviewed", "approved", "billed"] : ["draft", "approved", "billed"],
  };
}

/** A stable, source-qualified activity contract for Vendor Bill hire groups. */
export type HireActivitySource = "dpr_log" | "plant_usage" | "equipment_default";
export interface HireActivity {
  source: HireActivitySource;
  sourceId: number;
  equipmentId: number;
  businessDate: string;
  entryType?: string | null;
  status?: string | null;
  numberOfTrips?: number | null;
  hoursOrKmRun?: number | null;
  /** A DPR row is a mirror only when this explicit link is present. */
  plantUsageId?: number | null;
  actualDiesel?: number | null;
  expectedDiesel?: number | null;
  consumptionNorm?: number | null;
  normBasis?: string | null;
  task?: string | null;
  site?: string | null;
  equipmentName?: string | null;
  openingReading?: number | null;
  closingReading?: number | null;
  movementReference?: string | null;
}
export interface HireTripDecision {
  source: HireActivitySource;
  sourceId: number;
  selected?: boolean;
  correctedTrips?: number;
  remarks?: string | null;
}
export interface HireDieselRecoveryDecision {
  decision?: "accept" | "edit" | "ignore";
  /** Required for accept/edit; recovery is never implicitly posted. */
  finalAmount?: number | null;
  remarks?: string | null;
}
export interface HireDieselPurchasePrice {
  id: number;
  date: string;
  rate: number;
  qtyPurchased: number;
  purchasedAt?: string | null;
}
export interface HireDailyDieselPricing {
  date: string;
  actualDiesel: number;
  expectedDiesel: number;
  /** Signed audit variance. Negative values offset positive values period-wide. */
  variance: number;
  /** Backward-compatible alias for variance; no longer positive-only. */
  excessLitres: number;
  applicableRate?: number;
  rateDate?: string;
  suggestedRecovery?: number;
  purchaseSources: readonly {
    id: number;
    date: string;
    rate: number;
    qtyPurchased: number;
    purchasedAt?: string | null;
  }[];
}
export interface HireActivityDay {
  date: string;
  activity: "worked" | "no_activity" | "breakdown";
  hours: number;
  trips: number;
  actualDiesel: number;
  expectedDiesel: number;
  dieselVariance: number;
  downtimeHours: number;
  activityCount: number;
  billableActivityCount: number;
  openActivityCount: number;
  equipmentNames: readonly string[];
  siteLocations: readonly string[];
  activityDescriptions: readonly string[];
  openingReadings: readonly number[];
  closingReadings: readonly number[];
  maintenanceDescriptions: readonly string[];
  movementReferences: readonly string[];
}
export interface HireGroupCalculationInput {
  terms: HireTerms;
  periodFrom: string;
  periodTo: string;
  activities: readonly HireActivity[];
  maintenance?: readonly HireMaintenance[];
  dailyDecisions?: readonly HireDailyDecision[];
  exceptionDecisions?: readonly HireExceptionDecisionInput[];
  tripDecisions?: readonly HireTripDecision[];
  quantityOverride?: number;
  grossAmountOverride?: number;
  dieselNormOverride?: number | null;
  dieselNormBasisOverride?: string | null;
  dieselPurchases?: readonly HireDieselPurchasePrice[];
  dieselRecovery?: HireDieselRecoveryDecision;
}
export interface HireGroupCalculationResult extends HireBillingResult {
  activityIds: readonly string[];
  measurementPeriodFrom?: string;
  measurementPeriodTo?: string;
  decisions: {
    daily: readonly HireDailyDecision[];
    trip: readonly (HireTripDecision & {
      businessDate: string;
      recordedTrips: number;
      acceptedTrips: number;
    })[];
  };
  diesel: {
    actualDiesel: number;
    expectedDiesel: number;
    consumptionNorm?: number;
    normBasis?: string;
    suggestedExcess: number;
    applicableRate?: number;
    rateUnavailable: boolean;
    suggestedRecoveryAmount?: number;
    dailyPricing: readonly HireDailyDieselPricing[];
    unpricedActualDates: readonly string[];
    recoveryDecision?: "accept" | "edit" | "ignore";
    finalRecoveryAmount: number;
    remarks?: string | null;
  };
  workingSheet: readonly HireActivityDay[];
  calculatedQuantity: number;
  calculatedGrossAmount: number;
  netAmount: number;
}

export interface RawAutoBillItem {
  source?: string | null;
  equipmentId?: number | null;
  date?: string | null;
}

export interface HireGroupCoverage {
  equipmentId: number;
  periodFrom: string;
  periodTo: string;
}

/** Narrow 07C-HF1 matcher: manual and non-equipment lines are never covered. */
export function rawAutoItemCoveredByHireGroup(
  item: RawAutoBillItem,
  groups: readonly HireGroupCoverage[] | null | undefined,
): HireGroupCoverage | undefined {
  if ((item.source || "").toLowerCase() !== "auto" || item.equipmentId == null || !item.date) return undefined;
  return groups?.find(group =>
    Number(item.equipmentId) === Number(group.equipmentId) &&
    item.date! >= group.periodFrom &&
    item.date! <= group.periodTo
  );
}

/** Returns the review decisions still required before a linked bill can advance. */
export function getHireReviewGaps(snapshot: Partial<HireGroupCalculationResult> | null | undefined): string[] {
  if (!snapshot) return ["calculation snapshot"];
  const gaps = (snapshot.exceptions ?? [])
    .filter(exception => !exception.decision)
    .map(exception => `${exception.exceptionType} on ${exception.date || "unknown date"}`);
  if ((snapshot.diesel?.suggestedExcess ?? 0) > 0 && !snapshot.diesel?.recoveryDecision) {
    gaps.push("HSD recovery disposition");
  }
  return gaps;
}

export const hireActivityIdentity = (activity: Pick<HireActivity, "source" | "sourceId">) =>
  `${activity.source}:${activity.sourceId}`;

/**
 * Canonically de-duplicates only an explicitly mirrored DPR/plant usage pair.
 * Same-date independent records are retained for trip billing; daily billing
 * collapses dates in calculateHireBilling.
 */
export function normalizeHireActivities(activities: readonly HireActivity[]): HireActivity[] {
  const selectedPlantIds = new Set(activities.filter(a => a.source === "plant_usage").map(a => a.sourceId));
  const seen = new Set<string>();
  return activities.filter(activity => {
    if (activity.source === "dpr_log" && activity.plantUsageId && selectedPlantIds.has(activity.plantUsageId)) return false;
    const key = hireActivityIdentity(activity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.businessDate.localeCompare(b.businessDate) || hireActivityIdentity(a).localeCompare(hireActivityIdentity(b)));
}

/** Day-wise evidence projection. No-activity rows are informational, never deductions. */
export function buildHireActivityDays(
  periodFrom: string,
  periodTo: string,
  activities: readonly HireActivity[],
  maintenance: readonly HireMaintenance[] = [],
): HireActivityDay[] {
  if (!isValidDate(periodFrom) || !isValidDate(periodTo) || dateAtUtc(periodFrom) > dateAtUtc(periodTo)) return [];
  const normalized = normalizeHireActivities(activities).filter(activity =>
    (activity.source === "dpr_log" || activity.source === "plant_usage") &&
    activity.businessDate >= periodFrom && activity.businessDate <= periodTo
  );
  const days: HireActivityDay[] = [];
  for (let cursor = dateAtUtc(periodFrom); cursor <= dateAtUtc(periodTo); cursor += DAY_MS) {
    const date = iso(cursor);
    const dayActivities = normalized.filter(activity => activity.businessDate === date);
    const breakdowns = maintenance.filter(row =>
      row.date.slice(0, 10) === date && (row.eventType || "").toLowerCase() === "breakdown"
    );
    days.push({
      date,
      activity: breakdowns.length ? "breakdown" : dayActivities.length ? "worked" : "no_activity",
      hours: money(dayActivities.reduce((sum, row) => sum + (Number(row.hoursOrKmRun) || 0), 0)),
      trips: money(dayActivities.reduce((sum, row) => sum + (Number(row.numberOfTrips) || 0), 0)),
      actualDiesel: money(dayActivities.reduce((sum, row) => sum + (Number(row.actualDiesel) || 0), 0)),
      expectedDiesel: money(dayActivities.reduce((sum, row) => sum + (Number(row.expectedDiesel) || 0), 0)),
      dieselVariance: money(
        dayActivities.reduce((sum, row) => sum + (Number(row.actualDiesel) || 0), 0) -
        dayActivities.reduce((sum, row) => sum + (Number(row.expectedDiesel) || 0), 0)
      ),
      downtimeHours: money(breakdowns.reduce((sum, row) => sum + (Number(row.downtimeHours) || 0), 0)),
      activityCount: dayActivities.length,
      billableActivityCount: dayActivities.filter(row => row.status !== "open").length,
      openActivityCount: dayActivities.filter(row => row.status === "open").length,
      equipmentNames: Array.from(new Set(dayActivities.map(row => row.equipmentName).filter((value): value is string => !!value))),
      siteLocations: Array.from(new Set(dayActivities.map(row => row.site).filter((value): value is string => !!value))),
      activityDescriptions: Array.from(new Set(dayActivities.map(row => row.task).filter((value): value is string => !!value))),
      openingReadings: Array.from(new Set(dayActivities.map(row => row.openingReading).filter((value): value is number => Number.isFinite(value)))),
      closingReadings: Array.from(new Set(dayActivities.map(row => row.closingReading).filter((value): value is number => Number.isFinite(value)))),
      maintenanceDescriptions: breakdowns.map(row => row.description || "BREAKDOWN"),
      movementReferences: Array.from(new Set(dayActivities.map(row => row.movementReference).filter((value): value is string => !!value))),
    });
  }
  return days;
}

/** Prices positive daily excess only from same-day or latest-prior purchases. */
export function calculateHireDieselPricing(
  activities: readonly HireActivity[],
  purchases: readonly HireDieselPurchasePrice[] = [],
  periodFrom?: string,
  periodTo?: string,
): {
  actualDiesel: number;
  expectedDiesel: number;
  suggestedExcess: number;
  applicableRate?: number;
  rateUnavailable: boolean;
  suggestedRecoveryAmount?: number;
  dailyPricing: HireDailyDieselPricing[];
  unpricedActualDates: string[];
} {
  const activityRows = normalizeHireActivities(activities).filter(activity =>
    (activity.source === "dpr_log" || activity.source === "plant_usage") &&
    (!periodFrom || activity.businessDate >= periodFrom) &&
    (!periodTo || activity.businessDate <= periodTo)
  );
  const byActivityDate = new Map<string, HireActivity[]>();
  for (const activity of activityRows) {
    const rows = byActivityDate.get(activity.businessDate) ?? [];
    rows.push(activity);
    byActivityDate.set(activity.businessDate, rows);
  }
  const validPurchases = purchases.filter(purchase =>
    isValidDate(purchase.date) &&
    Number.isFinite(purchase.rate) && purchase.rate > 0 &&
    Number.isFinite(purchase.qtyPurchased) && purchase.qtyPurchased > 0
  );
  const purchaseDates = Array.from(new Set(validPurchases.map(purchase => purchase.date.slice(0, 10)))).sort();
  const dailyPricing = Array.from(byActivityDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const actualDiesel = money(rows.reduce((sum, row) => sum + (Number(row.actualDiesel) || 0), 0));
    const expectedDiesel = money(rows.reduce((sum, row) => sum + (Number(row.expectedDiesel) || 0), 0));
    const variance = money(actualDiesel - expectedDiesel);
    const excessLitres = variance;
    const rateDate = purchaseDates.filter(purchaseDate => purchaseDate <= date).at(-1);
    const purchaseSources = rateDate
      ? validPurchases.filter(purchase => purchase.date.slice(0, 10) === rateDate).map(purchase => ({
          id: purchase.id,
          date: purchase.date.slice(0, 10),
          rate: purchase.rate,
          qtyPurchased: purchase.qtyPurchased,
          purchasedAt: purchase.purchasedAt ?? undefined,
        }))
      : [];
    const totalQty = purchaseSources.reduce((sum, purchase) => sum + purchase.qtyPurchased, 0);
    const applicableRate = actualDiesel > 0 && totalQty > 0
      ? Math.round((purchaseSources.reduce((sum, purchase) => sum + purchase.rate * purchase.qtyPurchased, 0) / totalQty) * 10_000) / 10_000
      : undefined;
    return {
      date,
      actualDiesel,
      expectedDiesel,
      variance,
      excessLitres,
      applicableRate,
      rateDate: applicableRate !== undefined ? rateDate : undefined,
      suggestedRecovery: undefined,
      purchaseSources: applicableRate !== undefined ? purchaseSources : [],
    };
  });
  const actualDiesel = money(dailyPricing.reduce((sum, day) => sum + day.actualDiesel, 0));
  const expectedDiesel = money(dailyPricing.reduce((sum, day) => sum + day.expectedDiesel, 0));
  const suggestedExcess = money(Math.max(0, actualDiesel - expectedDiesel));
  const actualDays = dailyPricing.filter(day => day.actualDiesel > 0);
  const pricedActualDays = actualDays.filter(day => day.applicableRate !== undefined);
  const unpricedActualDates = actualDays.filter(day => day.applicableRate === undefined).map(day => day.date);
  const pricedActualLitres = pricedActualDays.reduce((sum, day) => sum + day.actualDiesel, 0);
  const applicableRate = pricedActualLitres > 0
    ? Math.round((pricedActualDays.reduce((sum, day) => sum + day.actualDiesel * day.applicableRate!, 0) / pricedActualLitres) * 10_000) / 10_000
    : undefined;
  const rateUnavailable = applicableRate === undefined;
  for (const day of dailyPricing) {
    // This is audit-only: recovery is period-net and has no per-day allocation.
    day.suggestedRecovery = undefined;
  }
  return {
    actualDiesel,
    expectedDiesel,
    suggestedExcess,
    applicableRate,
    rateUnavailable,
    suggestedRecoveryAmount: suggestedExcess === 0 ? 0 : applicableRate === undefined ? undefined : money(suggestedExcess * applicableRate),
    dailyPricing,
    unpricedActualDates,
  };
}

/** Calculates a bill-group snapshot using the existing statement calculator. */
export function calculateHireGroup(input: HireGroupCalculationInput): HireGroupCalculationResult {
  const periodActivities = normalizeHireActivities(input.activities).filter(a =>
    (a.source === "dpr_log" || a.source === "plant_usage") &&
    a.businessDate >= input.periodFrom && a.businessDate <= input.periodTo
  );
  const decisionMap = new Map((input.tripDecisions ?? []).map(d => [`${d.source}:${d.sourceId}`, d]));
  const usage: HireUsage[] = periodActivities.map(activity => {
    const decision = decisionMap.get(hireActivityIdentity(activity));
    // No inferred trips: only selected positive stored/corrected values reach
    // the shared trip calculator.
    const trips = decision?.selected === false ? 0
      : decision?.correctedTrips !== undefined ? decision.correctedTrips
      : activity.numberOfTrips;
    return { id: activity.sourceId, date: activity.businessDate, entryType: activity.entryType,
      status: activity.status, hoursOrKmRun: activity.hoursOrKmRun, numberOfTrips: trips };
  });
  const calculated = calculateHireBilling({ terms: input.terms, periodFrom: input.periodFrom, periodTo: input.periodTo,
    usage, maintenance: input.maintenance, dailyDecisions: input.dailyDecisions, exceptionDecisions: input.exceptionDecisions });
  const measurementPeriodFrom = input.terms.hireStartDate && input.terms.hireStartDate > input.periodFrom
    ? input.terms.hireStartDate : input.periodFrom;
  const measurementPeriodTo = input.terms.hireEndDate && input.terms.hireEndDate < input.periodTo
    ? input.terms.hireEndDate : input.periodTo;
  const hasMeasurementPeriod = measurementPeriodFrom <= measurementPeriodTo;
  const activities = hasMeasurementPeriod
    ? periodActivities.filter(activity => activity.businessDate >= measurementPeriodFrom && activity.businessDate <= measurementPeriodTo)
    : [];
  const quantity = input.quantityOverride !== undefined ? input.quantityOverride : calculated.quantity;
  const grossAmount = input.grossAmountOverride !== undefined ? input.grossAmountOverride
    : input.quantityOverride !== undefined ? money(quantity * input.terms.rate) : calculated.grossAmount;
  const deductionAmount = money(Math.min(grossAmount, calculated.deductionAmount));
  const dieselPricing = calculateHireDieselPricing(
    activities, input.dieselPurchases,
    hasMeasurementPeriod ? measurementPeriodFrom : input.periodFrom,
    hasMeasurementPeriod ? measurementPeriodTo : input.periodTo,
  );
  const workingSheet = hasMeasurementPeriod
    ? buildHireActivityDays(measurementPeriodFrom, measurementPeriodTo, activities, input.maintenance)
    : [];
  const recovery = input.dieselRecovery;
  if (recovery?.decision === "accept" && dieselPricing.suggestedRecoveryAmount === undefined) {
    throw new Error("A suggested diesel recovery cannot be accepted because the applicable HSD rate is unavailable.");
  }
  if (recovery?.decision === "edit" &&
      (!Number.isFinite(recovery.finalAmount) || (recovery.finalAmount ?? 0) < 0)) {
    throw new Error("An explicit non-negative diesel recovery amount is required.");
  }
  const finalRecoveryAmount = recovery?.decision === "accept"
    ? dieselPricing.suggestedRecoveryAmount!
    : recovery?.decision === "edit" ? money(recovery.finalAmount!) : 0;
  return {
    ...calculated, quantity, grossAmount, deductionAmount,
    calculatedQuantity: calculated.quantity, calculatedGrossAmount: calculated.grossAmount,
    netAmount: money(Math.max(0, grossAmount - deductionAmount - finalRecoveryAmount)),
    activityIds: activities.map(hireActivityIdentity),
    measurementPeriodFrom: hasMeasurementPeriod ? measurementPeriodFrom : undefined,
    measurementPeriodTo: hasMeasurementPeriod ? measurementPeriodTo : undefined,
    decisions: {
      daily: calculated.payableDays.map(day => ({
        date: day.date,
        decision: day.fraction === 0 ? "exclude" : day.fraction === 0.5 ? "half_day" : "full_day",
        reason: day.reason,
      })),
      trip: activities.filter(activity => activity.entryType === "trip_based").map(activity => {
        const decision = decisionMap.get(hireActivityIdentity(activity));
        const recordedTrips = Number(activity.numberOfTrips) || 0;
        const acceptedTrips = decision?.selected === false ? 0 : Number(decision?.correctedTrips ?? recordedTrips) || 0;
        return {
          source: activity.source,
          sourceId: activity.sourceId,
          businessDate: activity.businessDate,
          selected: decision?.selected !== false,
          correctedTrips: decision?.correctedTrips,
          remarks: decision?.remarks,
          recordedTrips,
          acceptedTrips,
        };
      }),
    },
    workingSheet,
    diesel: { ...dieselPricing,
      consumptionNorm: input.dieselNormOverride ?? activities.find(a => a.consumptionNorm != null)?.consumptionNorm ?? undefined,
      normBasis: input.dieselNormBasisOverride ?? activities.find(a => a.normBasis)?.normBasis ?? undefined,
      recoveryDecision: recovery?.decision, finalRecoveryAmount, remarks: recovery?.remarks ?? undefined },
  };
}