/**
 * Instruction 028 — Generalised Execution Arrangements + Bituminous Works.
 *
 * §37 category/state tests, §38 classifier tests, §39 demand tests — all demand
 * tests invoke the REAL engine (calculateBomDemand); no hand-written expected
 * lists without engine invocation.
 */
import { describe, it, expect } from "vitest";
import {
  calculateBomDemand,
  isBituminousBoqItem,
  isEarthworkBoqItem,
  bituminousItemTypeOf,
  executionArrangementCategoryForItem,
  type ArrangementDemandInput,
  type BomInputItem,
} from "../shared/planningEngine";
import {
  bituminousDefaultComponents,
  bituminousComponentsForItemType,
  bituminousFuelComponent,
  mapEquipmentToComponents,
  mapLabourToComponents,
  mapMaterialToComponents,
  significantComponentsFor,
  isArrangementTypeAllowed,
  invalidComponentKeys,
  isValidWorkCategory,
  isValidBituminousItemType,
  findMissingDemandMappings,
} from "../shared/executionArrangementCategories";
import { deriveExecutionState } from "../shared/executionState";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** DBM item: 20,000 SQM (engine works on currentQty units) with a realistic recipe. */
function dbmItem(overrides: Partial<BomInputItem> = {}): BomInputItem {
  return {
    id: 11,
    itemCode: "5.4",
    itemName: null,
    description: "Providing and laying Dense Bituminous Macadam with VG-40 bitumen as per MoRTH 505",
    unit: "MT",
    currentQty: 10000,
    materials: [],
    derivedKeyMaterials: [
      { materialName: "Bitumen VG-40", uom: "MT", qtyPerBoqUnit: 0.045, isAuto: true },
      { materialName: "Coarse Aggregates 20mm", uom: "MT", qtyPerBoqUnit: 0.6, isAuto: true },
      { materialName: "Stone Dust", uom: "MT", qtyPerBoqUnit: 0.3, isAuto: true },
    ],
    equipment: [
      { equipmentName: "Hot Mix Plant 120 TPH", qtyPerBoqUnit: 0.01, count: 1, consumptionNorm: 40, fuelType: "Diesel" },
      { equipmentName: "Sensor Paver", qtyPerBoqUnit: 0.008, count: 1, consumptionNorm: 15, fuelType: "Diesel" },
      { equipmentName: "Tandem Roller", qtyPerBoqUnit: 0.008, count: 1, consumptionNorm: 9, fuelType: "Diesel" },
      { equipmentName: "Tipper 10 Cum", qtyPerBoqUnit: 0.02, count: 1, consumptionNorm: 8, fuelType: "Diesel" },
    ],
    labour: [
      { designation: "Paving Crew", qtyPerBoqUnit: 0.02 },
      { designation: "Plant Operator", qtyPerBoqUnit: 0.005 },
      { designation: "Surveyor", qtyPerBoqUnit: 0.002 },
    ],
    ...overrides,
  } as BomInputItem;
}

function bitArr(overrides: Partial<ArrangementDemandInput> = {}): ArrangementDemandInput {
  return {
    id: 300,
    status: "approved",
    allocatedQty: 10000,
    boqItemId: 11,
    workCategory: "bituminous",
    bituminousItemType: "dbm",
    components: bituminousDefaultComponents("complete_supply_and_lay", "dbm") as Record<string, string>,
    agencyName: "M/s BlackTop",
    ...overrides,
  };
}

function demandOf(items: BomInputItem[], arrangements?: ArrangementDemandInput[]) {
  return calculateBomDemand(items, [], 12, { arrangements });
}
const eq = (d: ReturnType<typeof demandOf>, name: RegExp) => d.equipment.find(e => name.test(e.equipmentName));
const lab = (d: ReturnType<typeof demandOf>, name: RegExp) => d.labour.find(l => name.test(l.designation));
const mat = (d: ReturnType<typeof demandOf>, name: RegExp) => d.materials.find(m => name.test(m.materialName));

// ─── §38 Classifier tests ────────────────────────────────────────────────────

