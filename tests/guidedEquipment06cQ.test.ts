/**
 * Batch 06C-Q — Guided Equipment parity: entry/deployment type, diesel
 * fields, trip/water semantics, shared calculations, and the mandatory
 * Detailed ↔ Guided round-trip with zero field loss.
 */
import { describe, it, expect } from "vitest";
import {
  splitGuidedEquipmentRow,
  buildGuidedEquipmentPayload,
  newGuidedEquipmentRow,
  computeTotalDiesel,
  computeTripTotalKm,
  isWaterTankerName,
} from "../shared/guidedEquipment";
import { usageToGuidedRow } from "../shared/dprPlantLink";

/** A full Detailed-created equipment row — every field in scope for §12. */
const FULL_DETAILED_ROW = {
  id: 991,
  dprId: 55,
  machine: "TATA HYVA",
  vehicleNo: "KA-01-1234",
  operator: "RAMESH",
  task: "GSB HAULING",
  equipmentId: 12,
  entryType: "trip_based",
  startTime: "08:00",
  endTime: "17:30",
  openingReading: 45230,
  closingReading: 45310,
  diesel: 42.5,
  dieselSource: "direct_purchase",
  fuelStation: "HP",
  billNumber: "B-778",
  amountPaid: 3900,
  numberOfTrips: 6,
  tripDistance: 12,
  totalKm: 144,
  waterQuantity: null,
  boqItemId: 301,
  structureId: "CH-2+500",
  plantUsageId: 87,
};

describe("entry/deployment type values (§2)", () => {
  const VALID = ["time_meter", "hourly", "daily", "trip_based", "monthly"];
  it("every existing enum value survives the Guided round-trip unchanged", () => {
    for (const t of VALID) {
      const row = splitGuidedEquipmentRow({ ...FULL_DETAILED_ROW, entryType: t });
      expect(row.passthrough.entryType).toBe(t);
      expect(buildGuidedEquipmentPayload(row).entryType).toBe(t);
    }
  });
});

describe("Detailed → Guided → payload round-trip (§12 — release blocker)", () => {
  it("loses no equipment field", () => {
    const row = splitGuidedEquipmentRow(FULL_DETAILED_ROW);
    const payload = buildGuidedEquipmentPayload(row);
    for (const [k, v] of Object.entries(FULL_DETAILED_ROW)) {
      if (k === "id" || k === "dprId") continue; // identity is stripped by design
      expect(payload[k], k).toEqual(v);
    }
  });

  it("diesel + source + purchase details persist (§5–7)", () => {
    const row = splitGuidedEquipmentRow(FULL_DETAILED_ROW);
    const p = buildGuidedEquipmentPayload(row);
    expect(p.diesel).toBe(42.5);
    expect(p.dieselSource).toBe("direct_purchase");
    expect(p.fuelStation).toBe("HP");
    expect(p.billNumber).toBe("B-778");
    expect(p.amountPaid).toBe(3900);
  });

  it("a new Guided row fabricates nothing", () => {
    const p = buildGuidedEquipmentPayload(newGuidedEquipmentRow());
    expect(Object.keys(p).sort()).toEqual(["machine", "operator", "task", "vehicleNo"]);
  });
});

describe("shared calculations (§9, §13 — one formula, two screens)", () => {
  it("Total Diesel sums rows like Detailed", () => {
    expect(computeTotalDiesel([{ diesel: 42.5 }, { diesel: 10 }, { diesel: null }, {}])).toBeCloseTo(52.5);
    expect(computeTotalDiesel([])).toBe(0);
  });
  it("Total Diesel tolerates DB-string numerics", () => {
    expect(computeTotalDiesel([{ diesel: "12.250" }, { diesel: 1 }])).toBeCloseTo(13.25);
  });
  it("trip round-trip km = trips × distance × 2", () => {
    expect(computeTripTotalKm(6, 12)).toBe(144);
    expect(computeTripTotalKm(0, 12)).toBe(0);
    expect(computeTripTotalKm(6, null)).toBe(0);
  });
  it("water tanker detection matches the Detailed name rule", () => {
    expect(isWaterTankerName("WATER TANKER 10KL")).toBe(true);
    expect(isWaterTankerName("water browser")).toBe(true);
    expect(isWaterTankerName("TATA HYVA")).toBe(false);
    expect(isWaterTankerName(null)).toBe(false);
  });
});

describe("linked Equipment Usage hydration (§11)", () => {
  it("copies diesel/source alongside readings, times and trips", () => {
    const row = usageToGuidedRow(
      {
        id: 87, equipmentId: 12, entryType: "hourly", openingReading: 1200.5,
        startTime: "07:45", diesel: 30, dieselSource: "plant_stock",
        operator: "SURESH", task: "COMPACTION",
      },
      "ROLLER",
    );
    expect(row.machine).toBe("ROLLER");
    expect(row.operator).toBe("SURESH");
    expect(row.passthrough.plantUsageId).toBe(87);
    expect(row.passthrough.entryType).toBe("hourly");
    expect(row.passthrough.openingReading).toBe(1200.5);
    expect(row.passthrough.diesel).toBe(30);
    expect(row.passthrough.dieselSource).toBe("plant_stock");
    // nothing fabricated for fields the usage doesn't carry
    expect("closingReading" in row.passthrough).toBe(false);
    expect("numberOfTrips" in row.passthrough).toBe(false);
  });
});
