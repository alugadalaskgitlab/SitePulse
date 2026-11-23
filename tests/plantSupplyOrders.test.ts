import { describe, expect, it } from "vitest";
import {
  dailyMixTonnes,
  daysOfStockLeft,
  isRunningLow,
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
});
