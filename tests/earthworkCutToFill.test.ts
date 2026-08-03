/**
 * Cut-to-fill earthwork sourcing tests (Task: internally sourced earthwork).
 *
 * Covers:
 *  - deriveEarthworkSourcingBadge: full reused coverage → internally_sourced;
 *    mixed types → fully_arranged; partial coverage → partially_arranged;
 *    cancelled/rejected ignored; borrow-earth arrangements never internally sourced.
 *  - checkCutFillBalance: sufficient / short / no linkage.
 */
import { describe, it, expect } from "vitest";
import {
  deriveEarthworkSourcingBadge,
  checkCutFillBalance,
  deriveMaterialsFromLayerConfig,
  isContractCutToFillDescription,
  suggestCutToFillSourceItem,
  calculateBomDemand,
} from "../shared/planningEngine";

type Arr = { arrangementType: string; status: string; allocatedQty: number };
const arr = (arrangementType: string, allocatedQty: number, status = "submitted"): Arr =>
  ({ arrangementType, status, allocatedQty });

describe("deriveEarthworkSourcingBadge", () => {
  it("returns none when there are no arrangements", () => {
    expect(deriveEarthworkSourcingBadge([], 1000)).toBe("none");
    expect(deriveEarthworkSourcingBadge(undefined, 1000)).toBe("none");
  });

  it("full coverage by reused_excavated → internally_sourced", () => {
    expect(deriveEarthworkSourcingBadge([arr("reused_excavated", 1000)], 1000)).toBe("internally_sourced");
  });

  it("multiple reused_excavated arrangements summing to full demand → internally_sourced", () => {
    expect(deriveEarthworkSourcingBadge(
      [arr("reused_excavated", 600), arr("reused_excavated", 400)], 1000,
    )).toBe("internally_sourced");
  });

  it("tolerates tiny float shortfall (within 0.001)", () => {
    expect(deriveEarthworkSourcingBadge([arr("reused_excavated", 999.9995)], 1000)).toBe("internally_sourced");
  });

  it("mixed reused + outsourced full coverage → fully_arranged (not internally sourced)", () => {
    expect(deriveEarthworkSourcingBadge(
      [arr("reused_excavated", 600), arr("fully_outsourced_composite", 400)], 1000,
    )).toBe("fully_arranged");
  });

  it("borrow-earth style arrangement full coverage → fully_arranged", () => {
    expect(deriveEarthworkSourcingBadge([arr("hlc_in_house", 1000)], 1000)).toBe("fully_arranged");
  });

  it("partial reused coverage → partially_arranged", () => {
    expect(deriveEarthworkSourcingBadge([arr("reused_excavated", 400)], 1000)).toBe("partially_arranged");
  });

  it("cancelled and rejected arrangements never count as coverage", () => {
    expect(deriveEarthworkSourcingBadge(
      [arr("reused_excavated", 1000, "cancelled")], 1000,
    )).toBe("none");
    expect(deriveEarthworkSourcingBadge(
      [arr("reused_excavated", 600), arr("reused_excavated", 400, "rejected")], 1000,
    )).toBe("partially_arranged");
  });

  it("cancelled outsourced arrangement does not spoil internally_sourced", () => {
    expect(deriveEarthworkSourcingBadge(
      [arr("reused_excavated", 1000), arr("fully_outsourced_composite", 500, "cancelled")], 1000,
    )).toBe("internally_sourced");
  });

  it("draft/approved/in_progress reused arrangements all count", () => {
    for (const status of ["draft", "submitted", "approved", "in_progress", "completed"]) {
      expect(deriveEarthworkSourcingBadge([arr("reused_excavated", 1000, status)], 1000))
        .toBe("internally_sourced");
    }
  });
});

describe("checkCutFillBalance", () => {
  it("returns null when no cut quantity is linked", () => {
    expect(checkCutFillBalance(null, 1000)).toBeNull();
    expect(checkCutFillBalance(undefined, 1000)).toBeNull();
    expect(checkCutFillBalance(NaN, 1000)).toBeNull();
  });

  it("sufficient when cut ≥ fill", () => {
    expect(checkCutFillBalance(1200, 1000)).toEqual({ sufficient: true, shortfall: 0 });
    expect(checkCutFillBalance(1000, 1000)).toEqual({ sufficient: true, shortfall: 0 });
  });

  it("short when cut < fill, with rounded shortfall", () => {
    const bal = checkCutFillBalance(800, 1000.4567);
    expect(bal).not.toBeNull();
    expect(bal!.sufficient).toBe(false);
    expect(bal!.shortfall).toBeCloseTo(200.457, 3);
  });
});

// ─── Layer-config "Soil / Earth" routing into the arrangement flow ────────────

const ROADWAY_EXCAVATION_DESC =
  "Earthwork excavation in road way soils upto SDR by mechanical means including trimming bottom and side slopes " +
  "complete including for finished item of work for trench cutting as per MoRT&H specification 301 (5th Revision)";
const EXCAVATED_EMBANKMENT_DESC =
  "Forming embankment with excavated earth obtained from roadway excavation for Embankment by mechanical means upto SDR";
const BORROW_EMBANKMENT_DESC =
  "Construction of Embankment with material obtained from borrowed useful earth from outside road boundary MDD of 18 KN/Cum";
