import { describe, expect, it } from "vitest";
import { calculateHireBilling } from "./hireBilling";
import { activityClassification, calendarMonths, hireReviewTable, projectHireReview } from "./vendorBillLayout";
import { previousBillingSummary } from "./vendorBillReview";
import { getBillFinancialTotals } from "./vendorBillFinancialReport";

const make = (from = "2026-08-01", to = "2026-08-31", extra: any = {}) => {
  const terms = { billingBasis: "monthly" as const, rate: 150000, monthlyDivisorType: "calendar" as const, ...extra };
  const result = calculateHireBilling({ periodFrom: from, periodTo: to, terms });
  return { equipmentName: "Tipper A", periodFrom: from, periodTo: to, calculationSnapshot: { ...result, terms } };
};
describe("VB-LAYOUT-01 display-only evidence", () => {
  it.each([1, 2, 3])("renders %i independent calendar months", count => {
    expect(projectHireReview(make("2026-08-01", `2026-${String(7 + count).padStart(2, "0")}-28`)).months).toHaveLength(count);
  });
  it("clips partial first and last months", () => {
    expect(calendarMonths("2026-08-20", "2026-10-15").map(m => [m.from, m.to])).toEqual([
      ["2026-08-20", "2026-08-31"], ["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-15"],
    ]);
  });
  it("three worked days do not change full monthly gross or Days Billed", () => {
    const s: any = make();
    s.calculationSnapshot.workingSheet = [1, 2, 3].map(d => ({ date: `2026-08-0${d}`, activity: "worked" }));
    const before = JSON.stringify(s);
    const review = projectHireReview(s);
    expect(review.months[0]).toMatchObject({ worked: 3, idle: 0, unknown: 28, daysBilled: 31, gross: 150000 });
    expect(JSON.stringify(s)).toBe(before);
  });
  it.each(["calendar", "30", "custom"])("uses existing %s monthly divisor unchanged", monthlyDivisorType => {
    const s = make("2026-08-20", "2026-09-15", { monthlyDivisorType, monthlyDivisor: 26 });
    expect(projectHireReview(s).months.reduce((n, m) => n + (m.gross || 0), 0)).toBeCloseTo(s.calculationSnapshot.grossAmount, 2);
  });
  it.each([undefined, "no_activity", "No Work", "unknown"])("does not turn %s into idle", activity => {
    expect(activityClassification({ activity })).toBe("Activity Not Recorded");
  });
  it("retains explicit idle, operator unavailability and outside deployment evidence", () => {
    expect(activityClassification({ activity: "idle" })).toBe("Idle — Work Not Available");
    expect(activityClassification({ activity: "idle_no_work" })).toBe("Idle — Work Not Available");
    expect(activityClassification({ activity: "idle_no_operator" })).toBe("Operator / Driver Unavailable");
    expect(activityClassification({ activity: "operator_unavailable" })).toBe("Operator / Driver Unavailable");
    expect(activityClassification({ activity: "breakdown" })).toBe("Breakdown");
    expect(activityClassification({ activity: "outside_deployment" })).toBe("Outside Hire/Deployment Period");
  });
  it("keeps the four explicit classifications separate and leaves missing evidence unclassified", () => {
    const s = make("2026-08-01", "2026-08-05");
    s.calculationSnapshot.workingSheet = [
      { date: "2026-08-01", activity: "working" },
      { date: "2026-08-02", activity: "idle_no_work" },
      { date: "2026-08-03", activity: "idle_no_operator" },
      { date: "2026-08-04", activity: "breakdown" },
      { date: "2026-08-05", activity: "not_recorded" },
    ];
    const month = projectHireReview(s).months[0];
    expect(month).toMatchObject({ worked: 1, idle: 1, breakdown: 1, operatorUnavailable: 1, unknown: 1 });
    expect(month.worked + month.idle + month.breakdown + month.operatorUnavailable + month.unknown).toBe(5);
  });
  it("does not count entirely open activity as verified working", () => {
    expect(activityClassification({ activity: "worked", openActivityCount: 1, billableActivityCount: 0 })).toBe("Activity Not Recorded");
  });
  it("reports unavailable allocation for saved commercial override", () => {
    const s = make("2026-08-01", "2026-09-30");
    const review = projectHireReview({ ...s, grossAmount: 12345 });
    expect(review.gross).toBe(12345);
    expect(review.months.every(m => m.gross === null && m.daysBilled === null)).toBe(true);
  });
  it("shows one month of legacy stored gross without inventing days", () => {
    const review = projectHireReview({ periodFrom: "2026-08-01", periodTo: "2026-08-31", grossAmount: 1234 });
    expect(review.months[0]).toMatchObject({ gross: 1234, daysBilled: null, unknown: 31 });
  });
  it("does not apply breakdown twice", () => {
    const s: any = make();
    s.calculationSnapshot.deductionAmount = 150000 / 31;
    s.calculationSnapshot.exceptions = [{ date: "2026-08-02", decision: "full_day", deductionAmount: 150000 / 31 }];
    expect(projectHireReview(s).months[0]).toMatchObject({ gross: 150000, daysBilled: 30 });
  });
  it("keeps mixed machine terms isolated and daily half-days", () => {
    const daily = projectHireReview({ equipmentName: "Tipper B", billingBasis: "daily", rate: 1000, grossAmount: 1500,
      periodFrom: "2026-08-31", periodTo: "2026-09-01", calculationSnapshot: {
        payableDays: [{ date: "2026-08-31", fraction: 1 }, { date: "2026-09-01", fraction: 0.5 }],
      } });
    expect(daily.months.map(m => m.gross)).toEqual([1000, 500]);
    expect(projectHireReview(make()).rate).toBe(150000);
    expect(hireReviewTable(daily)[1][2]).toBe(0.5);
  });
  it.each(["hourly", "trip"])("never labels %s quantities as payable days", billingBasis => {
    expect(projectHireReview({ billingBasis, quantity: 8, grossAmount: 2000, periodFrom: "2026-08-01", periodTo: "2026-08-31" }).months[0].daysBilled).toBeNull();
  });
  it("excludes current/later bills, other vendor and keeps unknown legacy payment neutral", () => {
    const current = { id: 3, vendorId: 7, billDate: "2026-09-01" };
    const previous = { id: 1, vendorId: 7, billDate: "2026-08-01", status: "paid", totalAmount: 100, paidAt: "2026-08-30T10:00:00Z", adjustmentAmount: -25 };
    const result = previousBillingSummary(current, [current, previous, { ...previous, id: 2, vendorId: 8 }, { ...previous, id: 4, billDate: "2026-10-01" }], getBillFinancialTotals);
    expect(result.rows).toHaveLength(1);
    expect(result).toMatchObject({ gross: 100, paid: null, balance: null, lastPayment: null });
  });
  it("preserves recorded zero and does not count an advance deduction as payment", () => {
    const result = previousBillingSummary({ id: 2, vendorId: 7, billDate: "2026-09-01" },
      [{ id: 1, vendorId: 7, billDate: "2026-08-01", totalAmount: 100, adjustmentAmount: -25, amountPaid: 0 }], getBillFinancialTotals);
    expect(result).toMatchObject({ paid: 0, balance: 75 });
  });
  it("never joins free-text vendors", () => {
    expect(previousBillingSummary({ id: 2, vendorName: "A", billDate: "2026-09-01" }, [], getBillFinancialTotals).gross).toBeNull();
  });
});
