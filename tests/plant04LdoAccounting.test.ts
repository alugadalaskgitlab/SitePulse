import { describe, expect, it } from "vitest";
import {
  assignHeatingSessionsToProductionDays,
  calculatePlantLdo,
  findLdoOpeningGaps,
} from "../shared/plantLdoAccounting";

describe("PLANT-04 production-day attribution", () => {
  const productionDays = [
    { date: "2026-11-23", plantStartTime: "08:00", plantStopTime: "18:00" },
    { date: "2026-11-27", plantStartTime: "08:00", plantStopTime: "18:00" },
  ];

  it("attributes overnight pre-heat to the next day when that day's plant starts after the session ends", () => {
    const [session] = assignHeatingSessionsToProductionDays(
      [{ id: 1, date: "2026-11-22", startTime: "22:00", endTime: "06:00" }],
      productionDays,
    );
    expect(session.countsForDate).toBe("2026-11-23");
  });

  it("attributes overlapping production-time sessions to the same day", () => {
    const [session] = assignHeatingSessionsToProductionDays(
      [{ id: 2, date: "2026-11-23", startTime: "07:30", endTime: "09:00" }],
      productionDays,
    );
    expect(session.countsForDate).toBe("2026-11-23");
  });

  it("attributes an overnight session that continues into production hours to that production day", () => {
    const [session] = assignHeatingSessionsToProductionDays(
      [{ id: 8, date: "2026-11-22", startTime: "22:00", endTime: "09:00" }],
      productionDays,
    );
    expect(session.countsForDate).toBe("2026-11-23");
  });

  it("rolls multiple idle-day sessions into the next production day and leaves later sessions waiting", () => {
    const sessions = assignHeatingSessionsToProductionDays(
      [
        { id: 3, date: "2026-11-24", startTime: "20:00", endTime: "22:00" },
        { id: 4, date: "2026-11-25", startTime: "20:00", endTime: "22:00" },
        { id: 5, date: "2026-11-26", startTime: "20:00", endTime: "22:00" },
        { id: 6, date: "2026-11-28", startTime: "20:00", endTime: "22:00" },
      ],
      productionDays,
    );
    expect(sessions.slice(0, 3).map((session) => session.countsForDate))
      .toEqual(["2026-11-27", "2026-11-27", "2026-11-27"]);
    expect(sessions[3].countsForDate).toBeNull();
  });

  it("leaves a session without an end time waiting instead of guessing its production day", () => {
    const [session] = assignHeatingSessionsToProductionDays(
      [{ id: 7, date: "2026-11-22", startTime: "22:00", endTime: null }],
      productionDays,
    );
    expect(session.countsForDate).toBeNull();
  });
});

