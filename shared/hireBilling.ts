/**
 * Pure hired-equipment statement calculation.  It deliberately has no
 * database dependency: callers pass canonical operational rows and persist
 * the resulting snapshot/exception decisions themselves.
 */
export type HireBillingBasis = "monthly" | "daily" | "hourly" | "trip";
export type MonthlyDivisorType = "calendar" | "30" | "custom";
export type HireExceptionDecision = "full_day" | "half_day" | "hours" | "none" | "manual";

export interface HireTerms {
  billingBasis: HireBillingBasis;
  rate: number;
  hireStartDate?: string | null;
  hireEndDate?: string | null;
  monthlyDivisorType?: MonthlyDivisorType | null;
  monthlyDivisor?: number | null;
  breakdownDeductionEnabled?: boolean | null;
  dieselResponsibility?: "hlc" | "vendor" | string | null;
  /**
   * An expressly chosen commercial day length for a breakdown calculation.
   * It is deliberately never defaulted: a bill reviewer must select 10–12
   * hours when using an actual downtime-hours deduction.
   */
  breakdownHoursPerDay?: number | null;
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
  suggestedDeductionAmount?: number;
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

/** The common date-overlap rule for an existing hire agreement. */
export function hirePeriodOverlaps(
  equipment: { hireStartDate?: string | null; hireEndDate?: string | null },
  periodFrom: string,
  periodTo: string,
): boolean {
  return (!equipment.hireStartDate || equipment.hireStartDate <= periodTo) &&
    (!equipment.hireEndDate || equipment.hireEndDate >= periodFrom);
}

/**
 * Normal vendor-bill discovery is intentionally stricter than the register:
 * a hire must have actually started, and must have a usable commercial basis
 * and rate.  The register retains its legacy treatment of a blank start date.
 */
export function isEquipmentHireBillEligible(
  equipment: {
    ownership?: string | null;
    vendorName?: string | null;
    hireBillingBasis?: string | null;
    hireRate?: number | null;
    hireStartDate?: string | null;
    hireEndDate?: string | null;
  },
  periodFrom: string,
  periodTo: string,
): boolean {
  return equipment.ownership === "hired" &&
    !!equipment.vendorName?.trim() &&
    ["monthly", "daily", "hourly", "trip"].includes(String(equipment.hireBillingBasis || "").toLowerCase()) &&
    Number.isFinite(Number(equipment.hireRate)) && Number(equipment.hireRate) > 0 &&
    !!equipment.hireStartDate &&
    (!equipment.hireEndDate || equipment.hireStartDate <= equipment.hireEndDate) &&
    hirePeriodOverlaps(equipment, periodFrom, periodTo);
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
    hirePeriodOverlaps(equipment, periodFrom, periodTo)
  );
  return { persistedStatements, transientEquipment };
}

const DAY_MS = 86_400_000;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * The one commercial sequence for the equipment-hire straight form.  It is
 * deliberately independent of vendor-bill item rows: those are presentation
 * lines, while these saved figures are the approval/export source of truth.
 * TDS remains on the pre-GST taxable amount, matching the established vendor
 * bill calculation.
 */
export interface EquipmentHireFinancialInput {
  grossHire: number;
  breakdownDeduction?: number | null;
  hsdRecovery?: number | null;
  otherDebit?: number | null;
  advanceAdjustment?: number | null;
  otherCredit?: number | null;
  gstRate?: number | null;
  tdsRate?: number | null;
  paid?: number | null;
}

export interface EquipmentHireFinancials {
  grossHire: number;
  breakdownDeduction: number;
  hsdRecovery: number;
  otherDebit: number;
  advanceAdjustment: number;
  otherCredit: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  invoiceTotal: number;
  tdsRate: number;
  tdsAmount: number;
  netPayable: number;
  paid: number;
  balanceThisBill: number;
}

