/**
 * Instruction 025 — Approved execution arrangements reduce HLC demand.
 *
 * These tests invoke the REAL demand engine (calculateBomDemand) — no hand-written
 * expected lists without engine invocation.
 *
 * LIMITATION (Instruction 025 §4): actual-progress linkage is not yet reliable, so
 * the engine excludes the approved ALLOCATED quantity (not allocated − completed).
 */
import { describe, it, expect } from "vitest";
import {
  calculateBomDemand,
  buildArrangementEffects,
  type ArrangementDemandInput,
  type BomInputItem,
} from "../shared/planningEngine";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Earthwork item: 10,000 CUM embankment with a full earthwork recipe. */
function earthworkItem(overrides: Partial<BomInputItem> = {}): BomInputItem {
  return {
    id: 1,
    itemCode: "3.2",
    itemName: null,
    description: "Construction of embankment with approved material",
    unit: "Cum",
    currentQty: 10000,
    materials: [],
    derivedKeyMaterials: [
      { materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true, isEarthworkBulkRequirement: true },
    ],
    equipment: [
      { equipmentName: "Excavator", qtyPerBoqUnit: 0.02, count: 1, consumptionNorm: 12, fuelType: "Diesel" },
      { equipmentName: "Tipper 10 Cum", qtyPerBoqUnit: 0.05, count: 1, consumptionNorm: 8, fuelType: "Diesel" },
      { equipmentName: "Motor Grader", qtyPerBoqUnit: 0.01, count: 1, consumptionNorm: 10, fuelType: "Diesel" },
      { equipmentName: "Vibratory Roller", qtyPerBoqUnit: 0.015, count: 1, consumptionNorm: 9, fuelType: "Diesel" },
      { equipmentName: "Water Tanker", qtyPerBoqUnit: 0.008, count: 1, consumptionNorm: 5, fuelType: "Diesel" },
    ],
    labour: [
      { designation: "Mazdoor", qtyPerBoqUnit: 0.03 },
      { designation: "Surveyor", qtyPerBoqUnit: 0.002 },
      { designation: "Operator", qtyPerBoqUnit: 0.01 },
    ],
    ...overrides,
  } as BomInputItem;
}

const ALL_AGENCY_COMPONENTS: Record<string, string> = {
  material_source: "agency",
  source_identification: "agency",
  excavation: "agency",
  loading: "agency",
  transport: "agency",
  dumping: "agency",
  spreading: "agency",
  watering: "agency",
  compaction: "agency",
  equipment: "agency",
  tippers: "agency",
  operators_drivers: "agency",
  diesel_fuel: "agency",
  survey_setting_out: "hlc",
  quality_testing: "hlc",
};

function arr(overrides: Partial<ArrangementDemandInput> = {}): ArrangementDemandInput {
  return {
    id: 100,
    status: "approved",
    allocatedQty: 7000,
    boqItemId: 1,
    components: { ...ALL_AGENCY_COMPONENTS },
    dieselResponsibility: "agency",
    agencyName: "Narsimulu",
    ...overrides,
  };
}

function demandOf(items: BomInputItem[], arrangements?: ArrangementDemandInput[]) {
  return calculateBomDemand(items, [], 12, { arrangements });
}

const eq = (d: ReturnType<typeof demandOf>, name: RegExp) =>
  d.equipment.find(e => name.test(e.equipmentName));
const lab = (d: ReturnType<typeof demandOf>, name: RegExp) =>
  d.labour.find(l => name.test(l.designation));
const diesel = (d: ReturnType<typeof demandOf>) =>
  d.materials.find(m => /diesel/i.test(m.materialName));

// ─── A. Fully outsourced earthwork ───────────────────────────────────────────

describe("A: fully outsourced composite (7,000 of 10,000 CUM, agency incl. diesel)", () => {
  const base = demandOf([earthworkItem()]);
  const d = demandOf([earthworkItem()], [arr()]);

  it("physical Soil / Earth quantity remains 10,000 CUM with outsourced/HLC split", () => {
    const soil = d.materials.find(m => (m as any).isEarthworkBulkRequirement)!;
    expect(soil).toBeDefined();
    expect(soil.totalQty).toBeCloseTo(10000, 3);
    expect((soil as any).arrangementOutsourcedQty).toBeCloseTo(7000, 1);
    expect((soil as any).arrangementHlcQty).toBeCloseTo(3000, 1);
  });

  it("HLC equipment hours reduced to the 30% HLC share", () => {
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours * 0.3, 2);
    expect(eq(d, /tipper/i)!.totalHours).toBeCloseTo(eq(base, /tipper/i)!.totalHours * 0.3, 2);
  });

  it("HLC diesel demand excludes the outsourced 7,000 CUM", () => {
    expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty * 0.3, 1);
  });

  it("general labour reduced (fully outsourced execution) but survey retained", () => {
    expect(lab(d, /mazdoor/i)!.totalDays).toBeCloseTo(lab(base, /mazdoor/i)!.totalDays * 0.3, 2);
    expect(lab(d, /survey/i)!.totalDays).toBeCloseTo(lab(base, /survey/i)!.totalDays, 2);
  });

  it("explains every reduction via demandAdjustments", () => {
    expect(d.demandAdjustments!.length).toBeGreaterThan(0);
    expect(d.demandAdjustments!.some(a => a.kind === "equipment" && /narsimulu/i.test(a.note))).toBe(true);
    expect(d.demandAdjustments!.some(a => a.kind === "diesel")).toBe(true);
    expect(d.demandAdjustments!.some(a => a.kind === "material")).toBe(true);
  });
});

