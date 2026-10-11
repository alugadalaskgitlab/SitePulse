import { monthlyHireSegments, type HireBillingBasis, type HireTerms } from "@shared/hireBilling";

export const HIRE_RATE_UNITS: Record<HireBillingBasis, string> = {
  trip: "₹/Trip", daily: "₹/Day", hourly: "₹/Hour", monthly: "₹/Month",
};
export const HIRE_QUANTITY_UNITS: Record<HireBillingBasis, string> = {
  trip: "Trips", daily: "Days", hourly: "Hours", monthly: "Months",
};

export type BillHireTerms = {
  basis: HireBillingBasis;
  rate: number;
  periodFrom: string;
  periodTo: string;
  monthlyDivisorType?: HireTerms["monthlyDivisorType"];
  monthlyDivisor?: number | null;
  savedTerms?: HireTerms;
  activityReviewRequired?: boolean;
};

/** Master fields suggest initial values only; the bill owns every date bound. */
export function defaultBillHireTerms(equipment: any, periodFrom: string, periodTo: string): BillHireTerms {
  const basis = String(equipment?.hireBillingBasis || "").toLowerCase();
  return {
    basis: (["trip", "daily", "hourly", "monthly"].includes(basis) ? basis : "daily") as HireBillingBasis,
    rate: Number(equipment?.hireRate) > 0 ? Number(equipment.hireRate) : 0,
    periodFrom, periodTo,
    monthlyDivisorType: equipment?.hireMonthlyDivisorType || "30",
    monthlyDivisor: equipment?.hireMonthlyDivisor ?? null,
  };
}

export function calculationTermsForBill(group: BillHireTerms, equipment: any): HireTerms {
  return {
    dieselResponsibility: equipment?.hireDieselResponsibility,
    breakdownDeductionEnabled: !!equipment?.hireBreakdownDeductionEnabled,
    ...group.savedTerms,
    billingBasis: group.basis,
    rate: group.rate,
    hireStartDate: group.savedTerms?.hireStartDate ?? group.periodFrom,
    hireEndDate: group.savedTerms?.hireEndDate ?? group.periodTo,
    monthlyDivisorType: group.monthlyDivisorType ?? group.savedTerms?.monthlyDivisorType ?? "30",
    monthlyDivisor: group.monthlyDivisor ?? group.savedTerms?.monthlyDivisor,
  };
}

/** Only deliberate commercial edits invalidate decisions, never query refetches. */
export function applyBillHireTermsEdit<T extends BillHireTerms>(current: T, patch: Partial<T>): T {
  const keys = ["basis", "rate", "periodFrom", "periodTo", "monthlyDivisorType", "monthlyDivisor"] as const;
  const changed = keys.some(key => key in patch && patch[key] !== current[key]);
  if (!changed) return { ...current, ...patch };
  const next = { ...current, ...patch };
  return {
    ...next,
    savedTerms: next.savedTerms ? {
      ...next.savedTerms, hireStartDate: next.periodFrom, hireEndDate: next.periodTo,
    } : undefined,
    dailyDecisions: [], tripDecisions: [], exceptionDecisions: [],
    quantityOverride: undefined, grossAmountOverride: undefined,
    dieselRecoveryDecision: undefined, dieselRecoveryFinalAmount: undefined, dieselRecoveryRemarks: undefined,
    activityReviewRequired: true,
  };
}

export function segmentBillHireTerms<T extends BillHireTerms>(group: T): T[] {
  if (group.basis !== "monthly" || !group.periodFrom || !group.periodTo || group.periodFrom > group.periodTo) return [group];
  const from = Date.parse(`${group.periodFrom}T00:00:00Z`);
  const to = Date.parse(`${group.periodTo}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [group];
  return monthlyHireSegments(from, to).map(segment => {
    const periodFrom = new Date(segment.from).toISOString().slice(0, 10);
    const periodTo = new Date(segment.to).toISOString().slice(0, 10);
    return {
      ...group, periodFrom, periodTo,
      savedTerms: group.savedTerms ? { ...group.savedTerms, hireStartDate: periodFrom, hireEndDate: periodTo } : undefined,
    };
  });
}