const SHOULDER_DESC =
  "Construction of earthen shoulders with selective soils obtained from borrow pits with MDD of 18 KN/Cum from approved sources";

describe("deriveMaterialsFromLayerConfig — earthwork layer", () => {
  it("marks the derived Soil / Earth row as an earthwork bulk requirement", () => {
    const rows = deriveMaterialsFromLayerConfig({ layerType: "earthwork" } as any, "CUM");
    expect(rows).toHaveLength(1);
    expect(rows[0].materialName).toBe("Soil / Earth");
    expect(rows[0].isEarthworkBulkRequirement).toBe(true);
  });
});

describe("calculateBomDemand — derived earthwork rows keep the arrangement flag", () => {
  const baseItem = {
    id: 1148,
    itemCode: "3.1",
    itemName: null,
    description: ROADWAY_EXCAVATION_DESC,
    unit: "Cum",
    currentQty: 3403.698,
    materials: [] as any[],
    equipment: [] as any[],
    labour: [] as any[],
  };

  it("Soil / Earth from derivedKeyMaterials (excavation item vetoed by 'trench cutting') is flagged", () => {
    const item = {
      ...baseItem,
      derivedKeyMaterials: [
        { materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true, isEarthworkBulkRequirement: true },
      ],
    };
    const demand = calculateBomDemand([item as any], [], 12);
    const row = demand.materials.find(m => m.materialName === "Soil / Earth");
    expect(row).toBeDefined();
    expect((row as any).isEarthworkBulkRequirement).toBe(true);
    expect((row as any).requiresClassification).toBe(false);
  });

  it("derived rows without the flag stay in the normal mapping path", () => {
    const item = {
      ...baseItem,
      id: 99,
      description: "Providing and laying GSB material graded as per Table 400-1",
      derivedKeyMaterials: [
        { materialName: "GSB Material", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true },
      ],
    };
    const demand = calculateBomDemand([item as any], [], 12);
    const row = demand.materials.find(m => m.materialName === "GSB Material");
    expect(row).toBeDefined();
    expect((row as any).isEarthworkBulkRequirement).toBe(false);
  });

  it("OR-merges the flag when flagged and unflagged items feed the same material row", () => {
    const flagged = {
      ...baseItem,
      derivedKeyMaterials: [
        { materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true, isEarthworkBulkRequirement: true },
      ],
    };
    const unflagged = {
      ...baseItem,
      id: 1200,
      itemCode: "3.9",
      description: "Supplying soil for landscaping",
      currentQty: 100,
      derivedKeyMaterials: [
        { materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true },
      ],
    };
    // Unflagged first — flag must still end up true after the flagged item merges in.
    const demand = calculateBomDemand([unflagged as any, flagged as any], [], 12);
    const row = demand.materials.find(m => m.materialName === "Soil / Earth");
    expect((row as any).isEarthworkBulkRequirement).toBe(true);
  });
});

describe("isContractCutToFillDescription", () => {
  it("roadway excavation item (cut) → true", () => {
    expect(isContractCutToFillDescription(ROADWAY_EXCAVATION_DESC)).toBe(true);
  });

  it("embankment formed with excavated earth from roadway excavation (fill) → true", () => {
    expect(isContractCutToFillDescription(EXCAVATED_EMBANKMENT_DESC)).toBe(true);
  });

  it("borrow-earth embankment → false", () => {
    expect(isContractCutToFillDescription(BORROW_EMBANKMENT_DESC)).toBe(false);
  });

  it("shoulder from borrow pits → false", () => {
    expect(isContractCutToFillDescription(SHOULDER_DESC)).toBe(false);
  });

  it("reused excavated material phrasing → true", () => {
    expect(isContractCutToFillDescription("Filling with reused excavated material in embankment")).toBe(true);
  });

  it("null / empty → false", () => {
    expect(isContractCutToFillDescription(null)).toBe(false);
    expect(isContractCutToFillDescription("")).toBe(false);
  });
});

describe("suggestCutToFillSourceItem", () => {
  const candidates = [
    { id: 1148, description: ROADWAY_EXCAVATION_DESC, currentQty: 3403.698 },
    { id: 1149, description: EXCAVATED_EMBANKMENT_DESC, currentQty: 3403.698 },
    { id: 500, description: "Excavation for foundation of structures as per MoRT&H 304", currentQty: 900 },
  ];

  it("picks the roadway-excavation cut item, not the embankment fill item", () => {
    expect(suggestCutToFillSourceItem(candidates)?.id).toBe(1148);
  });

  it("never picks foundation/structure excavation", () => {
    expect(suggestCutToFillSourceItem([candidates[2]])).toBeNull();
  });

  it("prefers the largest available cut when several qualify", () => {
    const multi = [
      { id: 1, description: "Earthwork excavation in road way soils Reach 1", currentQty: 1000 },
      { id: 2, description: "Earthwork excavation in road way soils Reach 2", currentQty: 5000 },
    ];
    expect(suggestCutToFillSourceItem(multi)?.id).toBe(2);
  });

  it("returns null for empty / undefined input", () => {
    expect(suggestCutToFillSourceItem([])).toBeNull();
    expect(suggestCutToFillSourceItem(undefined)).toBeNull();
  });
});