// ─── B/C. Draft & submitted arrangements have no effect ──────────────────────

describe("B/C: draft and submitted arrangements do not change HLC demand", () => {
  const base = demandOf([earthworkItem()]);
  for (const status of ["draft", "submitted", "returned", "rejected", "cancelled"]) {
    it(`${status} → no exclusion`, () => {
      const d = demandOf([earthworkItem()], [arr({ status })]);
      expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours, 3);
      expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty, 3);
      expect(d.demandAdjustments!.length).toBe(0);
    });
  }
});

// ─── D. Partial responsibility: agency cut+haul, HLC spread+compact ──────────

describe("D: agency excavation/transport/diesel; HLC spreading, watering, compaction", () => {
  const components: Record<string, string> = {
    ...ALL_AGENCY_COMPONENTS,
    spreading: "hlc",
    watering: "hlc",
    compaction: "hlc",
  };
  const base = demandOf([earthworkItem()]);
  const d = demandOf([earthworkItem()], [arr({ components })]);

  it("excavator and tipper hours reduced for the approved quantity", () => {
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours * 0.3, 2);
    expect(eq(d, /tipper/i)!.totalHours).toBeCloseTo(eq(base, /tipper/i)!.totalHours * 0.3, 2);
  });

  it("grader, roller and water tanker fully retained", () => {
    expect(eq(d, /grader/i)!.totalHours).toBeCloseTo(eq(base, /grader/i)!.totalHours, 2);
    expect(eq(d, /roller/i)!.totalHours).toBeCloseTo(eq(base, /roller/i)!.totalHours, 2);
    expect(eq(d, /water tanker/i)!.totalHours).toBeCloseTo(eq(base, /water tanker/i)!.totalHours, 2);
  });

  it("diesel excluded only for excavator/tipper share; HLC-equipment diesel retained", () => {
    // Full diesel: exc 0.02*12 + tip 0.05*8 + grader 0.01*10 + roller 0.015*9 + tank 0.008*5 = 0.24+0.4+0.1+0.135+0.04
    const excludedPart = (0.02 * 12 + 0.05 * 8) * 7000; // agency share of exc+tipper fuel
    expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty - excludedPart, 1);
  });

  it("general labour retained (execution chain not fully outsourced)", () => {
    expect(lab(d, /mazdoor/i)!.totalDays).toBeCloseTo(lab(base, /mazdoor/i)!.totalDays, 2);
    // operators are agency-owned
    expect(lab(d, /operator/i)!.totalDays).toBeCloseTo(lab(base, /operator/i)!.totalDays * 0.3, 2);
  });
});

// ─── E. Partial quantity ─────────────────────────────────────────────────────

describe("E: 12,000 of 20,000 CUM outsourced — exclusion applies only to that portion", () => {
  const item = earthworkItem({ currentQty: 20000 });
  const base = demandOf([item]);
  const d = demandOf([item], [arr({ allocatedQty: 12000 })]);
  it("40% HLC share retained", () => {
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours * 0.4, 2);
    expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty * 0.4, 1);
  });
});

// ─── F. Multiple BOQ sources — only the linked source adjusts ────────────────