export function calculateEquipmentHireFinancials(input: EquipmentHireFinancialInput): EquipmentHireFinancials {
  const nonNegative = (value: number | null | undefined) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const grossHire = money(nonNegative(input.grossHire));
  const breakdownDeduction = money(nonNegative(input.breakdownDeduction));
  const hsdRecovery = money(nonNegative(input.hsdRecovery));
  const otherDebit = money(nonNegative(input.otherDebit));
  const advanceAdjustment = money(nonNegative(input.advanceAdjustment));
  const otherCredit = money(nonNegative(input.otherCredit));
  const gstRate = money(nonNegative(input.gstRate));
  const tdsRate = money(nonNegative(input.tdsRate));
  const taxableAmount = money(Math.max(0, grossHire - breakdownDeduction - hsdRecovery - otherDebit - advanceAdjustment + otherCredit));
  const gstAmount = money(taxableAmount * gstRate / 100);
  const invoiceTotal = money(taxableAmount + gstAmount);
  const tdsAmount = money(taxableAmount * tdsRate / 100);
  const netPayable = money(invoiceTotal - tdsAmount);
  const paid = money(nonNegative(input.paid));
  return {
    grossHire, breakdownDeduction, hsdRecovery, otherDebit, advanceAdjustment, otherCredit,
    taxableAmount, gstRate, gstAmount, invoiceTotal, tdsRate, tdsAmount, netPayable, paid,
    balanceThisBill: money(Math.max(0, netPayable - paid)),
  };
}
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
  for (const decision of input.exceptionDecisions ?? []) {
    if (decision.decision === "hours" && (decision.sourceType !== "maintenance" || !decision.sourceId)) {
      throw new Error("Actual downtime hours can be applied only to an identified maintenance breakdown.");
    }
  }

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
      if (decision.decision === "manual" && !decision.remarks?.trim()) {
        throw Object.assign(new Error("A manual hire deduction needs a reason/reference."), { code: "BAD_REQUEST" });
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
    const hourBasedDeduction = item.exceptionType === "breakdown" &&
      item.downtimeHours != null &&
      terms.breakdownHoursPerDay != null &&
      terms.breakdownHoursPerDay >= 10 &&
      terms.breakdownHoursPerDay <= 12
      ? money(dailyDeduction * item.downtimeHours / terms.breakdownHoursPerDay)
      : undefined;
    item.suggestedDeductionAmount = breakdownBlocked ? 0 : hourBasedDeduction;
    item.deductionAmount = breakdownBlocked
      ? 0
      : money(decision.decision === "full_day" ? dailyDeduction : decision.decision === "half_day" ? dailyDeduction / 2 : decision.decision === "hours" ? (hourBasedDeduction ?? 0) : decision.decision === "manual" ? Math.max(0, decision.manualDeductionAmount ?? 0) : 0);
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
export type HireActivitySource = "dpr_log" | "plant_usage" | "site_material_trip" | "bulk_transport_trip" | "equipment_default";
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
  /** False when actual diesel exists but the activity/norm basis cannot derive expected diesel. */
  expectedDieselAvailable?: boolean;
  consumptionNorm?: number | null;
  normBasis?: string | null;
  task?: string | null;
  site?: string | null;
  equipmentName?: string | null;
  openingReading?: number | null;
  closingReading?: number | null;
  movementReference?: string | null;
  /** Vehicle/text matched delivery evidence always requires bill-review selection. */
  requiresTripReview?: boolean;
  deliveryEvidence?: { material?: string | null; quantity?: number | null; uom?: string | null; source?: string | null; destination?: string | null; receiptNumber?: string | null } | null;
}
export interface HireTripDecision {
  source: HireActivitySource;
  sourceId: number;
  selected?: boolean;
  correctedTrips?: number;
  /** Required to bill a delivery candidate beside same-day operational trips. */
  separateFromOperational?: boolean;
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
/**
 * The Equipment Performance report's period-boundary tank calculation.
 * When present it supersedes per-activity issued-fuel arithmetic for an HSD
 * recovery. `reliable` is false unless its first/last tank boundaries and all
 * intervening issues were confirmed by that canonical report.
 */
export interface HireAuthoritativeDieselPeriod {
  actualDiesel: number | null;
  expectedDiesel: number | null;
  difference: number | null;
  reliable: boolean;
  dailyRows?: readonly unknown[];
}
export interface HireDailyDieselPricing {
  date: string;
  actualDiesel: number;
  expectedDiesel: number;
  expectedDieselAvailable: boolean;
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
  expectedDieselAvailable: boolean;
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
  authoritativeDieselPeriod?: HireAuthoritativeDieselPeriod;
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
      requiresReview?: boolean;
      reviewed?: boolean;
      hasOperationalCounterpart?: boolean;
      separateFromOperational?: boolean;
    })[];
  };
  diesel: {
    actualDiesel: number;
    expectedDiesel: number;
    expectedDieselAvailable: boolean;
    expectedDieselUnavailableDates: readonly string[];
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
  sourceId?: number | string | null;
  equipmentId?: number | null;
  date?: string | null;
  category?: string | null;
  description?: string | null;
  siteName?: string | null;
  entryType?: string | null;
}