describe("§38 — bituminous BOQ item classification", () => {
  const item = (description: string, unit = "MT") => ({ description, unit } as BomInputItem);

  it("classifies complete descriptions", () => {
    expect(isBituminousBoqItem(item("Dense Bituminous Macadam Gr-II with VG-40"))).toBe(true);
    expect(isBituminousBoqItem(item("Bituminous Concrete Grade 2 as per MoRTH 507", "MT"))).toBe(true);
    expect(isBituminousBoqItem(item("Providing prime coat with SS-1 emulsion over WMM surface", "SQM"))).toBe(true);
    expect(isBituminousBoqItem(item("Tack coat with RS-1 bitumen emulsion", "SQM"))).toBe(true);
    expect(isBituminousBoqItem(item("Semi Dense Bituminous Concrete (SDBC)"))).toBe(true);
    expect(isBituminousBoqItem(item("Providing seal coat Type A over bituminous surface", "SQM"))).toBe(true);
    expect(isBituminousBoqItem(item("Premix carpet 20mm thick", "SQM"))).toBe(true);
  });

  it("PCC / RCC / cement concrete / GSB / WMM are hard-vetoed", () => {
    expect(isBituminousBoqItem(item("PCC M15 levelling course", "CUM"))).toBe(false);
    expect(isBituminousBoqItem(item("RCC M30 for box culvert", "CUM"))).toBe(false);
    expect(isBituminousBoqItem(item("Plain cement concrete BC grade something", "CUM"))).toBe(false);
    expect(isBituminousBoqItem(item("Granular Sub Base with well graded material", "CUM"))).toBe(false);
    expect(isBituminousBoqItem(item("Wet Mix Macadam laid and compacted", "CUM"))).toBe(false);
    expect(isBituminousBoqItem(item("Dismantling of bituminous pavement", "CUM"))).toBe(false);
  });

  it("bare 'BC' needs pavement context", () => {
    expect(isBituminousBoqItem(item("BC Grade 2 wearing course 30mm", "MT"))).toBe(true);
    expect(isBituminousBoqItem(item("Providing BC for building column", "CUM"))).toBe(false);
  });

  it("sub-type resolution", () => {
    expect(bituminousItemTypeOf(item("Dense Bituminous Macadam Gr-I"))).toBe("dbm");
    expect(bituminousItemTypeOf(item("Prime coat with SS-1 emulsion", "SQM"))).toBe("prime_coat");
    expect(bituminousItemTypeOf(item("Tack coat over DBM", "SQM"))).toBe("tack_coat");
    expect(bituminousItemTypeOf(item("PCC M15", "CUM"))).toBe(null);
  });

  it("category resolution keeps earthwork intact and respects manual overrides", () => {
    expect(executionArrangementCategoryForItem({ description: "Construction of embankment with approved material", unit: "CUM" } as any)).toBe("earthwork");
    expect(executionArrangementCategoryForItem(dbmItem())).toBe("bituminous");
    expect(executionArrangementCategoryForItem({ description: "Random item", unit: "NOS" } as any)).toBe(null);
    expect(executionArrangementCategoryForItem({ description: "PCC M15", unit: "CUM", bulkMaterialClassification: "bituminous" } as any)).toBe("bituminous");
    expect(executionArrangementCategoryForItem({ ...dbmItem(), bulkMaterialClassification: "not_bituminous" } as any)).toBe(null);
  });

  it("earthwork classifier unchanged for embankment items", () => {
    expect(isEarthworkBoqItem({ description: "Construction of embankment with approved material", unit: "CUM" } as any)).toBe(true);
    expect(isBituminousBoqItem({ description: "Construction of embankment with approved material", unit: "CUM" } as any)).toBe(false);
  });
});

// ─── Registry & validation ───────────────────────────────────────────────────