describe("PLANT-04 LDO calculations", () => {
  it("reproduces the two-tank dip example with pre-heat counted once", () => {
    const result = calculatePlantLdo({
      tank1OpeningDipCm: 116,
      tank1ClosingDipCm: 100,
      tank2OpeningDipCm: 40,
      tank2ClosingDipCm: 40,
      dryerMeterOpening: 0,
      dryerMeterClosing: 450,
      preheatLitres: 165.6,
      preheatHours: 8,
      preheatSessionCount: 1,
      nightsCount: 1,
      plantRunHours: 10,
      dispatchedMt: 200,
    });
    expect(result.preheatLitresPerHour).toBeCloseTo(20.7, 0);
    expect(result.boilerDuringProductionLitres).toBeCloseTo(212, 0);
    expect(result.boilerDuringProductionLitresPerHour).toBeCloseTo(21.2, 0);
    expect(result.boilerLitresPerMt).toBeCloseTo(1.89, 2);
    expect(result.dryerLitresPerMt).toBe(2.25);
    expect(result.totalLitres).toBeCloseTo(828, 0);
    expect(result.totalLitresPerMt).toBeCloseTo(4.14, 2);
  });

  it("adds receipts into either tank and clamps a negative boiler dip calculation once", () => {
    const result = calculatePlantLdo({
      tank1OpeningDipCm: 20,
      tank1ClosingDipCm: 20,
      tank2OpeningDipCm: 20,
      tank2ClosingDipCm: 20,
      receiptsLitres: 4000,
      dryerMeterOpening: 10,
      dryerMeterClosing: 20,
      preheatLitres: 0,
      preheatHours: 0,
      preheatSessionCount: 0,
      nightsCount: 0,
    });
    expect(result.dipUsedLitres).toBe(4000);
    expect(result.boilerDuringProductionLitres).toBe(3990);
    expect(result.checkDipsOrDryerMeter).toBe(false);
  });

  it("includes Tank 2 dip consumption in the combined litres", () => {
    const result = calculatePlantLdo({
      tank1OpeningDipCm: 20,
      tank1ClosingDipCm: 20,
      tank2OpeningDipCm: 20,
      tank2ClosingDipCm: 10,
      preheatLitres: 0,
      preheatHours: 0,
      preheatSessionCount: 0,
      nightsCount: 0,
    });
    expect(result.tank2DropLitres).toBeGreaterThan(0);
    expect(result.dipUsedLitres).toBeCloseTo(result.tank2DropLitres!, 5);
  });

  it("uses boiler meter readings when both exist, otherwise uses dips", () => {
    const result = calculatePlantLdo({
      tank1OpeningDipCm: 20,
      tank1ClosingDipCm: 10,
      dryerMeterOpening: 0,
      dryerMeterClosing: 5,
      boilerMeterOpening: 100,
      boilerMeterClosing: 130,
      preheatLitres: 0,
      preheatHours: 0,
      preheatSessionCount: 0,
      nightsCount: 0,
    });
    expect(result.boilerMeterUsed).toBe(true);
    expect(result.boilerDuringProductionLitres).toBe(30);
  });

  it("uses a meter pair supplied by a heating session when the shift log has none", () => {
    const result = calculatePlantLdo({
      tank1OpeningDipCm: 20,
      tank1ClosingDipCm: 10,
      dryerMeterOpening: 0,
      dryerMeterClosing: 5,
      boilerMeterLitres: 24,
      preheatLitres: 0,
      preheatHours: 0,
      preheatSessionCount: 0,
      nightsCount: 0,
    });
    expect(result.boilerMeterUsed).toBe(true);
    expect(result.boilerDuringProductionLitres).toBe(24);
  });

  it("flags negative dip-derived boiler consumption and floors it at zero", () => {
    const result = calculatePlantLdo({
      tank1OpeningDipCm: 10,
      tank1ClosingDipCm: 20,
      dryerMeterOpening: 0,
      dryerMeterClosing: 30,
      preheatLitres: 0,
      preheatHours: 0,
      preheatSessionCount: 0,
      nightsCount: 0,
    });
    expect(result.checkDipsOrDryerMeter).toBe(true);
    expect(result.boilerDuringProductionLitres).toBe(0);
  });

  it("flags net inter-reading tank gaps greater than 40 L after receipts", () => {
    const result = findLdoOpeningGaps({
      previousAt: "2026-11-22 18:00",
      currentAt: "2026-11-23 08:00",
      tanks: [
        { tankNumber: 1, previousClosingLitres: 1000, currentOpeningLitres: 1445, receiptsLitres: 400 },
        { tankNumber: 2, previousClosingLitres: 500, currentOpeningLitres: 500, receiptsLitres: 0 },
      ],
    });
    expect(result).toEqual({
      unaccountedLitres: 45,
      gaps: [
        { tankNumber: 1, deltaLitres: 45 },
        { tankNumber: 2, deltaLitres: 0 },
      ],
    });
  });

  it("does not flag tank-to-tank transfers because they cancel in the combined balance", () => {
    const result = findLdoOpeningGaps({
      previousAt: "2026-11-22 18:00",
      currentAt: "2026-11-23 08:00",
      tanks: [
        { tankNumber: 1, previousClosingLitres: 1000, currentOpeningLitres: 900, receiptsLitres: 0 },
        { tankNumber: 2, previousClosingLitres: 500, currentOpeningLitres: 600, receiptsLitres: 0 },
      ],
    });
    expect(result).toBeNull();
  });
});