const isAutoBillSource = (source: string | null | undefined) => {
  const normalized = (source || "").toLowerCase();
  return normalized === "auto" || normalized.startsWith("auto:");
};

const semanticAutoBillItemIdentity = (item: RawAutoBillItem): string => [
  "auto",
  item.date || "",
  item.category || "",
  item.equipmentId ?? "",
  (item.siteName || "").trim().toUpperCase(),
  (item.description || "").trim().replace(/\s+/g, " ").toUpperCase(),
].join(":");

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
  if (!isAutoBillSource(item.source) || item.equipmentId == null || !item.date) return undefined;
  // Transport mobilization may also carry an equipmentId; only raw equipment
  // activity is superseded by a hire-group summary.
  if ((item.category || "").toLowerCase() !== "equipment") return undefined;
  return groups?.find(group =>
    Number(item.equipmentId) === Number(group.equipmentId) &&
    item.date! >= group.periodFrom &&
    item.date! <= group.periodTo
  );
}

/** Stable client-side identity for additive Pull Other Items behaviour. */
export function autoBillItemIdentity(item: RawAutoBillItem): string {
  const source = (item.source || "auto").toLowerCase();
  const date = item.date || "";
  if (source.startsWith("auto:")) return `${source}:${date}`;
  if (item.sourceId != null && String(item.sourceId) !== "") return `auto:${String(item.sourceId).toLowerCase()}:${date}`;
  return semanticAutoBillItemIdentity(item);
}

export function isMonthlyRawAutoBillItem(item: RawAutoBillItem): boolean {
  if (!isAutoBillSource(item.source)) return false;
  if ((item.entryType || "").toLowerCase() === "monthly") return true;
  return /\bMONTHLY HIRE\b/i.test(item.description || "");
}

/** One eligibility seam used by both the banner count and Pull action. */
export function availableOtherBillItems<T extends RawAutoBillItem>(
  candidates: readonly T[] | null | undefined,
  existing: readonly RawAutoBillItem[] | null | undefined,
  groups: readonly HireGroupCoverage[] | null | undefined,
): T[] {
  const seen = new Set((existing || []).map(autoBillItemIdentity));
  // Legacy rows saved before source-qualified identities use the visible-field
  // fingerprint. New rows persist provenance in the existing source column.
  const legacySeen = new Set((existing || [])
    .filter(item => (item.source || "").toLowerCase() === "auto" && item.sourceId == null)
    .map(semanticAutoBillItemIdentity));
  const available: T[] = [];
  for (const item of candidates || []) {
    if (isMonthlyRawAutoBillItem(item) || rawAutoItemCoveredByHireGroup(item, groups)) continue;
    const key = autoBillItemIdentity(item);
    if (seen.has(key) || legacySeen.has(semanticAutoBillItemIdentity(item))) continue;
    seen.add(key);
    available.push(item);
  }
  return available;
}

export function mergeOtherBillItems<T extends RawAutoBillItem>(
  existing: readonly T[],
  additions: readonly T[],
): T[] {
  return [...existing, ...availableOtherBillItems(additions, existing, [])];
}

