import { describe, expect, it } from "vitest";
import {
  buildHireActivityDays,
  calculateEquipmentHireFinancials,
  calculateHireBilling,
  calculateHireDieselPricing,
  calculateHireGroup,
  getHireReviewGaps,
  monthlyDailyRate,
  monthlyGross,
  normalizeHireActivities,
} from "../shared/hireBilling";

describe("VB-10 monthly availability hire calculation", () => {
  const terms = {
    billingBasis: "monthly" as const,
    rate: 90_000,
    hireStartDate: "2026-05-01",
    hireMonthlyDivisorType: "30" as const,
    breakdownDeductionEnabled: true,
    automaticMonthlyBreakdownDeductions: true,
  };

  it("bills a full monthly period with no DPR or Plant activity", () => {
    const result = calculateHireBilling({ terms, periodFrom: "2026-05-01", periodTo: "2026-05-31", usage: [] });
    expect(result.grossAmount).toBe(90_000);
    expect(result.netAmount).toBe(90_000);
    expect(monthlyGross(Date.parse("2026-05-01T00:00:00Z"), Date.parse("2026-05-31T00:00:00Z"), terms)).toBe(90_000);
  });

  it("prorates only the active overlap using the agreed divisor", () => {
    const result = calculateHireBilling({
      terms: { ...terms, hireStartDate: "2026-05-15" },
      periodFrom: "2026-05-01", periodTo: "2026-05-31",
    });
    expect(result.billablePeriodFrom).toBe("2026-05-15");
    expect(result.grossAmount).toBe(51_000);
  });

  it("applies the per-bill grace once per breakdown day, with auditable overrides", () => {
    const result = calculateHireBilling({
      terms: { ...terms, breakdownGraceDays: 1 },
      periodFrom: "2026-05-01", periodTo: "2026-05-31",
      maintenance: [
        { id: 1, date: "2026-05-04", eventType: "breakdown" },
        { id: 2, date: "2026-05-11", eventType: "breakdown" },
        { id: 3, date: "2026-05-20", eventType: "breakdown" },
      ],
      exceptionDecisions: [{
        sourceType: "maintenance", sourceId: 3, exceptionType: "breakdown", date: "2026-05-20", decision: "half_day",
      }],
    });
    // 11-May is automatic full day after the one-day grace; 20-May was
    // explicitly overridden to half-day.
    expect(monthlyDailyRate("2026-05-11", terms)).toBe(3_000);
    expect(result.deductionAmount).toBe(4_500);
    expect(result.exceptions.find(item => item.sourceId === 3)?.decision).toBe("half_day");
  });

  it("records grace as an automatic no-deduction decision so verification has no hidden gap", () => {
    const result = calculateHireBilling({
      terms: { ...terms, breakdownGraceDays: 1 }, periodFrom: "2026-05-01", periodTo: "2026-05-31",
      maintenance: [{ id: 1, date: "2026-05-04", eventType: "breakdown" }],
    });
    expect(result.exceptions[0]).toMatchObject({ decision: "none", deductionAmount: 0 });
    expect(getHireReviewGaps({ ...result, terms: { ...terms, dieselResponsibility: "vendor" } } as any)).toEqual([]);
  });

  it("honours an explicit decision on the second duplicate breakdown source once per day", () => {
    const result = calculateHireBilling({
      terms,
      periodFrom: "2026-05-01", periodTo: "2026-05-31",
      maintenance: [
        { id: 101, date: "2026-05-12", eventType: "breakdown", description: "Initial report" },
        { id: 102, date: "2026-05-12", eventType: "breakdown", description: "Confirmed report" },
      ],
      exceptionDecisions: [{
        sourceType: "maintenance", sourceId: 102, exceptionType: "breakdown", date: "2026-05-12", decision: "half_day",
      }],
    });
    expect(result.deductionAmount).toBe(1_500);
    expect(result.exceptions.find(item => item.sourceId === 101)).toMatchObject({ decision: "none", deductionAmount: 0 });
    expect(result.exceptions.find(item => item.sourceId === 102)).toMatchObject({ decision: "half_day", deductionAmount: 1_500 });
    expect(getHireReviewGaps({ ...result, terms: { ...terms, dieselResponsibility: "vendor" } } as any)).toEqual([]);
  });

  it("does not double count an explicitly mirrored DPR/Plant usage pair", () => {
    const rows = normalizeHireActivities([
      { source: "dpr_log", sourceId: 1, equipmentId: 7, businessDate: "2026-05-04", plantUsageId: 9, hoursOrKmRun: 5 },
      { source: "plant_usage", sourceId: 9, equipmentId: 7, businessDate: "2026-05-04", hoursOrKmRun: 5 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("plant_usage");
  });

  it("applies debit, GST, and TDS once to a shared taxable hire amount", () => {
    expect(calculateEquipmentHireFinancials({
      grossHire: 10_000, otherDebit: 1_000, gstRate: 18, tdsRate: 2,
    })).toMatchObject({ taxableAmount: 9_000, gstAmount: 1_620, tdsAmount: 180, netPayable: 10_440 });
  });

  it("keeps monthly and hourly machines as separate groups while preserving each basis", () => {
    const monthly = calculateHireGroup({
      terms,
      periodFrom: "2026-05-01",
      periodTo: "2026-05-31",
      activities: [{
        source: "equipment_default", sourceId: 1001, equipmentId: 1001,
        businessDate: "2026-05-01", entryType: "monthly",
      }],
    });
    const hourly = calculateHireGroup({
      terms: { ...terms, billingBasis: "hourly", rate: 1_500, dieselResponsibility: "vendor" },
      periodFrom: "2026-05-01",
      periodTo: "2026-05-31",
      activities: [{
        source: "plant_usage", sourceId: 1002, equipmentId: 1002,
        businessDate: "2026-05-05", entryType: "hourly", hoursOrKmRun: 8, status: "closed",
      }],
    });
    expect(monthly).toMatchObject({ calculatedQuantity: 1, calculatedGrossAmount: 90_000, netAmount: 90_000 });
    expect(hourly).toMatchObject({ calculatedQuantity: 8, calculatedGrossAmount: 12_000, netAmount: 12_000 });
    expect(monthly.activityIds).not.toEqual(hourly.activityIds);
  });

  it("uses authoritative HLC opening-plus-issues-minus-closing values and weighted purchase rates", () => {
    const activities = [
      { source: "plant_usage" as const, sourceId: 1, equipmentId: 1001, businessDate: "2026-05-05", hoursOrKmRun: 8, actualDiesel: 20, expectedDiesel: 20 },
      { source: "plant_usage" as const, sourceId: 2, equipmentId: 1001, businessDate: "2026-05-10", hoursOrKmRun: 4, actualDiesel: 15, expectedDiesel: 10 },
      { source: "plant_usage" as const, sourceId: 3, equipmentId: 1001, businessDate: "2026-05-15", hoursOrKmRun: 8, actualDiesel: 20, expectedDiesel: 20 },
    ];
    const pricing = calculateHireDieselPricing(activities, [
      { id: 1, date: "2026-05-01", rate: 95, qtyPurchased: 100 },
      { id: 2, date: "2026-05-10", rate: 105, qtyPurchased: 50 },
    ], "2026-05-01", "2026-05-31");
    expect(pricing.actualDiesel).toBe(55);
    expect(pricing.expectedDiesel).toBe(50);
    expect(pricing.suggestedExcess).toBe(5);
    // Activity pricing is weighted by actual litres on each applicable day.
    expect(pricing.applicableRate).toBe(101.3636);
    const group = calculateHireGroup({
      terms: { ...terms, dieselResponsibility: "hlc" },
      periodFrom: "2026-05-01",
      periodTo: "2026-05-31",
      activities,
      authoritativeDieselPeriod: {
        actualDiesel: 100 + 45 - 90,
        expectedDiesel: 50,
        difference: 5,
        reliable: true,
      },
      dieselPurchases: [{ id: 3, date: "2026-05-10", rate: 105, qtyPurchased: 50 }],
      dieselRecovery: { decision: "accept" },
    });
    expect(group.diesel).toMatchObject({
      actualDiesel: 55,
      expectedDiesel: 50,
      suggestedExcess: 5,
      applicableRate: 105,
      suggestedRecoveryAmount: 525,
      finalRecoveryAmount: 525,
      recoveryDecision: "accept",
    });
    expect(group.netAmount).toBe(89_475);
  });

  it("requires an explicit HLC recovery choice and supports accept, edit, and ignore", () => {
    const input = {
      terms: { ...terms, dieselResponsibility: "hlc" as const },
      periodFrom: "2026-05-01",
      periodTo: "2026-05-31",
      activities: [{
        source: "plant_usage" as const, sourceId: 20, equipmentId: 1001,
        businessDate: "2026-05-05", actualDiesel: 12, expectedDiesel: 10,
      }],
      authoritativeDieselPeriod: { actualDiesel: 12, expectedDiesel: 10, difference: 2, reliable: true },
      dieselPurchases: [{ id: 20, date: "2026-05-05", rate: 100, qtyPurchased: 20 }],
    };
    const accept = calculateHireGroup({ ...input, dieselRecovery: { decision: "accept" } });
    const edit = calculateHireGroup({ ...input, dieselRecovery: { decision: "edit", finalAmount: 125, remarks: "AGREED CAP" } });
    const ignore = calculateHireGroup({ ...input, dieselRecovery: { decision: "ignore" } });
    expect(accept.diesel.finalRecoveryAmount).toBe(200);
    expect(edit.diesel).toMatchObject({ finalRecoveryAmount: 125, recoveryDecision: "edit", remarks: "AGREED CAP" });
    expect(ignore.diesel).toMatchObject({ finalRecoveryAmount: 0, recoveryDecision: "ignore" });
    expect(getHireReviewGaps({ ...ignore, terms: input.terms } as any)).toEqual([]);
  });

  it("does not turn no-activity calendar days into deductions and retains working-sheet evidence", () => {
    const days = buildHireActivityDays("2026-05-01", "2026-05-03", [{
      source: "plant_usage", sourceId: 30, equipmentId: 1001,
      businessDate: "2026-05-01", hoursOrKmRun: 8, actualDiesel: 4, expectedDiesel: 4,
    }]);
    expect(days.map(day => [day.date, day.activity])).toEqual([
      ["2026-05-01", "worked"],
      ["2026-05-02", "not_recorded"],
      ["2026-05-03", "not_recorded"],
    ]);
    expect(days.slice(1).every(day => day.dieselVariance === 0 && day.activityCount === 0)).toBe(true);
  });

  it("applies contractor advances once for hourly and monthly equipment and preserves missing-price evidence", () => {
    const hourlyAdvance = 8 * 120;
    const monthlyAdvance = 10 * 120;
    const financials = calculateEquipmentHireFinancials({
      grossHire: 90_000,
      otherDebit: hourlyAdvance + monthlyAdvance,
      gstRate: 18,
      tdsRate: 2,
    });
    expect(financials).toMatchObject({
      otherDebit: 2_160,
      taxableAmount: 87_840,
      netPayable: 101_894.4,
    });
    const noRate = calculateHireDieselPricing([{
      source: "plant_usage", sourceId: 40, equipmentId: 1002,
      businessDate: "2026-05-05", actualDiesel: 8, expectedDiesel: 4,
    }], [], "2026-05-01", "2026-05-31");
    expect(noRate).toMatchObject({
      suggestedExcess: 4,
      rateUnavailable: true,
      suggestedRecoveryAmount: undefined,
      unpricedActualDates: ["2026-05-05"],
    });
  });

  it("keeps category changes and frozen snapshots independent of transient generated rows", () => {
    const group = calculateHireGroup({
      terms,
      periodFrom: "2026-05-01",
      periodTo: "2026-05-31",
      activities: [],
      maintenance: [],
    });
    const snapshot = JSON.parse(JSON.stringify(group));
    expect(snapshot).toMatchObject({
      calculatedGrossAmount: 90_000,
      netAmount: 90_000,
      periodFrom: "2026-05-01",
      periodTo: "2026-05-31",
    });
    expect(snapshot).not.toBe(group);
    expect(snapshot.activityIds).toEqual([]);
  });
});

describe("VB-HIRE-07 recorded availability exceptions", () => {
  const twoDayTerms = {
    billingBasis: "monthly" as const,
    rate: 120_000,
    monthlyDivisorType: "custom" as const,
    monthlyDivisor: 24,
    breakdownDeductionEnabled: true,
    automaticMonthlyBreakdownDeductions: false,
    includeNewOperationalStatusExceptions: true,
  };
  const twoOperatorDays = [
    { id: 501, date: "2026-09-10", source: "plant_usage" as const, usageStatus: "idle_no_operator" as const },
    { id: 502, date: "2026-09-11", source: "dpr_log" as const, usageStatus: "idle_no_operator" as const },
  ];

  it("suggests, shows the divisor workings, and waits for an explicit operator-day choice", () => {
    const result = calculateHireBilling({
      terms: twoDayTerms,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: twoOperatorDays,
    });
    expect(result.grossAmount).toBe(120_000);
    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exceptionType: "operator_unavailable",
        deductionAmount: 0,
        suggestedDeductionAmount: 5_000,
        suggestionWorkings: {
          date: "2026-09-10",
          dayRate: 5_000,
          contractRate: 120_000,
          divisor: 24,
          divisorLabel: "24 custom days",
          amount: 5_000,
        },
      }),
    ]));
    expect(getHireReviewGaps({ ...result, terms: twoDayTerms } as any))
      .toContain("operator_unavailable on 2026-09-10");
  });

  it("computes accept, edited, and declined two-day outcomes without changing gross hire", () => {
    const base = {
      terms: twoDayTerms,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: twoOperatorDays,
    };
    const decision = (sourceId: number, choice: "full_day" | "half_day" | "none" | "manual", manualDeductionAmount?: number) => ({
      sourceType: "usage" as const,
      sourceId,
      exceptionType: "operator_unavailable",
      date: sourceId === 501 ? "2026-09-10" : "2026-09-11",
      decision: choice,
      manualDeductionAmount,
      remarks: choice === "manual" ? "REVIEWER ADJUSTMENT" : undefined,
    });
    const accepted = calculateHireBilling({
      ...base,
      exceptionDecisions: [decision(501, "full_day"), decision(502, "full_day")],
    });
    const edited = calculateHireBilling({
      ...base,
      exceptionDecisions: [decision(501, "manual", 2_500), decision(502, "half_day")],
    });
    const declined = calculateHireBilling({
      ...base,
      exceptionDecisions: [decision(501, "none"), decision(502, "none")],
    });

    expect(accepted).toMatchObject({ grossAmount: 120_000, deductionAmount: 10_000, netAmount: 110_000 });
    expect(edited).toMatchObject({ grossAmount: 120_000, deductionAmount: 5_000, netAmount: 115_000 });
    expect(declined).toMatchObject({ grossAmount: 120_000, deductionAmount: 0, netAmount: 120_000 });
  });

  it("deduplicates a mirrored DPR/Plant status pair and lets a same-day maintenance breakdown represent one day", () => {
    const mirrored = calculateHireBilling({
      terms: twoDayTerms,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: [
        { id: 10, date: "2026-09-10", source: "dpr_log", plantUsageId: 20, usageStatus: "idle_no_operator" },
        { id: 20, date: "2026-09-10", source: "plant_usage", usageStatus: "idle_no_operator" },
      ],
    });
    expect(mirrored.exceptions.filter(item => item.exceptionType === "operator_unavailable")).toHaveLength(1);
    expect(mirrored.exceptions[0].sourceId).toBe(20);

    const breakdown = calculateHireBilling({
      terms: twoDayTerms,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: [{ id: 30, date: "2026-09-12", source: "plant_usage", usageStatus: "breakdown" }],
      maintenance: [{ id: 40, date: "2026-09-12", eventType: "breakdown", description: "Hydraulic pump" }],
    });
    expect(breakdown.exceptions.filter(item => item.exceptionType === "breakdown")).toHaveLength(1);
    expect(breakdown.exceptions[0]).toMatchObject({ sourceType: "maintenance", date: "2026-09-12" });
  });

  it("does not infer exceptions for no-work or unrecorded days, and leaves legacy statements unchanged", () => {
    const result = calculateHireBilling({
      terms: twoDayTerms,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: [
        { id: 1, date: "2026-09-10", source: "plant_usage", usageStatus: "idle_no_work" },
        { id: 2, date: "2026-09-11", source: "plant_usage", usageStatus: null },
      ],
    });
    expect(result.exceptions).toEqual([]);

    const historical = calculateHireBilling({
      terms: { ...twoDayTerms, includeNewOperationalStatusExceptions: false },
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: [{ id: 3, date: "2026-09-10", source: "plant_usage", usageStatus: "idle_no_operator" }],
    });
    expect(historical.exceptions).toEqual([]);
  });

  it("never guesses a divisor for hourly/trip rates or an incomplete monthly agreement", () => {
    const unavailable = calculateHireBilling({
      terms: { ...twoDayTerms, monthlyDivisorType: "custom", monthlyDivisor: undefined },
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: [{ id: 70, date: "2026-09-10", source: "plant_usage", usageStatus: "idle_no_operator" }],
      exceptionDecisions: [{
        sourceType: "usage", sourceId: 70, exceptionType: "operator_unavailable",
        date: "2026-09-10", decision: "full_day",
      }],
    });
    expect(unavailable.exceptions[0]).toMatchObject({
      deductionAmount: 0,
      suggestionWorkings: { unavailableReason: "The applicable monthly divisor is unavailable." },
    });
    expect(getHireReviewGaps({ ...unavailable, terms: twoDayTerms } as any))
      .toContain("operator-unavailable rate/divisor on 2026-09-10");

    const hourly = calculateHireBilling({
      terms: { ...twoDayTerms, billingBasis: "hourly", rate: 500, monthlyDivisorType: undefined, monthlyDivisor: undefined },
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      usage: [{ id: 71, date: "2026-09-10", source: "plant_usage", usageStatus: "idle_no_operator" }],
    });
    const hourlyOperatorException = hourly.exceptions.find(item => item.exceptionType === "operator_unavailable");
    expect(hourlyOperatorException?.suggestedDeductionAmount).toBeUndefined();
    expect(hourlyOperatorException?.suggestionWorkings?.unavailableReason)
      .toBe("A daily conversion is not defined for hourly or trip hire rates.");
  });
});