describe("028 registry — validation and vocabulary", () => {
  it("category/type/component validation", () => {
    expect(isValidWorkCategory("bituminous")).toBe(true);
    expect(isValidWorkCategory("concrete")).toBe(false);
    expect(isArrangementTypeAllowed("bituminous", "complete_supply_and_lay")).toBe(true);
    expect(isArrangementTypeAllowed("bituminous", "fully_outsourced_composite")).toBe(false);
    expect(isArrangementTypeAllowed("earthwork", "complete_supply_and_lay")).toBe(false);
    expect(isArrangementTypeAllowed("earthwork", "fully_outsourced_composite")).toBe(true);
    expect(invalidComponentKeys("bituminous", { paver: "agency", excavation: "agency" })).toEqual(["excavation"]);
    expect(invalidComponentKeys("earthwork", { excavation: "agency" })).toEqual([]);
    expect(isValidBituminousItemType("dbm")).toBe(true);
    expect(isValidBituminousItemType("gsb")).toBe(false);
  });

  it("spray items get spray component subset and spray significant components", () => {
    const sprayKeys = bituminousComponentsForItemType("prime_coat");
    expect(sprayKeys).toContain("mechanical_sprayer");
    expect(sprayKeys).not.toContain("paver");
    const mixKeys = bituminousComponentsForItemType("dbm");
    expect(mixKeys).toContain("paver");
    expect(mixKeys).not.toContain("mechanical_sprayer");
    expect(significantComponentsFor("bituminous", "prime_coat")).toContain("spraying_crew");
    expect(significantComponentsFor("bituminous", "dbm")).toContain("mix_production");
    expect(significantComponentsFor("earthwork", null)).toContain("excavation");
  });

  it("templates set sensible defaults", () => {
    const full = bituminousDefaultComponents("complete_supply_and_lay", "dbm");
    expect(full.mix_production).toBe("agency");
    expect(full.field_qc).toBe("hlc");
    const fin = bituminousDefaultComponents("finished_mix_supply_only", "dbm");
    expect(fin.mix_production).toBe("agency");
    expect(fin.binder_bitumen).toBe("agency");
    expect(fin.paver).toBe("hlc");
    expect(fin.mix_transport).toBe("hlc");
    const spray = bituminousDefaultComponents("spraying_only", "prime_coat");
    expect(spray.emulsion).toBe("hlc");
    expect(spray.spraying_crew).toBe("agency");
  });

  it("resource → component mappings", () => {
    expect(mapEquipmentToComponents("bituminous", "Hot Mix Plant 120 TPH").componentKeys).toContain("hot_mix_plant");
    expect(mapEquipmentToComponents("bituminous", "Sensor Paver").componentKeys).toEqual(["paver"]);
    expect(mapEquipmentToComponents("bituminous", "Mystery Machine").source).toBe("unmapped");
    expect(mapEquipmentToComponents("earthwork", "Excavator").source).toBe("unmapped"); // earthwork keeps legacy mapping
    expect(mapLabourToComponents("bituminous", "Roller Operator").componentKeys).toEqual(["roller_operators"]);
    expect(mapMaterialToComponents("bituminous", "Bitumen VG-40").componentKeys).toEqual(["binder_bitumen"]);
    expect(mapMaterialToComponents("bituminous", "SS-1 Emulsion").componentKeys).toContain("emulsion");
    expect(bituminousFuelComponent("Hot Mix Plant")).toBe("plant_fuel");
    expect(bituminousFuelComponent("Tipper 10 Cum")).toBe("transport_diesel");
    expect(bituminousFuelComponent("Emulsion Pressure Distributor")).toBe("sprayer_fuel");
    expect(bituminousFuelComponent("Tandem Roller")).toBe("paving_diesel");
  });
});

// ─── §37 Category-aware execution state ──────────────────────────────────────

describe("§37 — deriveExecutionState with bituminous category", () => {
  const mk = (type: string, components: Record<string, string>, qty = 10000) => [{
    id: 1, status: "approved", arrangementType: type, qtyForScope: qty,
    agencyName: "M/s BlackTop", components, pendingRevision: null,
  }];

  it("complete_supply_and_lay approved → outsourced state", () => {
    const r = deriveExecutionState(10000, mk("complete_supply_and_lay", bituminousDefaultComponents("complete_supply_and_lay", "dbm") as any),
      { uom: "MT", category: "bituminous", itemType: "dbm" });
    expect(["outsourcing_approved", "partly_outsourced"]).toContain(r.state);
  });

  it("company_inhouse → in-house state", () => {
    const r = deriveExecutionState(10000, mk("company_inhouse", bituminousDefaultComponents("company_inhouse", "dbm") as any),
      { uom: "MT", category: "bituminous", itemType: "dbm" });
    expect(r.state).toBe("hlc_inhouse");
  });

  it("earthwork default behaviour is unchanged when no category passed", () => {
    const r = deriveExecutionState(10000, [{
      id: 1, status: "approved", arrangementType: "fully_outsourced_composite", qtyForScope: 10000,
      agencyName: "Narsimulu", components: null, pendingRevision: null,
    }]);
    expect(["outsourcing_approved", "partly_outsourced"]).toContain(r.state);
  });
});

