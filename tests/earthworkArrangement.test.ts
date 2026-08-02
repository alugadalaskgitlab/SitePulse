/**
 * Instruction 023 — Earthwork Execution Arrangement: acceptance tests
 *
 * Tests A-J covering:
 *   A. isEarthworkBoqItem() correctly classifies BOQ descriptions
 *   B. earthworkMaterialName() produces canonical display names
 *   C. buildKeyMaterialRows() sets isEarthworkBulkRequirement = true for earthwork items
 *   D. computeShortageRow() returns "earthwork_arrangement_required" when isEarthworkBulkRequirement + unresolved
 *   E. computeShortageRow() returns "mapping_required" (not earthwork) when flag is absent
 *   F. GSB/WMM items are NOT classified as earthwork
 *   G. Foundation/trench excavation items are NOT classified as earthwork
 *   H. Fly ash item is NOT classified as earthwork
 *   I. Arrangement status overrides: when arranged, status is no longer "earthwork_arrangement_required"
 *   J. computeShortageRow() returns v1-compat status when opts is omitted
 */

import { describe, it, expect } from "vitest";
import {
  computeShortageRow,
  calculateBomDemand,
  type BomInputItem,
  type BomInputBar,
  type ShortageMaterialDemand,
} from "../shared/planningEngine";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeBoqItem(overrides: Partial<BomInputItem>): BomInputItem {
  return {
    id: 1,
    description: overrides.description ?? "Embankment with borrow soil",
    unit: overrides.unit ?? "CUM",
    currentQty: overrides.currentQty ?? 1000,
    materials: [],
    equipment: [],
    labour: [],
    ...overrides,
  } as unknown as BomInputItem;
}

function makeBar(boqItemId: number, monthlyQty: Record<number, number>): BomInputBar {
  return {
    boqItemId,
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    plannedQty: Object.values(monthlyQty).reduce((a, b) => a + b, 0),
    monthlyQty,
  } as BomInputBar;
}

function makeDemandRow(overrides: Partial<ShortageMaterialDemand>): ShortageMaterialDemand {
  return {
    materialName: overrides.materialName ?? "Earth / Borrow Soil",
    uom: overrides.uom ?? "CUM",
    totalQty: overrides.totalQty ?? 1000,
    monthlyQty: overrides.monthlyQty ?? { 1: 200, 2: 300, 3: 500 },
    materialId: overrides.materialId ?? null,
    sourceBoqItemId: overrides.sourceBoqItemId ?? null,
    ...overrides,
  } as ShortageMaterialDemand;
}

// ─── Test A: isEarthworkBoqItem classification ──────────────────────────────

