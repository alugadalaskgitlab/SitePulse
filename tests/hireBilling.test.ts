import { describe, expect, it } from "vitest";
import { calculateHireBilling, calculateHireGroup, getHireReviewGaps, normalizeHireActivities, planHireRegisterRows } from "../shared/hireBilling";

describe("hire billing calculator", () => {
  it("constrains monthly billing to hire dates and prorates partial calendar months", () => {
    const result = calculateHireBilling({
      terms: { billingBasis: "monthly", rate: 31_000, hireStartDate: "2025-01-16", hireEndDate: "2025-02-10", monthlyDivisorType: "calendar" },
      periodFrom: "2025-01-01", periodTo: "2025-02-28",
    });
    expect(result).toMatchObject({ billablePeriodFrom: "2025-01-16", billablePeriodTo: "2025-02-10", grossAmount: 27_071.43, netAmount: 27_071.43 });
  });

  it("uses 30 and custom monthly partial-period divisors but does not overcharge a full 31-day month", () => {
    expect(calculateHireBilling({ terms: { billingBasis: "monthly", rate: 30_000, monthlyDivisorType: "30" }, periodFrom: "2025-01-01", periodTo: "2025-01-31" }).grossAmount).toBe(30_000);
    expect(calculateHireBilling({ terms: { billingBasis: "monthly", rate: 30_000, monthlyDivisorType: "custom", monthlyDivisor: 20 }, periodFrom: "2025-01-11", periodTo: "2025-01-20" }).grossAmount).toBe(15_000);
  });

  it("does not deduct monthly HLC idle/no-work days", () => {
    const result = calculateHireBilling({ terms: { billingBasis: "monthly", rate: 30_000 }, periodFrom: "2025-04-01", periodTo: "2025-04-30", usage: [] });
    expect(result).toMatchObject({ grossAmount: 30_000, deductionAmount: 0, requiresReview: false });
  });

  it("deduplicates daily segments into full payable days", () => {
    const result = calculateHireBilling({ terms: { billingBasis: "daily", rate: 1000 }, periodFrom: "2025-04-01", periodTo: "2025-04-03", usage: [{ id: 1, date: "2025-04-01" }, { id: 2, date: "2025-04-01" }, { id: 3, date: "2025-04-02" }] });
    expect(result).toMatchObject({ quantity: 2, grossAmount: 2000, netAmount: 2000 });
  });

  it("allows an explicit daily half-day decision with a reason", () => {
    const result = calculateHireBilling({ terms: { billingBasis: "daily", rate: 1000 }, periodFrom: "2025-04-01", periodTo: "2025-04-01", usage: [{ date: "2025-04-01" }], dailyDecisions: [{ date: "2025-04-01", decision: "half_day", reason: "released at noon" }] });
    expect(result).toMatchObject({ quantity: 0.5, grossAmount: 500, payableDays: [{ date: "2025-04-01", fraction: 0.5, reason: "released at noon" }] });
  });

  it("allows excluding an otherwise suggested daily activity", () => {
    const result = calculateHireBilling({ terms: { billingBasis: "daily", rate: 1000 }, periodFrom: "2025-04-01", periodTo: "2025-04-01", usage: [{ date: "2025-04-01" }], dailyDecisions: [{ date: "2025-04-01", decision: "exclude" }] });
    expect(result).toMatchObject({ quantity: 0, grossAmount: 0, payableDays: [{ date: "2025-04-01", fraction: 0 }] });
  });

  it("only totals positive reliable hourly values and emits exceptions rather than guessing", () => {
    const result = calculateHireBilling({ terms: { billingBasis: "hourly", rate: 100 }, periodFrom: "2025-04-01", periodTo: "2025-04-02", usage: [{ id: 1, date: "2025-04-01", hoursOrKmRun: 4 }, { id: 2, date: "2025-04-02", hoursOrKmRun: 0 }, { id: 3, date: "2025-04-02" }] });
    expect(result).toMatchObject({ quantity: 4, grossAmount: 400, requiresReview: true });
    expect(result.exceptions.map(x => x.exceptionType)).toEqual(["missing_hours", "missing_hours"]);
  });

  it("does not bill an open operational usage row", () => {
    const result = calculateHireBilling({
      terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      usage: [{ id: 9, date: "2025-04-01", status: "open" }],
    });
    expect(result).toMatchObject({ quantity: 0, grossAmount: 0, requiresReview: true });
    expect(result.exceptions[0].exceptionType).toBe("open_usage");
  });

  it("accepts only valid trip_based trip counts", () => {
    const result = calculateHireBilling({ terms: { billingBasis: "trip", rate: 500 }, periodFrom: "2025-04-01", periodTo: "2025-04-03", usage: [{ id: 1, date: "2025-04-01", entryType: "trip_based", numberOfTrips: 3 }, { id: 2, date: "2025-04-02", entryType: "daily", numberOfTrips: 9 }, { id: 3, date: "2025-04-03", entryType: "trip_based", numberOfTrips: 0 }] });
    expect(result).toMatchObject({ quantity: 3, grossAmount: 1500, requiresReview: true });
    expect(result.exceptions).toHaveLength(2);
  });

  it("makes breakdowns review exceptions and applies only explicit full/half/none/manual decisions", () => {
    const base = { terms: { billingBasis: "monthly" as const, rate: 30_000, monthlyDivisorType: "30" as const, breakdownDeductionEnabled: true }, periodFrom: "2025-04-01", periodTo: "2025-04-30", maintenance: [{ id: 7, date: "2025-04-11", eventType: "breakdown", downtimeHours: 0.25 }] };
    const pending = calculateHireBilling(base);
    expect(pending).toMatchObject({ deductionAmount: 0, requiresReview: true, workflow: ["draft", "reviewed", "approved", "billed"] });
    expect(pending.exceptions[0]).toMatchObject({ downtimeHours: 0.25, deductionAmount: 0 });
    const decided = calculateHireBilling({ ...base, exceptionDecisions: [{ sourceType: "maintenance", sourceId: 7, exceptionType: "breakdown", date: "2025-04-11", decision: "half_day" }] });
    expect(decided).toMatchObject({ deductionAmount: 500, netAmount: 29_500 });
  });

  it("does not deduct breakdowns when the hire agreement disables vendor-breakdown deductions", () => {
    const result = calculateHireBilling({
      terms: { billingBasis: "monthly", rate: 30_000, monthlyDivisorType: "30", breakdownDeductionEnabled: false },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-30",
      maintenance: [{ id: 8, date: "2025-04-11", eventType: "breakdown" }],
      exceptionDecisions: [{ sourceType: "maintenance", sourceId: 8, exceptionType: "breakdown", date: "2025-04-11", decision: "full_day" }],
    });
    expect(result).toMatchObject({ deductionAmount: 0, netAmount: 30_000, requiresReview: true });
  });

  it("rejects manual adjustments outside the active billed period", () => {
    expect(() => calculateHireBilling({
      terms: { billingBasis: "daily", rate: 1000, hireStartDate: "2025-04-05" },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-30",
      exceptionDecisions: [{ sourceType: "manual", date: "2025-04-02", decision: "manual", manualDeductionAmount: 100 }],
    })).toThrow("active billed period");
  });

  it("caps deductions at the statement gross amount", () => {
    const result = calculateHireBilling({
      terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      usage: [{ date: "2025-04-01" }],
      exceptionDecisions: [{ sourceType: "manual", date: "2025-04-01", decision: "manual", manualDeductionAmount: 5000 }],
    });
    expect(result).toMatchObject({ grossAmount: 1000, deductionAmount: 1000, netAmount: 0 });
  });

  it("allows clean statements to skip reviewed", () => {
    expect(calculateHireBilling({ terms: { billingBasis: "daily", rate: 1 }, periodFrom: "2025-01-01", periodTo: "2025-01-01" }).workflow).toEqual(["draft", "approved", "billed"]);
  });
});