// ─── §39 Demand tests (real engine) ──────────────────────────────────────────

describe("§39A — complete supply and lay: company demand excluded, physical retained", () => {
  const base = demandOf([dbmItem()]);
  const d = demandOf([dbmItem()], [bitArr()]);

  it("material rows keep physical qty with outsourced/company split", () => {
    const binder = mat(d, /bitumen/i)!;
    expect(binder.totalQty).toBeCloseTo(mat(base, /bitumen/i)!.totalQty, 3);
    expect((binder as any).arrangementOutsourcedQty).toBeCloseTo(binder.totalQty, 1);
    expect(((binder as any).arrangementHlcQty ?? 0)).toBeCloseTo(0, 1);
  });

  it("company equipment hours drop to zero for allocated quantity", () => {
    expect(eq(d, /hot mix plant/i)?.totalHours ?? 0).toBeCloseTo(0, 2);
    expect(eq(d, /paver/i)?.totalHours ?? 0).toBeCloseTo(0, 2);
  });

  it("mapped labour excluded, survey retained (survey_levels = hlc)", () => {
    expect(lab(d, /paving crew/i)?.totalDays ?? 0).toBeCloseTo(0, 2);
    expect(lab(d, /survey/i)!.totalDays).toBeCloseTo(lab(base, /survey/i)!.totalDays, 2);
  });

  it("reductions disclosed via demandAdjustments", () => {
    expect(d.demandAdjustments!.some(a => a.kind === "equipment" && /blacktop/i.test(a.note))).toBe(true);
    expect(d.demandAdjustments!.some(a => a.kind === "material")).toBe(true);
  });
});

describe("§39B — finished mix supply only: production excluded, transport & paving retained", () => {
  const base = demandOf([dbmItem()]);
  const d = demandOf([dbmItem()], [bitArr({
    components: bituminousDefaultComponents("finished_mix_supply_only", "dbm") as Record<string, string>,
  })]);

  it("raw materials excluded (agency supplies delivered mix)", () => {
    expect(((mat(d, /bitumen/i) as any).arrangementHlcQty ?? 0)).toBeCloseTo(0, 1);
    expect(((mat(d, /aggregate/i) as any).arrangementHlcQty ?? 0)).toBeCloseTo(0, 1);
  });

  it("plant excluded but paver, roller and tippers retained", () => {
    expect(eq(d, /hot mix plant/i)?.totalHours ?? 0).toBeCloseTo(0, 2);
    expect(eq(d, /paver/i)!.totalHours).toBeCloseTo(eq(base, /paver/i)!.totalHours, 2);
    expect(eq(d, /tandem roller/i)!.totalHours).toBeCloseTo(eq(base, /tandem roller/i)!.totalHours, 2);
    expect(eq(d, /tipper/i)!.totalHours).toBeCloseTo(eq(base, /tipper/i)!.totalHours, 2);
  });

  it("paving crew retained, plant operator excluded", () => {
    expect(lab(d, /paving crew/i)!.totalDays).toBeCloseTo(lab(base, /paving crew/i)!.totalDays, 2);
    expect(lab(d, /plant operator/i)?.totalDays ?? 0).toBeCloseTo(0, 2);
  });
});

describe("§39C — partial allocation (60%) prorates exclusion", () => {
  const base = demandOf([dbmItem()]);
  const d = demandOf([dbmItem()], [bitArr({ allocatedQty: 6000 })]);

  it("company equipment retains the 40% share", () => {
    expect(eq(d, /paver/i)!.totalHours).toBeCloseTo(eq(base, /paver/i)!.totalHours * 0.4, 2);
  });
  it("material split reflects 60/40", () => {
    const binder = mat(d, /bitumen/i)! as any;
    expect(binder.arrangementOutsourcedQty).toBeCloseTo(binder.totalQty * 0.6, 1);
  });
});