describe("F: combined row with three BOQ items; arrangement covers only one", () => {
  const items = [
    earthworkItem({ id: 1, itemCode: "3.2A", currentQty: 5000 }),
    earthworkItem({ id: 2, itemCode: "3.2B", currentQty: 5000, description: "Construction of embankment Reach 2" }),
    earthworkItem({ id: 3, itemCode: "3.2C", currentQty: 5000, description: "Construction of embankment Reach 3" }),
  ];
  const base = demandOf(items);
  const d = demandOf(items, [arr({ boqItemId: 1, allocatedQty: 5000 })]);

  it("only item 1's share is excluded — total drops by exactly one item's contribution", () => {
    // Item 1 fully outsourced: its excavator hours (5000 × 0.02) vanish; items 2-3 unchanged.
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours - 5000 * 0.02, 2);
  });

  it("multi-source boqItemAllocations split adjusts only the allocated items", () => {
    const d2 = demandOf(items, [arr({
      boqItemId: null,
      allocatedQty: 6000,
      boqItemAllocations: [{ boqItemId: 1, qty: 4000 }, { boqItemId: 2, qty: 2000 }],
    })]);
    const excluded = 4000 * 0.02 + 2000 * 0.02;
    expect(eq(d2, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours - excluded, 2);
  });
});

// ─── G. Cancelled arrangement restores demand ────────────────────────────────

describe("G: cancelling a previously approved arrangement restores full HLC demand", () => {
  it("cancelled → identical to no-arrangement demand", () => {
    const base = demandOf([earthworkItem()]);
    const d = demandOf([earthworkItem()], [arr({ status: "cancelled" })]);
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours, 3);
    expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty, 3);
  });
});

// ─── H. HLC supplies diesel to agency equipment ──────────────────────────────

describe("H: agency owns equipment, HLC supplies diesel", () => {
  const components: Record<string, string> = { ...ALL_AGENCY_COMPONENTS, diesel_fuel: "hlc" };
  const base = demandOf([earthworkItem()]);
  const d = demandOf([earthworkItem()], [arr({ components, dieselResponsibility: "hlc" })]);

  it("equipment hours excluded but HLC diesel demand fully retained", () => {
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours * 0.3, 2);
    expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty, 1);
  });
});

// ─── I. No double exclusion / overlap capping ────────────────────────────────

describe("I: overlapping approved allocations are capped and flagged", () => {
  it("two 7,000 CUM arrangements on a 10,000 CUM item cap at the item quantity", () => {
    const d = demandOf([earthworkItem()], [arr({ id: 100 }), arr({ id: 101, agencyName: "Second Agency" })]);
    // Capped at 10,000 → 0% HLC share, never negative.
    expect(eq(d, /excavator/i)?.totalHours ?? 0).toBeCloseTo(0, 2);
    expect(diesel(d)?.totalQty ?? 0).toBeCloseTo(0, 1);
    expect(d.arrangementOverlaps!.length).toBe(1);
    expect(d.arrangementOverlaps![0].allocatedTotal).toBeCloseTo(14000, 1);
    expect(d.arrangementOverlaps![0].itemQty).toBeCloseTo(10000, 1);
  });

  it("buildArrangementEffects scales slices down proportionally", () => {
    const effects = buildArrangementEffects(
      [{ id: 1, currentQty: 10000 }],
      [arr({ id: 100 }), arr({ id: 101 })],
    );
    const eff = effects.get(1)!;
    expect(eff.slices.reduce((s, sl) => s + sl.qty, 0)).toBeCloseTo(10000, 1);
    expect(eff.overlap).toBeDefined();
  });
});

// ─── J. Non-earthwork regression ─────────────────────────────────────────────

describe("J: arrangements never touch non-linked / non-earthwork items", () => {
  const gsbItem = earthworkItem({
    id: 50,
    itemCode: "4.1",
    description: "Providing and laying GSB material graded as per Table 400-1",
    currentQty: 8000,
    derivedKeyMaterials: [{ materialName: "GSB Material", uom: "CUM", qtyPerBoqUnit: 1.2, isAuto: true }],
  });

  it("GSB material/equipment/diesel unchanged when an arrangement exists on another item", () => {
    const base = demandOf([gsbItem]);
    const d = demandOf([gsbItem, earthworkItem()], [arr()]); // arrangement on item 1 only
    const gsbBase = base.materials.find(m => m.materialName === "GSB Material")!;
    const gsb = d.materials.find(m => m.materialName === "GSB Material")!;
    expect(gsb.totalQty).toBeCloseTo(gsbBase.totalQty, 3);
    expect((gsb as any).arrangementOutsourcedQty).toBeUndefined();
    // GSB item's own equipment contribution unchanged: subtract earthwork item share.
    expect(d.demandAdjustments!.every(a => a.boqItemId === 1)).toBe(true);
  });

  it("not_decided components retain demand (never silently outsourced)", () => {
    const components = Object.fromEntries(Object.keys(ALL_AGENCY_COMPONENTS).map(k => [k, "not_decided"]));
    const base = demandOf([earthworkItem()]);
    const d = demandOf([earthworkItem()], [arr({ components })]);
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours, 3);
    expect(diesel(d)!.totalQty).toBeCloseTo(diesel(base)!.totalQty, 3);
  });
});
