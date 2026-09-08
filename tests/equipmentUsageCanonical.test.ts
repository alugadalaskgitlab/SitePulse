import { describe, expect, it } from "vitest";
import {
  computeEquipmentFuelSummary,
  computeEquipmentUsage,
  calculateEquipmentClockDuration,
  currentLocalEquipmentTime,
  formatEquipmentDuration,
  formatEquipmentTime,
  withEquipmentCreationStartTime,
} from "../shared/equipmentUsage";

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

  it("computes true physical fuel, variance and an actual hourly rate", () => {
    const usage = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4.75 },
      { openingReading: 1002, closingReading: 1009.5 },
    );
    expect(computeEquipmentFuelSummary(usage, {
      openingTank: 5,
      dieselIssued: 30,
      closingTank: 7,
    })).toMatchObject({
      actualConsumed: 28,
      expectedDiesel: 35.625,
      variance: -7.625,
      actualRate: 28 / 7.5,
      actualRateUnit: "L/hr",
    });
  });

  it("never treats issued or expected diesel as actual consumption without both tank readings", () => {
    const usage = computeEquipmentUsage(
      { meterType: "hour_meter", consumptionNorm: 4 },
      { openingReading: 10, closingReading: 12 },
    );
    expect(computeEquipmentFuelSummary(usage, {
      openingTank: 5,
      dieselIssued: 30,
      closingTank: null,
    })).toMatchObject({ actualConsumed: null, variance: null, actualRate: null, expectedDiesel: 8 });
  });

  it("defaults local time only when a new row explicitly requests it", () => {
    const now = new Date(2026, 8, 8, 9, 15);
    expect(currentLocalEquipmentTime(now)).toBe("09:15");
    expect(withEquipmentCreationStartTime({ startTime: "" }, now).startTime).toBe("09:15");
    expect(withEquipmentCreationStartTime({ startTime: "07:40" }, now).startTime).toBe("07:40");
  });

  it("formats clock duration and field times without changing decimal-hour data", () => {
    expect(calculateEquipmentClockDuration("09:15", "17:21")).toBe(8.1);
    expect(formatEquipmentDuration(8.1)).toBe("8 h 06 min");
    expect(formatEquipmentDuration(3.25)).toBe("3 h 15 min");
    expect(formatEquipmentTime("17:21")).toBe("5:21 PM");
  });
});