/** Returns the review decisions still required before a linked bill can advance. */
export function getHireReviewGaps(snapshot: Partial<HireGroupCalculationResult> | null | undefined): string[] {
  if (!snapshot) return ["calculation snapshot"];
  const gaps = (snapshot.exceptions ?? [])
    .filter(exception => !exception.decision)
    .map(exception => `${exception.exceptionType} on ${exception.date || "unknown date"}`);
  if ((snapshot.diesel?.suggestedExcess ?? 0) > 0 &&
      String((snapshot as any).terms?.dieselResponsibility || "").toLowerCase() !== "vendor" &&
      !snapshot.diesel?.recoveryDecision) {
    gaps.push("HSD recovery disposition");
  }
  for (const decision of snapshot.decisions?.trip ?? []) {
    if (decision.requiresReview && !decision.reviewed) gaps.push(`delivery-trip match on ${decision.businessDate}`);
    if (decision.requiresReview && decision.reviewed && !decision.remarks?.trim()) {
      gaps.push(`delivery-trip reconciliation reason on ${decision.businessDate}`);
    }
    if (decision.requiresReview && decision.selected !== false && decision.hasOperationalCounterpart && !decision.separateFromOperational) {
      gaps.push(`delivery-trip separation evidence on ${decision.businessDate}`);
    }
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
    (activity.source === "dpr_log" || activity.source === "plant_usage" || activity.source === "site_material_trip" || activity.source === "bulk_transport_trip") &&
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
      expectedDieselAvailable: !dayActivities.some(row =>
        Number(row.actualDiesel || 0) > 0 &&
        (row.expectedDieselAvailable === false || row.expectedDiesel == null)
      ),
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
  expectedDieselAvailable: boolean;
  expectedDieselUnavailableDates: string[];
  suggestedExcess: number;
  applicableRate?: number;
  rateUnavailable: boolean;
  suggestedRecoveryAmount?: number;
  dailyPricing: HireDailyDieselPricing[];
  unpricedActualDates: string[];
} {
  const activityRows = normalizeHireActivities(activities).filter(activity =>
    (activity.source === "dpr_log" || activity.source === "plant_usage" || activity.source === "site_material_trip" || activity.source === "bulk_transport_trip") &&
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
    const expectedDieselAvailable = !rows.some(row =>
      Number(row.actualDiesel || 0) > 0 &&
      (row.expectedDieselAvailable === false || row.expectedDiesel == null)
    );
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
      expectedDieselAvailable,
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
  const expectedDieselUnavailableDates = dailyPricing
    .filter(day => !day.expectedDieselAvailable)
    .map(day => day.date);
  const expectedDieselAvailable = expectedDieselUnavailableDates.length === 0;
  const suggestedExcess = expectedDieselAvailable ? money(Math.max(0, actualDiesel - expectedDiesel)) : 0;
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
    expectedDieselAvailable,
    expectedDieselUnavailableDates,
    suggestedExcess,
    applicableRate,
    rateUnavailable,
    suggestedRecoveryAmount: !expectedDieselAvailable ? undefined
      : suggestedExcess === 0 ? 0
      : applicableRate === undefined ? undefined
      : money(suggestedExcess * applicableRate),
    dailyPricing,
    unpricedActualDates,
  };
}

function applyAuthoritativeDieselPeriod(
  pricing: ReturnType<typeof calculateHireDieselPricing>,
  period: HireAuthoritativeDieselPeriod,
  purchases: readonly HireDieselPurchasePrice[],
  periodTo: string,
) {
  const actualDiesel = Number.isFinite(period.actualDiesel) && (period.actualDiesel ?? 0) >= 0 ? money(period.actualDiesel!) : 0;
  const expectedDiesel = Number.isFinite(period.expectedDiesel) && (period.expectedDiesel ?? 0) >= 0 ? money(period.expectedDiesel!) : 0;
  const expectedDieselAvailable = !!period.reliable && period.expectedDiesel != null && period.actualDiesel != null && period.difference != null;
  const suggestedExcess = expectedDieselAvailable ? money(Math.max(0, period.difference!)) : 0;
  // A report-period recovery uses one unambiguous, contemporaneous rate. We
  // deliberately do not blend per-activity rates or fabricate coverage from
  // an issued-fuel event. Multiple prices on the latest relevant purchase date
  // must be resolved manually.
  const validPurchases = purchases.filter(p => isValidDate(p.date) && p.date <= periodTo &&
    Number.isFinite(p.rate) && p.rate > 0 && Number.isFinite(p.qtyPurchased) && p.qtyPurchased > 0);
  const rateDate = validPurchases.map(p => p.date.slice(0, 10)).sort().at(-1);
  const rateSources = rateDate ? validPurchases.filter(p => p.date.slice(0, 10) === rateDate) : [];
  const rates = Array.from(new Set(rateSources.map(p => Number(p.rate))));
  const applicableRate = expectedDieselAvailable && rates.length === 1 ? rates[0] : undefined;
  return {
    ...pricing,
    actualDiesel,
    expectedDiesel,
    expectedDieselAvailable,
    expectedDieselUnavailableDates: expectedDieselAvailable ? [] : ["PERIOD PERFORMANCE MEASUREMENT"],
    suggestedExcess,
    applicableRate,
    rateUnavailable: applicableRate === undefined,
    suggestedRecoveryAmount: !expectedDieselAvailable ? undefined
      : suggestedExcess === 0 ? 0
      : applicableRate === undefined ? undefined
      : money(suggestedExcess * applicableRate),
    unpricedActualDates: applicableRate === undefined && actualDiesel > 0 ? [periodTo] : [],
  };
}

/** Calculates a bill-group snapshot using the existing statement calculator. */
export function calculateHireGroup(input: HireGroupCalculationInput): HireGroupCalculationResult {
  const periodActivities = normalizeHireActivities(input.activities).filter(a =>
    (a.source === "dpr_log" || a.source === "plant_usage" ||
      ((a.source === "site_material_trip" || a.source === "bulk_transport_trip") && input.terms.billingBasis === "trip")) &&
    a.businessDate >= input.periodFrom && a.businessDate <= input.periodTo
  );
  const decisionMap = new Map((input.tripDecisions ?? []).map(d => [`${d.source}:${d.sourceId}`, d]));
  const usage: HireUsage[] = periodActivities.flatMap(activity => {
    const decision = decisionMap.get(hireActivityIdentity(activity));
    const hasOperationalCounterpart = activity.requiresTripReview && periodActivities.some(other =>
      other.equipmentId === activity.equipmentId && other.businessDate === activity.businessDate &&
      (other.source === "dpr_log" || other.source === "plant_usage") && other.entryType === "trip_based" &&
      decisionMap.get(hireActivityIdentity(other))?.selected !== false
    );
    // An explicitly excluded source is reconciled evidence, not
    // an invalid equipment-usage row requiring a second exception decision.
    if (decision?.selected === false) return [];
    // A delivery matched to an operational trip can only add another payable
    // trip when the reviewer expressly records it as separately verified.
    if (activity.requiresTripReview && (!decision || (hasOperationalCounterpart && !decision.separateFromOperational))) return [];
    // No inferred trips: only selected positive stored/corrected values reach
    // the shared trip calculator.
    const trips = activity.requiresTripReview && !decision ? 0
      : decision?.selected === false ? 0
      : decision?.correctedTrips !== undefined ? decision.correctedTrips
      : activity.numberOfTrips;
    return [{
      id: activity.sourceId, date: activity.businessDate, entryType: activity.entryType,
      status: activity.status, hoursOrKmRun: activity.hoursOrKmRun, numberOfTrips: trips,
    }];
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
  const activityDieselPricing = calculateHireDieselPricing(
    activities, input.dieselPurchases,
    hasMeasurementPeriod ? measurementPeriodFrom : input.periodFrom,
    hasMeasurementPeriod ? measurementPeriodTo : input.periodTo,
  );
  const dieselPricing = input.authoritativeDieselPeriod
    ? applyAuthoritativeDieselPeriod(
        activityDieselPricing,
        input.authoritativeDieselPeriod,
        input.dieselPurchases ?? [],
        hasMeasurementPeriod ? measurementPeriodTo : input.periodTo,
      )
    : activityDieselPricing;
  const workingSheet = hasMeasurementPeriod
    ? buildHireActivityDays(measurementPeriodFrom, measurementPeriodTo, activities, input.maintenance)
    : [];
  const recovery = input.dieselRecovery;
  if (recovery?.decision && String(input.terms.dieselResponsibility || "").toLowerCase() === "vendor") {
    throw new Error("HSD recovery is available only where the Equipment Master assigns diesel responsibility to HLC.");
  }
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
        const hasOperationalCounterpart = activity.requiresTripReview && activities.some(other =>
          other.equipmentId === activity.equipmentId && other.businessDate === activity.businessDate &&
          (other.source === "dpr_log" || other.source === "plant_usage") && other.entryType === "trip_based" &&
          decisionMap.get(hireActivityIdentity(other))?.selected !== false
        );
        const recordedTrips = Number(activity.numberOfTrips) || 0;
        const acceptedTrips = activity.requiresTripReview && (!decision || (hasOperationalCounterpart && !decision.separateFromOperational)) ? 0
          : decision?.selected === false ? 0 : Number(decision?.correctedTrips ?? recordedTrips) || 0;
        return {
          source: activity.source,
          sourceId: activity.sourceId,
          businessDate: activity.businessDate,
          selected: decision?.selected !== false,
          correctedTrips: decision?.correctedTrips,
          remarks: decision?.remarks,
          recordedTrips,
          acceptedTrips,
          ...(activity.requiresTripReview ? {
            requiresReview: true, reviewed: !!decision, hasOperationalCounterpart,
            separateFromOperational: !!decision?.separateFromOperational,
          } : {}),
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