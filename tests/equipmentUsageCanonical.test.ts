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
});