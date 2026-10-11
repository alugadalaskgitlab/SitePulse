import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateHireGroup, type HireActivity } from "@shared/hireBilling";
import { applyBillHireTermsEdit, calculationTermsForBill, defaultBillHireTerms, segmentBillHireTerms, HIRE_RATE_UNITS } from "./hireBillTerms";

const master = { id: 23, ownership: "hired", vendorName: "Kaveri Earthworks", hireBillingBasis: "trip", hireRate: 780,
  hireStartDate: "2023-02-01", hireEndDate: "2023-02-18", hireDieselResponsibility: "vendor" };
const from = "2026-06-02";
const to = "2026-06-12";
const trip = (sourceId: number, businessDate = from): HireActivity => ({
  source: "site_material_trip", sourceId, equipmentId: 23, businessDate, entryType: "trip_based",
  numberOfTrips: 3, confirmedForDailyHire: true, requiresTripReview: true, status: "closed",
});

describe("bill-owned hire terms (synthetic fixtures)", () => {
  it("prefills commercial suggestions without restricting dates to Master", () => {
    expect(defaultBillHireTerms(master, from, to)).toMatchObject({ basis: "trip", rate: 780, periodFrom: from, periodTo: to });
    expect(calculationTermsForBill(defaultBillHireTerms(master, from, to), master)).toMatchObject({ hireStartDate: from, hireEndDate: to });
    expect(master.hireStartDate).toBe("2023-02-01");
  });
  it("does not require a master basis, rate or hire dates", () => {
    expect(defaultBillHireTerms({ id: 24, ownership: "hired", vendorName: "Kaveri Earthworks" }, from, to))
      .toMatchObject({ basis: "daily", rate: 0, periodFrom: from, periodTo: to });
  });
  it("bills a Trip-default machine daily using confirmed trip_based evidence once per date", () => {
    const group = { ...defaultBillHireTerms(master, from, to), basis: "daily" as const, rate: 5000 };
    const result = calculateHireGroup({
      terms: calculationTermsForBill(group, master), periodFrom: from, periodTo: to,
      activities: [trip(71), trip(72), trip(73, "2026-06-03")],
      dailyDecisions: [
        { date: from, decision: "full_day", reason: "Attendance reviewed" },
        { date: "2026-06-03", decision: "half_day", reason: "Half-day assignment" },
      ],
    });
    expect(result.quantity).toBe(1.5);
    expect(result.grossAmount).toBe(7500);
  });
  it("uses actual hours when a Monthly-default machine is billed hourly, never trip counts", () => {
    const eq = { ...master, hireBillingBasis: "monthly", hireRate: 126400 };
    const group = { ...defaultBillHireTerms(eq, from, to), basis: "hourly" as const, rate: 1450 };
    const result = calculateHireGroup({
      terms: calculationTermsForBill(group, eq), periodFrom: from, periodTo: to,
      activities: [
        { source: "plant_usage", sourceId: 84, equipmentId: 23, businessDate: from, entryType: "hour_based", hoursOrKmRun: 4.25, status: "closed" },
        trip(85),
      ],
    });
    expect(result.quantity).toBe(4.25);
    expect(result.grossAmount).toBe(6162.5);
  });
  it("keeps separate equipment and non-overlapping periods independent", () => {
    const first = { ...defaultBillHireTerms(master, from, to), dailyDecisions: [{ date: from, decision: "full_day" }] };
    const second = { ...defaultBillHireTerms({ ...master, id: 24 }, "2026-07-01", "2026-07-10"), basis: "hourly" as const, rate: 1150 };
    const edited = applyBillHireTermsEdit(first, { basis: "daily", rate: 5000 });
    expect(first.basis).toBe("trip");
    expect(edited.basis).toBe("daily");
    expect(second).toMatchObject({ basis: "hourly", rate: 1150, periodFrom: "2026-07-01" });
  });
  it.each(["basis", "rate", "periodFrom", "periodTo"] as const)("resets only the edited draft's activity decisions on a deliberate %s edit", key => {
    const current = {
      ...defaultBillHireTerms(master, from, to),
      dailyDecisions: [{ date: from, decision: "full_day" }],
      tripDecisions: [{ source: "site_material_trip", sourceId: 71, selected: true }],
      exceptionDecisions: [{ sourceType: "maintenance", sourceId: 9, decision: "none" }],
      quantityOverride: 12, grossAmountOverride: 9360,
      dieselRecoveryDecision: "accept", dieselRecoveryFinalAmount: 840,
    };
    const patch = { basis: "daily" as const, rate: 5000, periodFrom: "2026-06-04", periodTo: "2026-06-15" };
    const next = applyBillHireTermsEdit(current, { [key]: patch[key] });
    expect(next).toMatchObject({ dailyDecisions: [], tripDecisions: [], exceptionDecisions: [], activityReviewRequired: true });
    expect(next.quantityOverride).toBeUndefined();
    expect(next.grossAmountOverride).toBeUndefined();
    expect(next.dieselRecoveryDecision).toBeUndefined();
    expect(current.dailyDecisions).toHaveLength(1);
  });
  it("does not reset decisions for unchanged values, activity edits or refetches", () => {
    const current = { ...defaultBillHireTerms(master, from, to), dailyDecisions: [{ date: from, decision: "full_day" }] };
    expect(applyBillHireTermsEdit(current, { rate: current.rate }).dailyDecisions).toBe(current.dailyDecisions);
    expect(applyBillHireTermsEdit(current, {})).toEqual(current);
  });
  it("preserves saved term dates and divisor rather than changed live defaults on reopen", () => {
    const savedTerms = { billingBasis: "daily" as const, rate: 5000, hireStartDate: "2026-06-04", hireEndDate: "2026-06-09", monthlyDivisorType: "calendar" as const };
    const group = { basis: "daily" as const, rate: 5000, periodFrom: from, periodTo: to, savedTerms };
    expect(calculationTermsForBill(group, { ...master, hireRate: 9999, hireBillingBasis: "hourly" })).toMatchObject(savedTerms);
    const edited = applyBillHireTermsEdit(group, { periodFrom: "2026-06-05" });
    expect(calculationTermsForBill(edited, master)).toMatchObject({ hireStartDate: "2026-06-05", hireEndDate: to });
    expect(group.savedTerms).toEqual(savedTerms);
  });
  it("retains automatic monthly segmentation and full/partial-month divisor calculation", () => {
    const group = { ...defaultBillHireTerms(master, "2026-05-18", "2026-07-09"), basis: "monthly" as const, rate: 93000, monthlyDivisorType: "30" as const };
    const segments = segmentBillHireTerms(group);
    expect(segments.map(row => [row.periodFrom, row.periodTo])).toEqual([
      ["2026-05-18", "2026-05-31"], ["2026-06-01", "2026-06-30"], ["2026-07-01", "2026-07-09"],
    ]);
    expect(segments.map(row => calculateHireGroup({
      terms: calculationTermsForBill(row, master), periodFrom: row.periodFrom, periodTo: row.periodTo, activities: [],
    }).grossAmount)).toEqual([43400, 93000, 27900]);
  });
  it("pairs every basis with its commercial rate unit", () => {
    expect(HIRE_RATE_UNITS).toEqual({ trip: "₹/Trip", daily: "₹/Day", hourly: "₹/Hour", monthly: "₹/Month" });
  });
});

describe("shared VendorBills composer wiring (source checks, not browser tests)", () => {
  const page = readFileSync(new URL("../../pages/VendorBills.tsx", import.meta.url), "utf8");
  it("submits all selected bases through the existing hireGroups snapshot flow", () => {
    expect(page).toContain("const includeHireGroups = includedHireGroups.length > 0");
    expect(page).toContain("basis: group.basis");
    expect(page).toContain("rate: group.rate, dailyDecisions: group.dailyDecisions");
    expect(page).not.toContain('includedHireGroups.every(group => ["monthly", "daily"].includes(group.basis))');
  });
  it("uses bill-owned calculation terms and restores saved terms on draft reopen", () => {
    expect(page).toContain("...calculationTermsForBill(group, eq)");
    expect(page).toContain("savedTerms: snap.terms");
    expect(page).not.toContain("hireStartDate: eq.hireStartDate");
    expect(page).not.toContain("invalidMonthlyHireEquipment");
    expect(page).toContain("applyBillHireTermsEdit(current, patch)");
    expect(page).toContain("group.activityReviewRequired");
  });
});