describe("normalized vendor-bill hire groups", () => {
  it("collapses daily dates across sources but drops DPR only for an explicit mirrored plant usage", () => {
    const rows = normalizeHireActivities([
      { source: "dpr_log", sourceId: 1, equipmentId: 9, businessDate: "2025-04-01", plantUsageId: 8 },
      { source: "plant_usage", sourceId: 8, equipmentId: 9, businessDate: "2025-04-01" },
      { source: "dpr_log", sourceId: 2, equipmentId: 9, businessDate: "2025-04-02" },
      { source: "plant_usage", sourceId: 9, equipmentId: 9, businessDate: "2025-04-02" },
    ]);
    expect(rows.map(row => `${row.source}:${row.sourceId}`)).toEqual(["plant_usage:8", "dpr_log:2", "plant_usage:9"]);
    const daily = calculateHireGroup({ terms: { billingBasis: "daily", rate: 100 }, periodFrom: "2025-04-01", periodTo: "2025-04-02", activities: rows });
    expect(daily.quantity).toBe(2);
  });

  it("uses only stored/corrected positive trips and records an explicit ignored diesel recovery", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "trip", rate: 10 }, periodFrom: "2025-04-01", periodTo: "2025-04-01",
      activities: [{ source: "dpr_log", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", entryType: "trip_based", numberOfTrips: 3, actualDiesel: 20, expectedDiesel: 15 }],
      dieselRecovery: { decision: "ignore", remarks: "approved variance" },
    });
    expect(result).toMatchObject({ quantity: 3, grossAmount: 30, netAmount: 30, diesel: { suggestedExcess: 5, finalRecoveryAmount: 0, recoveryDecision: "ignore" } });
  });

  it("keeps unlinked same-date trip rows separate while removing only the explicit DPR mirror", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "trip", rate: 100 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [
        { source: "plant_usage", sourceId: 20, equipmentId: 2, businessDate: "2025-04-01", entryType: "trip_based", numberOfTrips: 3 },
        { source: "dpr_log", sourceId: 10, equipmentId: 2, businessDate: "2025-04-01", entryType: "trip_based", numberOfTrips: 3, plantUsageId: 20 },
        { source: "dpr_log", sourceId: 11, equipmentId: 2, businessDate: "2025-04-01", entryType: "trip_based", numberOfTrips: 2 },
      ],
      tripDecisions: [
        { source: "plant_usage", sourceId: 20, correctedTrips: 4 },
        { source: "dpr_log", sourceId: 11, selected: false },
      ],
    });
    expect(result).toMatchObject({ quantity: 4, grossAmount: 400, activityIds: ["dpr_log:11", "plant_usage:20"] });
  });

  it("deducts only a reviewed monetary HSD recovery and never treats excess litres as currency", () => {
    const input = {
      terms: { billingBasis: "daily" as const, rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{ source: "plant_usage" as const, sourceId: 20, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 20, expectedDiesel: 15 }],
    };
    expect(calculateHireGroup({ ...input, dieselRecovery: { decision: "accept", finalAmount: 300 } }))
      .toMatchObject({ grossAmount: 1000, netAmount: 700, diesel: { suggestedExcess: 5, finalRecoveryAmount: 300 } });
    expect(() => calculateHireGroup({ ...input, dieselRecovery: { decision: "accept" } }))
      .toThrow("explicit non-negative diesel recovery amount");
  });

  it("blocks lifecycle review until every exception and excess-HSD disposition is explicit", () => {
    const pending = calculateHireGroup({
      terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{ source: "plant_usage", sourceId: 20, equipmentId: 2, businessDate: "2025-04-01", status: "open", actualDiesel: 20, expectedDiesel: 15 }],
    });
    expect(getHireReviewGaps(pending)).toEqual([
      "open_usage on 2025-04-01",
      "HSD recovery disposition",
    ]);

    const reviewed = calculateHireGroup({
      terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{ source: "plant_usage", sourceId: 20, equipmentId: 2, businessDate: "2025-04-01", status: "open", actualDiesel: 20, expectedDiesel: 15 }],
      exceptionDecisions: [{ sourceType: "usage", sourceId: 20, exceptionType: "open_usage", date: "2025-04-01", decision: "none" }],
      dieselRecovery: { decision: "ignore" },
    });
    expect(getHireReviewGaps(reviewed)).toEqual([]);
  });

  it("does not turn a zero-activity equipment metadata row into billable activity", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "monthly", rate: 30_000 }, periodFrom: "2025-04-01", periodTo: "2025-04-30",
      activities: [{ source: "equipment_default", sourceId: 2, equipmentId: 2, businessDate: "2025-04-01" }],
    });
    expect(result).toMatchObject({ quantity: 1, grossAmount: 30_000, activityIds: [] });
  });

  it("honors an explicit breakdown decision in a bill group even if the master default is disabled", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "monthly", rate: 30_000, breakdownDeductionEnabled: true },
      periodFrom: "2025-04-01", periodTo: "2025-04-30", activities: [],
      maintenance: [{ id: 7, date: "2025-04-10", eventType: "breakdown" }],
      exceptionDecisions: [{ sourceType: "maintenance", sourceId: 7, exceptionType: "breakdown", date: "2025-04-10", decision: "full_day" }],
    });
    expect(result).toMatchObject({ deductionAmount: 1000, netAmount: 29_000 });
  });
});

describe("hire billing register", () => {
  it("keeps historical statements visible after the current master is no longer hire-configured", () => {
    const historical = { id: 41, equipmentId: 7, periodFrom: "2025-04-01", periodTo: "2025-04-30", status: "approved" };
    const plan = planHireRegisterRows([historical], [], "2025-04-01", "2025-04-30");
    expect(plan.persistedStatements).toEqual([historical]);
    expect(plan.transientEquipment).toEqual([]);
  });

  it("does not offer draft creation outside the agreement or beside an overlapping statement", () => {
    const equipment = { id: 7, hireStartDate: "2025-05-01", hireEndDate: "2025-06-30" };
    expect(planHireRegisterRows([], [equipment], "2025-04-01", "2025-04-30").transientEquipment).toEqual([]);

    const existing = { equipmentId: 7, periodFrom: "2025-05-15", periodTo: "2025-05-31" };
    expect(planHireRegisterRows([existing], [equipment], "2025-05-01", "2025-05-31").transientEquipment).toEqual([]);
  });
});