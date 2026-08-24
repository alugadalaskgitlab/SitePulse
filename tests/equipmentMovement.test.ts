import { describe, expect, it } from "vitest";
import {
  EquipmentMovementError,
  buildMovementSuccessor,
  materializedEquipmentLogChanged,
} from "../shared/equipmentMovement";

const source = { id: 41, equipmentId: 9, date: "2026-08-20", closingReading: 123.5, status: "closed" };

describe("equipment movement canonical successor", () => {
  it("creates a new open successor with exact meter continuity and no diesel issue", () => {
    const successor = buildMovementSuccessor(source, {
      date: "2026-08-21", destinationType: "hmp", destinationLabel: "HMP PLANT",
      shiftFrom: "Site A", openedByUserId: 7, openedByUserName: "Engineer",
    });
    expect(successor).toMatchObject({
      equipmentId: 9, openingReading: 123.5, closingReading: null,
      status: "open", sourceUsageId: 41, destinationType: "hmp",
      destinationSite: "HMP PLANT", siteName: "HMP PLANT", plantName: "HMP PLANT",
      entryType: "time_meter", dieselIssued: 0, expectedDiesel: 0,
    });
    expect(successor.endTime).toBeNull();
  });

  it("keeps four same-day physical legs distinct with exact closing-to-opening continuity", () => {
    const siteB = buildMovementSuccessor(source, {
      date: "2026-08-20", destinationType: "site", destinationLabel: "Site B",
    });
    const closedSiteB = {
      id: 42,
      equipmentId: siteB.equipmentId,
      date: siteB.date,
      closingReading: 130,
      status: "closed",
    };
    const hmp = buildMovementSuccessor(closedSiteB, {
      date: "2026-08-20", destinationType: "hmp", destinationLabel: "HMP PLANT",
    });

    expect(siteB.sourceUsageId).toBe(41);
    expect(siteB.openingReading).toBe(123.5);
    expect(hmp.sourceUsageId).toBe(42);
    expect(hmp.openingReading).toBe(130);
    expect(hmp.id).toBeUndefined();
  });

  it("rejects an open/unfinished source and backwards movement date", () => {
    expect(() => buildMovementSuccessor({ ...source, status: "open" }, {
      date: "2026-08-21", destinationType: "rmc", destinationLabel: "RMC",
    })).toThrow(EquipmentMovementError);
    expect(() => buildMovementSuccessor(source, {
      date: "2026-08-19", destinationType: "rmc", destinationLabel: "RMC",
    })).toThrow(/date/i);
  });

  it("distinguishes harmless normalization from a physical edit after movement", () => {
    const original = {
      equipmentId: 9,
      machine: "ROLLER",
      entryType: null,
      dieselSource: null,
      openingReading: 10,
      closingReading: 12,
      diesel: 4,
      operator: "RAMESH",
    };
    expect(materializedEquipmentLogChanged(original, {
      ...original,
      machine: " roller ",
      entryType: "time_meter",
      dieselSource: "plant_stock",
      operator: "ramesh",
    })).toBe(false);
    expect(materializedEquipmentLogChanged(original, { ...original, closingReading: 13 })).toBe(true);
    expect(materializedEquipmentLogChanged(original, undefined)).toBe(true);
  });

  it("treats display identity and diesel norm as immutable moved-source facts", () => {
    const original = {
      equipmentId: 9,
      machine: "ROLLER",
      vehicleNo: "TS08AB1234",
      dieselNorm: "4.000",
      openingReading: "10.000",
      closingReading: "12.000",
      diesel: "4.000",
    };
    const unchanged = {
      ...original,
      dieselNorm: 4,
      openingReading: 10,
      closingReading: 12,
      diesel: 4,
    };
    expect(materializedEquipmentLogChanged(original, unchanged)).toBe(false);
    expect(materializedEquipmentLogChanged(original, { ...unchanged, machine: "PAVER" })).toBe(true);
    expect(materializedEquipmentLogChanged(original, { ...unchanged, vehicleNo: "TS08ZZ9999" })).toBe(true);
    expect(materializedEquipmentLogChanged(original, { ...unchanged, dieselNorm: 5 })).toBe(true);
  });
});