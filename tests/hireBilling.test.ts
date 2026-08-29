import { describe, expect, it } from "vitest";
import { availableOtherBillItems, buildHireActivityDays, calculateHireBilling, calculateHireDieselPricing, calculateHireGroup, getHireReviewGaps, mergeOtherBillItems, normalizeHireActivities, planHireRegisterRows, rawAutoItemCoveredByHireGroup } from "../shared/hireBilling";

describe("hire billing calculator", () => {
  it("appends Pull Other Items without replacing hire-group or manual lines", () => {
    const existing = [
      { source: "hire_group", sourceId: "group:7", date: "2026-07-19", description: "TRACTOR DOZER MONTHLY HIRE" },
      { source: "manual", date: "2026-07-20", description: "MANUAL ADJUSTMENT" },
    ];
    const candidates = [
      { source: "auto", sourceId: "material:1", date: "2026-07-21", category: "material", description: "AGGREGATE" },
      { source: "auto", sourceId: "trip:2", date: "2026-07-22", category: "transport", description: "TRUCK TRIP" },
    ];

    const available = availableOtherBillItems(candidates, existing, []);
    expect(available).toHaveLength(2);
    expect(mergeOtherBillItems(existing, available)).toEqual([...existing, ...candidates]);
  });

  it("uses identical pull eligibility for count and insertion and ignores repeated pulls", () => {
    const group = [{ equipmentId: 7, periodFrom: "2026-07-19", periodTo: "2026-07-31" }];
    const existing = [{ source: "manual", date: "2026-07-19", description: "KEEP ME" }];
    const candidates = [
      { source: "auto", sourceId: "equipment:1", category: "equipment", equipmentId: 7, date: "2026-07-20", description: "TRACTOR DOZER - DAILY HIRE" },
      { source: "auto", sourceId: "equipment:2", category: "equipment", equipmentId: 8, date: "2026-07-20", description: "ROLLER - DAILY HIRE" },
      { source: "auto", sourceId: "equipment:3", category: "equipment", equipmentId: 9, date: "2026-07-20", entryType: "monthly", description: "PAVER - MONTHLY HIRE" },
      { source: "auto", sourceId: "trip:4", date: "2026-07-21", category: "transport", description: "TRUCK TRIP" },
    ];

    const available = availableOtherBillItems(candidates, existing, group);
    expect(available.map(item => item.sourceId)).toEqual(["equipment:2", "trip:4"]);
    const once = mergeOtherBillItems(existing, available);
    expect(once).toHaveLength(existing.length + available.length);
    expect(mergeOtherBillItems(once, available)).toEqual(once);
  });

  it("deduplicates the same auto row after save/reload when sourceId is not persisted", () => {
    const saved = [{ source: "auto:material:1", date: "2026-07-21", category: "material", description: "AGGREGATE", siteName: "PLANT" }];
    const refetched = [{ source: "auto", sourceId: "material:1", date: "2026-07-21", category: "material", description: "AGGREGATE", siteName: "PLANT" }];
    expect(availableOtherBillItems(refetched, saved, [])).toEqual([]);
  });

  it("keeps distinct source rows eligible when their displayed fields are identical", () => {
    const candidates = [
      { source: "auto", sourceId: "material_receipt:1", date: "2026-07-21", category: "material", description: "AGGREGATE (PLANT)", siteName: "PLANT" },
      { source: "auto", sourceId: "material_receipt:2", date: "2026-07-21", category: "material", description: "AGGREGATE (PLANT)", siteName: "PLANT" },
    ];
    expect(availableOtherBillItems(candidates, [], [])).toEqual(candidates);
    expect(availableOtherBillItems(candidates, [{ ...candidates[0], source: "auto:material_receipt:1", sourceId: undefined }], []))
      .toEqual([candidates[1]]);
  });
  it("matches only raw auto equipment rows inside a hire-group period", () => {
    const groups = [{ equipmentId: 7, periodFrom: "2026-08-01", periodTo: "2026-08-15" }];

    expect(rawAutoItemCoveredByHireGroup({ source: "auto", category: "equipment", equipmentId: 7, date: "2026-08-01" }, groups)).toBeTruthy();
    expect(rawAutoItemCoveredByHireGroup({ source: "auto", category: "equipment", equipmentId: 7, date: "2026-08-15" }, groups)).toBeTruthy();
    expect(rawAutoItemCoveredByHireGroup({ source: "auto", category: "equipment", equipmentId: 7, date: "2026-08-16" }, groups)).toBeUndefined();
    expect(rawAutoItemCoveredByHireGroup({ source: "auto", category: "equipment", equipmentId: 8, date: "2026-08-10" }, groups)).toBeUndefined();
    expect(rawAutoItemCoveredByHireGroup({ source: "manual", category: "equipment", equipmentId: 7, date: "2026-08-10" }, groups)).toBeUndefined();
    expect(rawAutoItemCoveredByHireGroup({ source: "auto", category: "equipment", equipmentId: null, date: "2026-08-10" }, groups)).toBeUndefined();
    expect(rawAutoItemCoveredByHireGroup({ source: "auto", category: "transport", equipmentId: 7, date: "2026-08-10" }, groups)).toBeUndefined();
  });

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

  it("accepts only the period-net auto-priced HSD suggestion and keeps manual edits explicit", () => {
    const input = {
      terms: { billingBasis: "daily" as const, rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{ source: "plant_usage" as const, sourceId: 20, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 20, expectedDiesel: 15 }],
      dieselPurchases: [{ id: 1, date: "2025-04-01", rate: 60, qtyPurchased: 100 }],
    };
    expect(calculateHireGroup({ ...input, dieselRecovery: { decision: "accept" } }))
      .toMatchObject({ grossAmount: 1000, netAmount: 700, diesel: { suggestedExcess: 5, finalRecoveryAmount: 300 } });
    expect(calculateHireGroup({ ...input, dieselRecovery: { decision: "edit", finalAmount: 250 } }))
      .toMatchObject({ netAmount: 750, diesel: { finalRecoveryAmount: 250 } });
    expect(() => calculateHireGroup({ ...input, dieselRecovery: { decision: "edit" } }))
      .toThrow("explicit non-negative diesel recovery amount");
  });

  it("prices period-net excess HSD from a same-day purchase", () => {
    const pricing = calculateHireDieselPricing(
      [{ source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 20, expectedDiesel: 15 }],
      [{ id: 10, date: "2025-04-01", rate: 92.4, qtyPurchased: 200 }],
    );
    expect(pricing).toMatchObject({
      actualDiesel: 20,
      expectedDiesel: 15,
      suggestedExcess: 5,
      applicableRate: 92.4,
      suggestedRecoveryAmount: 462,
      rateUnavailable: false,
      dailyPricing: [{ rateDate: "2025-04-01", purchaseSources: [{ id: 10 }] }],
    });
  });

  it("uses a quantity-weighted same-day purchase rate for period-net recovery", () => {
    const pricing = calculateHireDieselPricing(
      [{ source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-02", actualDiesel: 30, expectedDiesel: 20 }],
      [
        { id: 10, date: "2025-04-02", rate: 90, qtyPurchased: 100 },
        { id: 11, date: "2025-04-02", rate: 100, qtyPurchased: 300 },
      ],
    );
    expect(pricing).toMatchObject({
      actualDiesel: 30,
      expectedDiesel: 20,
      suggestedExcess: 10,
      applicableRate: 97.5,
      suggestedRecoveryAmount: 975,
    });
  });

  it("uses period-net diesel excess so low-consumption days offset high-consumption days", () => {
    const pricing = calculateHireDieselPricing(
      [
        { source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 25.25, expectedDiesel: 14.12 },
        { source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-04-02", actualDiesel: 15.87, expectedDiesel: 15.88 },
      ],
      [{ id: 10, date: "2025-04-01", rate: 90, qtyPurchased: 100 }],
    );
    expect(pricing).toMatchObject({
      actualDiesel: 41.12,
      expectedDiesel: 30,
      suggestedExcess: 11.12,
      suggestedRecoveryAmount: 1000.8,
    });
    expect(pricing.dailyPricing.map(day => day.variance)).toEqual([11.13, -0.01]);
  });

  it("fully offsets opposite daily variances and keeps both signed audit values", () => {
    const pricing = calculateHireDieselPricing(
      [
        { source: "dpr_log", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 6, expectedDiesel: 4 },
        { source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-04-02", actualDiesel: 2, expectedDiesel: 4 },
      ],
      [{ id: 10, date: "2025-04-01", rate: 90, qtyPurchased: 100 }],
    );
    expect(pricing).toMatchObject({ actualDiesel: 8, expectedDiesel: 8, suggestedExcess: 0, suggestedRecoveryAmount: 0 });
    expect(pricing.dailyPricing.map(day => day.variance)).toEqual([2, -2]);
  });

  it("weights the period HSD rate by every priced day's actual litres, not daily excess", () => {
    const pricing = calculateHireDieselPricing(
      [
        { source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 10, expectedDiesel: 4 },
        { source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-04-02", actualDiesel: 30, expectedDiesel: 35 },
      ],
      [
        { id: 10, date: "2025-04-01", rate: 90, qtyPurchased: 100 },
        { id: 11, date: "2025-04-02", rate: 100, qtyPurchased: 100 },
        { id: 12, date: "2025-04-03", rate: 1, qtyPurchased: 10_000 },
      ],
    );
    expect(pricing).toMatchObject({
      actualDiesel: 40,
      expectedDiesel: 39,
      suggestedExcess: 1,
      applicableRate: 97.5,
      suggestedRecoveryAmount: 97.5,
    });
  });

  it("uses priced actual days when rate coverage is partial and reports every gap", () => {
    const pricing = calculateHireDieselPricing(
      [
        { source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 5, expectedDiesel: 2 },
        { source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-04-02", actualDiesel: 15, expectedDiesel: 8 },
      ],
      [{ id: 10, date: "2025-04-02", rate: 80, qtyPurchased: 100 }],
    );
    expect(pricing).toMatchObject({
      suggestedExcess: 10,
      applicableRate: 80,
      rateUnavailable: false,
      suggestedRecoveryAmount: 800,
      unpricedActualDates: ["2025-04-01"],
    });
  });

  it("prices period-net recovery from the latest prior purchase and never a future purchase", () => {
    const pricing = calculateHireDieselPricing(
      [{ source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-05", actualDiesel: 18, expectedDiesel: 10 }],
      [
        { id: 9, date: "2025-04-01", rate: 80, qtyPurchased: 50 },
        { id: 10, date: "2025-04-03", rate: 90, qtyPurchased: 50 },
        { id: 11, date: "2025-04-06", rate: 1, qtyPurchased: 10_000 },
      ],
    );
    expect(pricing).toMatchObject({
      actualDiesel: 18,
      expectedDiesel: 10,
      suggestedExcess: 8,
      applicableRate: 90,
      suggestedRecoveryAmount: 720,
      dailyPricing: [{ rateDate: "2025-04-03", purchaseSources: [{ id: 10 }] }],
    });
  });

  it("reports a period rate unavailable without fabricating recovery and permits a manual edit", () => {
    const input = {
      terms: { billingBasis: "daily" as const, rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{ source: "plant_usage" as const, sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 20, expectedDiesel: 15 }],
      dieselPurchases: [{ id: 2, date: "2025-04-02", rate: 90, qtyPurchased: 100 }],
    };
    const unpriced = calculateHireGroup(input);
    expect(unpriced.diesel).toMatchObject({ suggestedExcess: 5, rateUnavailable: true });
    expect(unpriced.diesel.suggestedRecoveryAmount).toBeUndefined();
    expect(() => calculateHireGroup({ ...input, dieselRecovery: { decision: "accept" } })).toThrow("rate is unavailable");
    expect(calculateHireGroup({ ...input, dieselRecovery: { decision: "edit", finalAmount: 400 } }).diesel.finalRecoveryAmount).toBe(400);
  });

  it("builds every day of the activity review without treating no activity as a deduction", () => {
    const days = buildHireActivityDays(
      "2025-07-19",
      "2025-07-22",
      [
        { source: "dpr_log", sourceId: 1, equipmentId: 2, businessDate: "2025-07-19", hoursOrKmRun: 8.5, actualDiesel: 24 },
        { source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-07-20", hoursOrKmRun: 7, numberOfTrips: 3, actualDiesel: 21, movementReference: "TO YARD" },
      ],
      [{ id: 3, date: "2025-07-22", eventType: "breakdown", downtimeHours: 2.5, description: "HOSE FAILURE" }],
    );
    expect(days).toEqual([
      expect.objectContaining({ date: "2025-07-19", activity: "worked", hours: 8.5, actualDiesel: 24, dieselVariance: 24 }),
      expect.objectContaining({ date: "2025-07-20", activity: "worked", hours: 7, trips: 3, actualDiesel: 21, movementReferences: ["TO YARD"] }),
      expect.objectContaining({ date: "2025-07-21", activity: "no_activity", activityCount: 0 }),
      expect.objectContaining({ date: "2025-07-22", activity: "breakdown", downtimeHours: 2.5, maintenanceDescriptions: ["HOSE FAILURE"] }),
    ]);
    const monthly = calculateHireBilling({ terms: { billingBasis: "monthly", rate: 30_000 }, periodFrom: "2025-07-19", periodTo: "2025-07-22", usage: [] });
    expect(monthly.deductionAmount).toBe(0);
  });

  it("freezes all 13 calendar dates and reliable measurement fields into a monthly snapshot", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "monthly", rate: 30_000 },
      periodFrom: "2025-07-19",
      periodTo: "2025-07-31",
      activities: [{
        source: "plant_usage", sourceId: 1, equipmentId: 2, equipmentName: "TRACTOR DOZER",
        businessDate: "2025-07-19", site: "ROAD SITE", task: "EARTHWORK",
        hoursOrKmRun: 8, openingReading: 100, closingReading: 108, actualDiesel: 24, expectedDiesel: 20,
      }],
    });
    expect(result.workingSheet).toHaveLength(13);
    expect(result.workingSheet[0]).toMatchObject({
      date: "2025-07-19", equipmentNames: ["TRACTOR DOZER"], siteLocations: ["ROAD SITE"],
      activityDescriptions: ["EARTHWORK"], openingReadings: [100], closingReadings: [108], dieselVariance: 4,
    });
    expect(result.workingSheet.slice(1).every(day => day.activity === "no_activity")).toBe(true);
    expect(result).toMatchObject({ grossAmount: 13_000, deductionAmount: 0 });
  });

  it("keeps recorded NO WORK distinct from a computed no-activity calendar date", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "monthly", rate: 60_000, monthlyDivisorType: "calendar" },
      periodFrom: "2026-07-19",
      periodTo: "2026-07-31",
      activities: [
        { source: "dpr_log", sourceId: 1, equipmentId: 7, businessDate: "2026-07-19", task: "NO WORK (SITE)", actualDiesel: 41.12, expectedDiesel: 30 },
      ],
      dieselPurchases: [{ id: 1, date: "2026-07-19", rate: 104.6, qtyPurchased: 100 }],
      dieselRecovery: { decision: "accept" },
    });
    expect(result.workingSheet).toHaveLength(13);
    expect(result.workingSheet[0]).toMatchObject({
      activity: "worked",
      activityCount: 1,
      activityDescriptions: ["NO WORK (SITE)"],
    });
    expect(result.workingSheet[1]).toMatchObject({
      activity: "no_activity",
      activityCount: 0,
      activityDescriptions: [],
    });
    expect(result).toMatchObject({
      calculatedGrossAmount: 25_161.29,
      deductionAmount: 0,
      netAmount: 23_998.14,
      diesel: {
        actualDiesel: 41.12,
        expectedDiesel: 30,
        suggestedExcess: 11.12,
        suggestedRecoveryAmount: 1_163.15,
        finalRecoveryAmount: 1_163.15,
      },
    });
  });

  it("keeps recorded activity visible on a day that also has a breakdown", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "monthly", rate: 30_000, monthlyDivisorType: "30" },
      periodFrom: "2026-07-19",
      periodTo: "2026-07-19",
      activities: [{ source: "dpr_log", sourceId: 1, equipmentId: 7, businessDate: "2026-07-19", task: "NO WORK" }],
      maintenance: [{ id: 2, date: "2026-07-19", eventType: "breakdown", description: "HOSE FAILURE" }],
    });
    expect(result.workingSheet[0]).toMatchObject({
      activity: "breakdown",
      activityCount: 1,
      activityDescriptions: ["NO WORK"],
      maintenanceDescriptions: ["HOSE FAILURE"],
    });
  });

  it("suppresses only an explicit mirror while retaining real unlinked same-day activity in one visible day", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [
        { source: "dpr_log", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", plantUsageId: 10, hoursOrKmRun: 5, actualDiesel: 5, expectedDiesel: 4 },
        { source: "plant_usage", sourceId: 10, equipmentId: 2, businessDate: "2025-04-01", hoursOrKmRun: 5, actualDiesel: 5, expectedDiesel: 4 },
        { source: "dpr_log", sourceId: 2, equipmentId: 2, businessDate: "2025-04-01", hoursOrKmRun: 3, actualDiesel: 3, expectedDiesel: 2 },
      ],
    });
    expect(result.quantity).toBe(1);
    expect(result.activityIds).toEqual(["dpr_log:2", "plant_usage:10"]);
    expect(result.workingSheet).toEqual([
      expect.objectContaining({ date: "2025-04-01", activityCount: 2, hours: 8, actualDiesel: 8, expectedDiesel: 6 }),
    ]);
  });

  it("keeps open operational evidence visible but excludes it from daily and trip payable totals", () => {
    const openDaily = calculateHireGroup({
      terms: { billingBasis: "daily", rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{
        source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01",
        status: "open", entryType: "daily", hoursOrKmRun: 8,
      }],
    });
    expect(openDaily).toMatchObject({
      quantity: 0,
      decisions: { daily: [] },
      workingSheet: [{ date: "2025-04-01", activityCount: 1, billableActivityCount: 0, openActivityCount: 1 }],
    });

    const openTrip = calculateHireGroup({
      terms: { billingBasis: "trip", rate: 100 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{
        source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-04-01",
        status: "open", entryType: "trip_based", numberOfTrips: 5,
      }],
    });
    expect(openTrip.quantity).toBe(0);
  });

  it("uses hire-agreement bounds for quantity, diesel, evidence rows, and the frozen measurement period", () => {
    const result = calculateHireGroup({
      terms: {
        billingBasis: "daily",
        rate: 1000,
        hireStartDate: "2025-04-02",
        hireEndDate: "2025-04-03",
      },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-04",
      activities: [
        { source: "plant_usage", sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 10 },
        { source: "plant_usage", sourceId: 2, equipmentId: 2, businessDate: "2025-04-02", actualDiesel: 5 },
        { source: "plant_usage", sourceId: 3, equipmentId: 2, businessDate: "2025-04-04", actualDiesel: 10 },
      ],
    });
    expect(result).toMatchObject({
      quantity: 1,
      measurementPeriodFrom: "2025-04-02",
      measurementPeriodTo: "2025-04-03",
      activityIds: ["plant_usage:2"],
      diesel: { actualDiesel: 5 },
    });
    expect(result.workingSheet.map(day => day.date)).toEqual(["2025-04-02", "2025-04-03"]);
  });

  it("freezes date, recorded trips, and accepted trips for approved-history audit", () => {
    const result = calculateHireGroup({
      terms: { billingBasis: "trip", rate: 100 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{
        source: "plant_usage", sourceId: 10, equipmentId: 2, businessDate: "2025-04-01",
        entryType: "trip_based", numberOfTrips: 3,
      }],
      tripDecisions: [{ source: "plant_usage", sourceId: 10, correctedTrips: 4, remarks: "VERIFIED" }],
    });
    expect(result.quantity).toBe(4);
    expect(result.decisions.trip).toEqual([{
      source: "plant_usage",
      sourceId: 10,
      businessDate: "2025-04-01",
      selected: true,
      correctedTrips: 4,
      remarks: "VERIFIED",
      recordedTrips: 3,
      acceptedTrips: 4,
    }]);
  });

  it("keeps a saved period-net recovery snapshot unchanged when a later purchase appears", () => {
    const input = {
      terms: { billingBasis: "daily" as const, rate: 1000 },
      periodFrom: "2025-04-01",
      periodTo: "2025-04-01",
      activities: [{ source: "plant_usage" as const, sourceId: 1, equipmentId: 2, businessDate: "2025-04-01", actualDiesel: 20, expectedDiesel: 10 }],
      dieselRecovery: { decision: "accept" as const },
    };
    const savedSnapshot = calculateHireGroup({
      ...input,
      dieselPurchases: [{ id: 1, date: "2025-04-01", rate: 90, qtyPurchased: 100 }],
    });
    const frozenCopy = structuredClone(savedSnapshot);
    const recalculatedWithLaterPurchase = calculateHireGroup({
      ...input,
      dieselPurchases: [
        { id: 1, date: "2025-04-01", rate: 90, qtyPurchased: 100 },
        { id: 2, date: "2025-04-02", rate: 1, qtyPurchased: 10_000 },
      ],
    });
    expect(savedSnapshot).toEqual(frozenCopy);
    expect(recalculatedWithLaterPurchase.diesel).toMatchObject({
      suggestedRecoveryAmount: 900,
      finalRecoveryAmount: 900,
      dailyPricing: [{ rateDate: "2025-04-01", purchaseSources: [{ id: 1 }] }],
    });
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