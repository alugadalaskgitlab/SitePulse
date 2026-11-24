import { describe, expect, it } from "vitest";
import {
  allocateSupplyOrderLdo,
  dailyMixTonnes,
  dispatchCrossesStockZero,
  daysOfStockLeft,
  dispatchedByMix,
  formatPlantSupplyMorningSummary,
  formatPlantSupplyOrderNotification,
  isRunningLow,
  includeSupplyAlertOwners,
  materialAvailabilityForScope,
  materialNeedForOrderMix,
  materialNeedForMix,
  orderMixAggregateQuantities,
  orderQuantityToMt,
  orderMaterialNeeds,
  resolveSupplyAlertSettings,
} from "../shared/plantSupplyOrders";
import {
  formatSupplyOrderVersionTime,
  mixVersionAt,
  mixVersionForDispatch,
  supplyDispatchInstant,
  supplyDispatchOutsideOrderPeriod,
  supplyMixVersionTimeError,
  supplyOrderBitumenQuantity,
  supplyOrderLineCanBeRemoved,
  supplyOrderLineQuantityError,
  withoutBlankSupplyOrderLines,
} from "../shared/plantSupplyOrderVersions";

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
  it("includes Owners by default, lets saved Running low and Exhausted choices opt out, and always includes them for Borrowed", () => {
    const defaults = {
      running_low: { roles: ["P&M In-charge"], userIds: [] },
      exhausted: { roles: ["P&M In-charge"], userIds: [] },
      borrowed: { roles: ["P&M In-charge"], userIds: [] },
    };
    const defaulted = resolveSupplyAlertSettings({}, defaults, [8]);
    expect(defaulted.running_low.userIds).toContain(8);
    expect(defaulted.exhausted.userIds).toContain(8);
    expect(defaulted.borrowed.userIds).toContain(8);

    const savedOptOut = resolveSupplyAlertSettings({
      ownerDefaultsApplied: true,
      running_low: { roles: [], userIds: [] },
      exhausted: { roles: [], userIds: [] },
      borrowed: { roles: [], userIds: [] },
    }, defaults, [8]);
    expect(savedOptOut.running_low.userIds).not.toContain(8);
    expect(savedOptOut.exhausted.userIds).not.toContain(8);
    expect(includeSupplyAlertOwners("borrowed", savedOptOut.borrowed.userIds, [8])).toContain(8);
    expect(includeSupplyAlertOwners("morning_summary", savedOptOut.running_low.userIds, [8])).not.toContain(8);
  });

  it("selects the mix version using dispatch date and time in IST", () => {
    const versions = [
      { id: 1, effectiveAt: "2026-11-23T10:00:00+05:30" },
      { id: 2, effectiveAt: "2026-11-23T13:00:00+05:30" },
    ];
    expect(supplyDispatchInstant("2026-11-23", "09:59").toISOString()).toBe("2026-11-23T04:29:00.000Z");
    expect(mixVersionAt(versions, "2026-11-23", "09:59")).toBeNull();
    expect(mixVersionAt(versions, "2026-11-23", "10:00")).toBeNull();
    expect(mixVersionAt(versions, "2026-11-23", "10:01")?.id).toBe(1);
    expect(mixVersionAt(versions, "2026-11-23", "12:59")?.id).toBe(1);
    expect(mixVersionAt(versions, "2026-11-23", "13:00")?.id).toBe(1);
    expect(mixVersionAt(versions, "2026-11-23", "13:01")?.id).toBe(2);
    expect(mixVersionForDispatch(versions, "2026-11-23", "14:00", 1)?.id).toBe(1);
    expect(mixVersionForDispatch(versions, "2026-11-23", "14:00")?.id).toBe(2);
    expect(formatSupplyOrderVersionTime(versions[0].effectiveAt)).toContain("IST");
    const firstDispatchBitumen = supplyOrderBitumenQuantity(300, 5.0);
    const secondDispatchBitumen = supplyOrderBitumenQuantity(120, 5.25);
    expect(firstDispatchBitumen).toBe(15);
    expect(secondDispatchBitumen).toBeCloseTo(6.3);
    expect(firstDispatchBitumen + secondDispatchBitumen).toBeCloseTo(21.3);
  });

  it("blocks backdated or out-of-order mix versions and preserves dispatched order quantities", () => {
    const latestDispatch = new Date("2026-11-23T08:30:00.000Z");
    const priorVersion = new Date("2026-11-23T07:00:00.000Z");
    expect(supplyMixVersionTimeError(new Date("2026-11-23T08:29:00.000Z"), latestDispatch, priorVersion))
      .toMatch(/cannot be earlier than the latest truck/);
    expect(supplyMixVersionTimeError(latestDispatch, latestDispatch, priorVersion))
      .toBeNull();
    expect(supplyMixVersionTimeError(new Date("2026-11-23T07:00:00.000Z"), null, priorVersion))
      .toMatch(/after the previous mix version/);
    expect(supplyMixVersionTimeError(new Date("2026-11-23T09:00:00.000Z"), latestDispatch, priorVersion)).toBeNull();
    expect(supplyOrderLineQuantityError(99.99, 100)).toMatch(/cannot be below/);
    expect(supplyOrderLineQuantityError(100, 100)).toBeNull();
    expect(supplyOrderLineCanBeRemoved(0)).toBe(true);
    expect(supplyOrderLineCanBeRemoved(0.01)).toBe(false);
    expect(supplyDispatchOutsideOrderPeriod("2026-11-22", "2026-11-23", "2026-11-30")).toBe(true);
    expect(supplyDispatchOutsideOrderPeriod("2026-11-25", "2026-11-23", "2026-11-30")).toBe(false);
  });

  it("ignores blank order mix rows but keeps any partially filled row for validation", () => {
    const lines = [
      { mixTemplateId: "", enteredQuantity: "", plannedMtPerDay: "" },
      { mixTemplateId: 2, enteredQuantity: 90, plannedMtPerDay: "" },
      { mixTemplateId: "", enteredQuantity: "", plannedMtPerDay: 15 },
      { mixTemplateId: "", enteredQuantity: 0, plannedMtPerDay: "" },
    ];
    expect(withoutBlankSupplyOrderLines(lines)).toEqual([lines[1], lines[2], lines[3]]);
  });

  it("converts order quantities and calculates isolated order-mix allowances", () => {
    expect(orderQuantityToMt(297.1, "cum", 2.356)).toBeCloseTo(700, 1);
    const orderMix = {
      mixTemplateId: 1,
      mixName: "BC — party order mix",
      sourceBitumenPercent: 5.4,
      bitumenPercent: 5,
      ldoNorm: 6,
      components: [
        { materialId: 13, aggregateSharePercent: 30 },
        { materialId: 14, aggregateSharePercent: 25 },
        { materialId: 15, aggregateSharePercent: 43 },
        { materialId: 15, aggregateSharePercent: 2 },
      ],
    };
    const orderMaterials = [
      ...materials,
      { id: 13, name: "10/12MM" },
      { id: 14, name: "6MM DOWN" },
      { id: 15, name: "DUST" },
    ];
    const need = materialNeedForOrderMix(template, orderMix, 700, orderMaterials);
    expect(need.find(row => row.materialId === 11)?.quantity).toBe(35);
    expect(need.find(row => row.materialId === 13)?.quantity).toBe(199.5);
    expect(need.find(row => row.materialId === 14)?.quantity).toBe(166.25);
    expect(need.find(row => row.materialId === 15)?.quantity).toBe(299.25);
    expect(template.bitumenPercent).toBe(5);
    expect(materialNeedForOrderMix(template, orderMix, 305, orderMaterials).find(row => row.materialId === 11)?.quantity).toBe(15.25);
    expect(orderMixAggregateQuantities(305, 5, orderMix.components)).toEqual({
      13: 86.925,
      14: 72.4375,
      15: 130.3875,
    });
    expect(materialAvailabilityForScope(35, 0, "party", 26.8, 500).shortage).toBeCloseTo(8.2, 6);
    expect(materialAvailabilityForScope(299.25, 0, "party", 0, 500).shortage).toBe(299.25);
  });

  it("allocates plant pre-heat and boiler LDO once by order dispatch weight", () => {
    expect(allocateSupplyOrderLdo(125, [{ orderId: 1, dispatchMt: 500 }]))
      .toEqual([{ orderId: 1, sharePercent: 100, allocatedLitres: 125 }]);
    const shares = allocateSupplyOrderLdo(140, [
      { orderId: 1, dispatchMt: 305 },
      { orderId: 2, dispatchMt: 395 },
    ]);
    expect(shares[0].sharePercent).toBeCloseTo(305 / 700 * 100, 6);
    expect(shares[0].allocatedLitres).toBeCloseTo(61, 6);
    expect(shares[1].allocatedLitres).toBeCloseTo(79, 6);
    expect(shares.reduce((sum, row) => sum + row.allocatedLitres, 0)).toBeCloseTo(140, 6);
  });

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

  it("detects stock exhaustion and formats one morning summary with all orders and short materials", () => {
    expect(dispatchCrossesStockZero(4, 0)).toBe(true);
    expect(dispatchCrossesStockZero(4, -1)).toBe(true);
    expect(dispatchCrossesStockZero(0, -1)).toBe(false);
    const summary = formatPlantSupplyMorningSummary([
      {
        partyName: "G SANGANNA",
        orderNo: "HLC/PO-HMP/26-27/0001",
        periodFrom: "2026-11-01",
        periodTo: "2026-11-30",
        lines: [{ mixName: "BC", orderedMt: 900, dispatchedMt: 10, balanceMt: 890 }],
        problems: [{ label: "Dust", quantity: 299, uom: "MT" }],
      },
      {
        partyName: "MD FASIUDDIN",
        orderNo: "HLC/PO-HMP/26-27/0002",
        periodFrom: "2026-11-10",
        periodTo: "2026-11-30",
        lines: [{ mixName: "DBM", orderedMt: 800, dispatchedMt: 0, balanceMt: 800 }],
      },
    ]);
    expect(summary).toContain("G SANGANNA · HLC/PO-HMP/26-27/0001");
    expect(summary).toContain("BC 900 MT · 2026-11-01–2026-11-30 · dispatched 10 MT · balance 890 MT");
    expect(summary).toContain("Short: Dust 299 MT");
    expect(summary).toContain("MD FASIUDDIN · HLC/PO-HMP/26-27/0002");
    expect(summary).not.toContain("890.000");
    expect(summary.split("\n\n")).toHaveLength(2);
  });

  it("formats alert-specific intro and omits the problem line when no material is short", () => {
    expect(formatPlantSupplyOrderNotification({
      partyName: "G SANGANNA",
      orderNo: "HLC/PO-HMP/26-27/0001",
      periodFrom: "2026-11-01",
      periodTo: "2026-11-30",
      lines: [{ mixName: "BC", orderedMt: 900, dispatchedMt: 10, balanceMt: 890 }],
    }, "Bitumen running low")).toContain("G SANGANNA · HLC/PO-HMP/26-27/0001 · Bitumen running low");
  });
});
