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
  decision: "full_day" | "half_day";
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
  payableDays: readonly { date: string; fraction: 1 | 0.5; reason?: string }[];
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
  let payableDays: { date: string; fraction: 1 | 0.5; reason?: string }[] = [];
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
      return { date, fraction: decision?.decision === "half_day" ? 0.5 : 1, reason: decision?.reason ?? undefined };
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