import { describe, expect, it } from "vitest";
import { computeEquipmentUsage } from "../shared/equipmentUsage";

describe("canonical equipment usage calculation", () => {
  it("uses hour meter before time and applies the hourly norm", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4 },
      { openingReading: 100, closingReading: 106, startTime: "08:00", endTime: "18:00" },
    );
    expect(result).toMatchObject({ basis: "hour_meter", hoursWorked: 6, totalKm: null, expectedDiesel: 24, efficiencyValue: 4 });
  });

  it("never stores odometer kilometres as hours", () => {
    const result = computeEquipmentUsage(
      { meterType: "odometer", consumptionNorm: 0.3 },
      { openingReading: 1200, closingReading: 1250 },
    );
    expect(result).toMatchObject({ basis: "odometer", hoursWorked: null, totalKm: 50, expectedDiesel: 15, efficiencyUnit: "L/km" });
  });

  it("uses time only as the documented fallback for hour meters", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 5 },
      { startTime: "08:30", endTime: "10:00" },
    );
    expect(result).toMatchObject({ basis: "time_fallback", hoursWorked: 1.5, totalKm: null, expectedDiesel: 7.5 });
  });

  it("uses trip km and converts an hourly norm when trip mode is explicit", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 5 },
      { entryType: "trip_based", numberOfTrips: 2, tripDistance: 10 },
    );
    expect(result).toMatchObject({ basis: "trip_based", hoursWorked: null, totalKm: 40, expectedDiesel: 8, efficiencyValue: 0.2 });
  });

  it("does not let breakdown downtime override a valid meter difference", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4 },
      {
        openingReading: 100,
        closingReading: 106,
        startTime: "08:00",
        endTime: "18:00",
        breakdowns: [{ fromTime: "10:00", toTime: "12:00" }],
      },
    );
    expect(result).toMatchObject({
      basis: "hour_meter",
      hoursWorked: 6,
      downtimeHours: 2,
      expectedDiesel: 24,
    });
  });

  it("subtracts the union of valid, in-shift breakdowns from time fallback", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 5 },
      {
        startTime: "08:00",
        endTime: "18:00",
        breakdowns: [
          { fromTime: "09:00", toTime: "11:00" },
          { fromTime: "10:30", toTime: "12:00" },
          { fromTime: "07:00", toTime: "08:30" },
          { fromTime: "16:00", toTime: "15:00" },
        ],
      },
    );
    expect(result).toMatchObject({
      basis: "time_fallback",
      downtimeHours: 3.5,
      hoursWorked: 6.5,
      expectedDiesel: 32.5,
    });
  });

  it("warns on a decreasing meter and visibly identifies the fallback basis", () => {
    const result = computeEquipmentUsage(
      { meterType: "odometer", consumptionNorm: 0.2 },
      { openingReading: 500, closingReading: 490, startTime: "08:00", endTime: "10:00" },
    );
    expect(result.basis).toBe("time_fallback");
    expect(result.totalKm).toBe(50);
    expect(result.warning).toMatch(/lower than opening/i);
  });

  it("derives actual diesel from tank inputs and returns its discrepancy", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4 },
      {
        openingReading: 10,
        closingReading: 15,
        openingDiesel: 30,
        diesel: 20,
        dieselBalanceInTank: 25,
      },
    );
    expect(result).toMatchObject({
      expectedDiesel: 20,
      actualDiesel: 25,
      actualDieselBasis: "tank_derived",
      dieselVariance: 5,
      discrepancy: 5,
    });
  });

  it("keeps tank-vs-entered discrepancy separate from norm variance", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 2 },
      {
        openingReading: 10,
        closingReading: 15,
        openingDiesel: 30,
        diesel: 20,
        dieselBalanceInTank: 25,
      },
    );
    expect(result.actualDiesel).toBe(25);
    expect(result.dieselVariance).toBe(15);
    expect(result.discrepancy).toBe(5);
  });

  it("warns when a fallback time range is invalid", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4 },
      { startTime: "18:00", endTime: "08:00" },
    );
    expect(result.basis).toBe("none");
    expect(result.warning).toMatch(/end time is invalid/i);
  });

  it("does not report impossible negative tank consumption", () => {
    const result = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4 },
      {
        openingReading: 1,
        closingReading: 2,
        openingDiesel: 10,
        diesel: 2,
        dieselBalanceInTank: 15,
      },
    );
    expect(result.actualDiesel).toBe(2);
    expect(result.actualDieselBasis).toBe("issued_only");
    expect(result.warning).toMatch(/tank-derived consumption is invalid/i);
  });
});