describe("§39D — draft/submitted bituminous arrangements have no effect", () => {
  const base = demandOf([dbmItem()]);
  for (const status of ["draft", "submitted", "rejected", "cancelled"]) {
    it(`${status} → no exclusion`, () => {
      const d = demandOf([dbmItem()], [bitArr({ status })]);
      expect(eq(d, /paver/i)!.totalHours).toBeCloseTo(eq(base, /paver/i)!.totalHours, 3);
      expect(d.demandAdjustments!.length).toBe(0);
    });
  }
});

describe("§39E — fuel follows category-specific components", () => {
  it("company-retained plant fuel stays even when plant is agency-owned", () => {
    const comps = {
      ...bituminousDefaultComponents("complete_supply_and_lay", "dbm"),
      plant_fuel: "hlc", // company supplies fuel to agency plant
    } as Record<string, string>;
    const base = demandOf([dbmItem()]);
    const d = demandOf([dbmItem()], [bitArr({ components: comps })]);
    const dieselRow = d.materials.find(m => /diesel/i.test(m.materialName))!;
    const baseDiesel = base.materials.find(m => /diesel/i.test(m.materialName))!;
    // plant fuel share retained; transport/paving fuel excluded
    expect(dieselRow.totalQty).toBeGreaterThan(0);
    expect(dieselRow.totalQty).toBeLessThan(baseDiesel.totalQty);
  });
});

describe("§39F — unmapped resources are never excluded (no false certainty)", () => {
  it("an unmapped bituminous equipment row keeps full company demand", () => {
    const item = dbmItem({
      equipment: [{ equipmentName: "Mystery Machine X1", qtyPerBoqUnit: 0.01, count: 1, consumptionNorm: 0, fuelType: "" }] as any,
    });
    const base = demandOf([item]);
    const d = demandOf([item], [bitArr()]);
    expect(eq(d, /mystery/i)!.totalHours).toBeCloseTo(eq(base, /mystery/i)!.totalHours, 3);
  });
});

describe("§39G — missing demand-mapping warnings surfaced", () => {
  it("warns when a non-company component has no recipe resource", () => {
    // Item with no sprayer in the recipe but spraying assigned to agency
    const item = dbmItem({ equipment: [], labour: [], derivedKeyMaterials: [] });
    const d = demandOf([item], [bitArr()]);
    expect(d.mappingWarnings!.length).toBeGreaterThan(0);
    expect(d.mappingWarnings![0].code).toBe("DEMAND_COMPONENT_MAPPING_MISSING");
  });

  it("findMissingDemandMappings is silent when recipe covers all components", () => {
    const warnings = findMissingDemandMappings(11, { paver: "agency" }, {
      materials: [], equipment: ["Sensor Paver"], labour: [],
    });
    expect(warnings.length).toBe(0);
  });
});

describe("§39H — earthwork demand path unchanged when bituminous arrangement exists on another item", () => {
  it("earthwork item untouched by a bituminous arrangement on a different item", () => {
    const ew: BomInputItem = {
      id: 1, itemCode: "3.2", itemName: null,
      description: "Construction of embankment with approved material", unit: "Cum", currentQty: 10000,
      materials: [],
      derivedKeyMaterials: [{ materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true, isEarthworkBulkRequirement: true }],
      equipment: [{ equipmentName: "Excavator", qtyPerBoqUnit: 0.02, count: 1, consumptionNorm: 12, fuelType: "Diesel" }],
      labour: [{ designation: "Mazdoor", qtyPerBoqUnit: 0.03 }],
    } as any;
    const base = demandOf([ew]);
    const d = demandOf([ew, dbmItem()], [bitArr()]);
    expect(eq(d, /excavator/i)!.totalHours).toBeCloseTo(eq(base, /excavator/i)!.totalHours, 3);
    const soil = d.materials.find(m => (m as any).isEarthworkBulkRequirement)!;
    expect((soil as any).arrangementOutsourcedQty).toBeUndefined();
  });
});