describe("Test A — earthwork BOQ item classification", () => {
  const earthworkDescriptions = [
    "Embankment with borrow material",
    "Formation of subgrade with selected material",
    "Earthen shoulder construction",
    "Borrow soil filling for embankment",
    "Filling of median with selected soil",
  ];

  const nonEarthworkDescriptions = [
    "GSB (Granular Sub-Base) — Providing and laying",
    "WMM (Wet Mix Macadam) base course",
    "Backfilling behind abutment",
    "Foundation excavation in all types of soil",
    "PCC M15 for foundations",
    "Providing filter media for drain",
    "Stone pitching on slopes",
    "Pipe — RCC Hume Pipe NP3 900mm dia",
    "TMT reinforcement steel Fe-500",
  ];

  const runBom = (desc: string, unit = "CUM") => {
    const item = makeBoqItem({ description: desc, unit, id: 99 });
    const bar = makeBar(99, { 1: 500, 2: 500 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    return demand.materials;
  };

  for (const desc of earthworkDescriptions) {
    it(`should classify as earthwork: "${desc.substring(0, 60)}"`, () => {
      const mats = runBom(desc);
      // Earthwork items produce a BOM row with isEarthworkBulkRequirement = true
      expect(mats.length).toBeGreaterThan(0);
      expect((mats[0] as any).isEarthworkBulkRequirement).toBe(true);
    });
  }

  for (const desc of nonEarthworkDescriptions) {
    it(`should NOT classify as earthwork: "${desc.substring(0, 60)}"`, () => {
      const mats = runBom(desc);
      // Non-earthwork items should either produce no BOM rows or rows without the flag
      for (const row of mats) {
        expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
      }
    });
  }
});

// ─── Test B: earthworkMaterialName canonical names ──────────────────────────

describe("Test B — earthwork canonical display names", () => {
  const cases: [string, string][] = [
    ["Embankment with borrow soil", "Earth / Borrow Soil"],
    ["Formation of subgrade with selected material", "Selected Soil / Subgrade Material"],
    ["Earthen shoulder construction", "Shoulder Earth / Soil"],
    ["Median filling with selected material", "Median Fill Material"],
    ["Borrow soil filling", "Earth / Borrow Soil"],
  ];

  for (const [desc, expectedName] of cases) {
    it(`"${desc.substring(0, 50)}" → "${expectedName}"`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM", id: 100 });
      const bar = makeBar(100, { 1: 100 });
      const demand = calculateBomDemand([item as any], [bar as any], 12);
      expect(demand.materials.length).toBeGreaterThan(0);
      expect(demand.materials[0].materialName).toBe(expectedName);
    });
  }
});

// ─── Test C: isEarthworkBulkRequirement flag propagated ─────────────────────

describe("Test C — isEarthworkBulkRequirement flag propagated through calculateBomDemand", () => {
  it("earthwork item produces BOM row with isEarthworkBulkRequirement = true", () => {
    const item = makeBoqItem({ description: "Embankment with borrow material", unit: "CUM", id: 201 });
    const bar = makeBar(201, { 1: 300, 2: 300, 3: 400 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    expect(demand.materials).toHaveLength(1);
    expect((demand.materials[0] as any).isEarthworkBulkRequirement).toBe(true);
  });

  it("non-earthwork item does NOT set isEarthworkBulkRequirement", () => {
    const item = makeBoqItem({
      description: "Providing and laying GSB material",
      unit: "CUM", id: 202,
      materials: [{
        materialName: "GSB Material",
        uom: "CUM",
        qtyPerUnit: 1.0,
        wastagePct: 0,
        isClientSupplied: false,
        supplyType: "direct",
      }],
    });
    const bar = makeBar(202, { 1: 100 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    for (const row of demand.materials) {
      expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
    }
  });
});

// ─── Test D: computeShortageRow fires earthwork_arrangement_required ─────────

describe("Test D — procurementStatus = earthwork_arrangement_required", () => {
  it("fires when isEarthworkBulkRequirement=true AND materialMappingUnresolved=true", () => {
    const demand = makeDemandRow({ totalQty: 1000, monthlyQty: { 1: 500, 2: 500 }, materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 2,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: true,
    });
    expect(result.procurementStatus).toBe("earthwork_arrangement_required");
    expect(result.isEarthworkBulkRequirement).toBe(true);
  });

  it("fires when isEarthworkBulkRequirement=true AND resolutionReason=inactive_material", () => {
    const demand = makeDemandRow({ materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 2,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "inactive_material",
      isEarthworkBulkRequirement: true,
    });
    expect(result.procurementStatus).toBe("earthwork_arrangement_required");
  });
});

// ─── Test E: non-earthwork unresolved rows still get mapping_required ─────────

describe("Test E — non-earthwork unresolved row gets mapping_required (not earthwork status)", () => {
  it("returns mapping_required when isEarthworkBulkRequirement is absent", () => {
    const demand = makeDemandRow({ materialName: "Bitumen VG-30", uom: "MT", materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 2,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: false,
    });
    expect(result.procurementStatus).toBe("mapping_required");
  });
});

// ─── Test F: GSB / WMM are NOT earthwork ─────────────────────────────────────

describe("Test F — GSB and WMM items are not earthwork", () => {
  const gsbWmmDescs = [
    "Granular Sub-Base (GSB) as per MoRTH Clause 401",
    "Wet Mix Macadam (WMM) as per MoRTH Clause 406",
    "GSB material supply and spreading",
    "WMM base course",
  ];
  for (const desc of gsbWmmDescs) {
    it(`"${desc.substring(0, 60)}" is not earthwork`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM", id: 301 });
      const bar = makeBar(301, { 1: 100 });
      const demand = calculateBomDemand([item as any], [bar as any], 12);
      for (const row of demand.materials) {
        expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
      }
    });
  }
});

// ─── Test G: Foundation / trench excavation are NOT earthwork ─────────────────

describe("Test G — Foundation / trench items are not earthwork", () => {
  const nonDescs = [
    "Foundation excavation for abutment",
    "Backfilling behind abutment",
    "Excavation in hard rock for culvert",
    "Trench cutting for pipe laying",
    "Backfilling for wing wall",
    "Filter media behind abutment",
  ];
  for (const desc of nonDescs) {
    it(`"${desc.substring(0, 60)}" is not earthwork`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM", id: 401 });
      const bar = makeBar(401, { 1: 100 });
      const demand = calculateBomDemand([item as any], [bar as any], 12);
      for (const row of demand.materials) {
        expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
      }
    });
  }
});

// ─── Test H: Fly ash is not classified as main earthwork ──────────────────────

describe("Test H — Fly ash BOQ items are not earthwork", () => {
  it("fly ash CUM item does not produce isEarthworkBulkRequirement", () => {
    const item = makeBoqItem({
      description: "Filling with Fly Ash for embankment construction",
      unit: "CUM", id: 501,
    });
    const bar = makeBar(501, { 1: 200 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    // Fly ash goes to isFlyAshBoqItem branch — not earthwork
    expect(demand.materials.length).toBeGreaterThan(0);
    // The materialName should be "Fly Ash" and isEarthworkBulkRequirement should be false
    expect(demand.materials[0].materialName).toBe("Fly Ash");
    expect((demand.materials[0] as any).isEarthworkBulkRequirement).toBeFalsy();
  });
});

// ─── Test I: arrangement status interaction ───────────────────────────────────

describe("Test I — when earthwork row has a resolved materialId, normal status logic applies", () => {
  it("covered_by_stock fires when earthwork row has materialId and sufficient stock", () => {
    // If somehow an earthwork item is mapped to a canonical material, normal logic takes over.
    const demand = makeDemandRow({ materialId: 42, monthlyQty: { 1: 100 }, totalQty: 100 });
    const result = computeShortageRow(demand, 200, true, 0, 1, 0, {
      horizonMonthIndex: 1,
      hlcRecordedStock: 200,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: false,
      resolutionReason: "saved_mapping",
      isEarthworkBulkRequirement: true, // flag is present, but mapping is resolved
    });
    // Since materialMappingUnresolved is false, earthwork_arrangement_required does NOT fire
    expect(result.procurementStatus).toBe("covered_by_stock");
  });
});

// ─── Test J: v1 backward compatibility ───────────────────────────────────────

describe("Test J — v1 backward compat: omitting opts still works", () => {
  it("shortfall > 0 → action_required via v1 path (no opts)", () => {
    const demand = makeDemandRow({ totalQty: 1000, monthlyQty: { 1: 1000 }, materialId: 99 });
    const result = computeShortageRow(demand, 0, false, 0, 1);
    // v1 path: shortfall > 0 → "action_required"
    expect(result.procurementStatus).toBe("action_required");
    // isEarthworkBulkRequirement defaults to false
    expect(result.isEarthworkBulkRequirement).toBe(false);
  });

  it("no shortfall → covered_by_stock via v1 path (no opts)", () => {
    const demand = makeDemandRow({ totalQty: 100, monthlyQty: { 1: 100 }, materialId: 99 });
    const result = computeShortageRow(demand, 500, true, 0, 1);
    expect(result.procurementStatus).toBe("covered_by_stock");
  });
});
