import { describe, expect, it } from "vitest";
import {
  dailyMixTonnes,
  dispatchCrossesStockZero,
  daysOfStockLeft,
  dispatchedByMix,
  formatPlantSupplyMorningSummary,
  isRunningLow,
  materialAvailabilityForScope,
  materialNeedForMix,
  orderMaterialNeeds,
} from "../shared/plantSupplyOrders";

const template = {
  id: 1,
  name: "BC",
  mixType: "BC",
  bitumenPercent: 5,
  ldoNorm: 6,
};
const components = [
  { templateId: 1, materialId: 10, percent: 90, moistureContent: 4, wastageFactor: 2 },
];
const materials = [
  { id: 10, name: "20MM" },
  { id: 11, name: "Bitumen VG-30" },
  { id: 12, name: "LDO" },
];

describe("HMP plant supply order calculations", () => {
  it("calculates components, bitumen and LDO from the mix template without changing dispatch calculations", () => {
    expect(materialNeedForMix(template, components, 10, materials)).toEqual([
      { materialId: 11, quantity: 0.5, uom: "MT" },
      { materialId: 12, quantity: 60, uom: "Liters" },
      { materialId: 10, quantity: 9.5625, uom: "MT" },
    ]);
  });

  it("plans material only for ordered mix remaining after linked dispatches", () => {
    const lines = [{ mixTemplateId: 1, orderedMt: 100, plannedMtPerDay: 20 }];
    const needs = orderMaterialNeeds(lines, [template], components, materials, new Map([[1, 40]]));
    expect(needs.find(row => row.materialId === 11)?.quantity).toBe(3);
    expect(needs.find(row => row.materialId === 10)?.quantity).toBeCloseTo(57.375, 6);
    expect(needs.find(row => row.materialId === 12)?.quantity).toBe(360);
    expect(orderMaterialNeeds(lines, [template], components, materials, new Map([[1, 100]])).length).toBe(0);
  });

  it("keeps BC and DBM balances separate after a partial BC dispatch", () => {
    const templates = [
      { ...template, id: 1, name: "BC" },
      { ...template, id: 2, name: "DBM", mixType: "DBM", bitumenPercent: 4 },
    ];
    const lines = [
      { mixTemplateId: 1, orderedMt: 1200, plannedMtPerDay: 40 },
      { mixTemplateId: 2, orderedMt: 800, plannedMtPerDay: 30 },
    ];
    const bothComponents = [
      ...components,
      { templateId: 2, materialId: 13, percent: 92, moistureContent: 2, wastageFactor: 1 },
    ];
    const bothMaterials = [...materials, { id: 13, name: "10MM" }];
    const dispatches = [{ date: "2026-11-23", mixTemplateId: 1, loadWeight: 310 }];
    const dispatched = dispatchedByMix(lines, dispatches);
    expect(lines.map(line => Math.max(0, line.orderedMt - (dispatched.get(line.mixTemplateId) ?? 0))))
      .toEqual([890, 800]);
    const need = orderMaterialNeeds(lines, templates, bothComponents, bothMaterials, dispatched);
    expect(need.find(row => row.materialId === 11)?.quantity).toBe(76.5);
    expect(need.find(row => row.materialId === 12)?.quantity).toBe(10140);
    expect(need.find(row => row.materialId === 10)?.quantity).toBe(851.0625);
    expect(need.find(row => row.materialId === 13)?.quantity).toBeCloseTo(758.530612, 6);
    expect(materialAvailabilityForScope(need.find(row => row.materialId === 10)!.quantity, 40, "party", 500, 1000))
      .toMatchObject({ stockAvailable: 500, shortage: 351.0625, runningLow: false });
    expect(materialAvailabilityForScope(need.find(row => row.materialId === 13)!.quantity, 30, "hlc", 900, 20))
      .toMatchObject({ stockAvailable: 20, shortage: 738.530612, runningLow: true });
  });

  it("uses an explicit planned daily rate and averages the latest three production days only when absent", () => {
    const lines = [
      { mixTemplateId: 1, orderedMt: 100, plannedMtPerDay: 25 },
      { mixTemplateId: 2, orderedMt: 100, plannedMtPerDay: null },
    ];
    const dispatches = [
      { date: "2026-11-20", mixTemplateId: 2, loadWeight: 6 },
      { date: "2026-11-21", mixTemplateId: 2, loadWeight: 9 },
      { date: "2026-11-22", mixTemplateId: 2, loadWeight: 15 },
      { date: "2026-11-19", mixTemplateId: 2, loadWeight: 900 },
    ];
    const result = dailyMixTonnes(lines, dispatches);
    expect(result.get(1)).toBe(25);
    expect(result.get(2)).toBe(10);
  });

  it("flags only less than one full production day and clamps negative stock to zero days", () => {
    expect(isRunningLow(9.99, 10)).toBe(true);
    expect(isRunningLow(10, 10)).toBe(false);
    expect(isRunningLow(-2, 10)).toBe(true);
    expect(daysOfStockLeft(-2, 10)).toBe(0);
    expect(daysOfStockLeft(10, 0)).toBeNull();
  });

  it("detects a dispatch that takes party stock to zero and formats every open order in the morning summary", () => {
    expect(dispatchCrossesStockZero(4, 0)).toBe(true);
    expect(dispatchCrossesStockZero(4, -1)).toBe(true);
    expect(dispatchCrossesStockZero(0, -1)).toBe(false);
    expect(formatPlantSupplyMorningSummary({
      orderNo: "HLC/PO-HMP/26-27/0001",
      lines: [
        { mixName: "BC", balanceMt: 890 },
        { mixName: "DBM", balanceMt: 800 },
      ],
      materials: [{ materialName: "Bitumen VG-30", daysLeft: 0.8 }],
    })).toBe("HLC/PO-HMP/26-27/0001 · BC: 890.000 MT to go · DBM: 800.000 MT to go · Bitumen VG-30: 0.8 days left");
  });
});
