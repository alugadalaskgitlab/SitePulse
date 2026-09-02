import { describe, it, expect } from "vitest";
import { generateSequencedProgramme } from "../shared/programmeSequencer";
import { classifyPlanningItem, classifyWorkType, normaliseBoqUnit } from "../shared/workTypeRecipes";

// ─── classifyWorkType: roadway_excavation vs earthwork ───────────────────────

describe("classifyWorkType — roadway_excavation", () => {
  const CUM = "CUM";

  it("classifies 'Roadway Excavation' as roadway_excavation", () => {
    expect(classifyWorkType("Roadway Excavation", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Excavation in Cutting' as roadway_excavation", () => {
    expect(classifyWorkType("Excavation in Cutting", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Excavation in Hard Rock' as roadway_excavation", () => {
    expect(classifyWorkType("Excavation in Hard Rock", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Excavation in Ordinary Soil' as roadway_excavation", () => {
    expect(classifyWorkType("Excavation in Ordinary Soil", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Excavation in Soft Rock' as roadway_excavation", () => {
    expect(classifyWorkType("Excavation in Soft Rock", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Hill Cutting' as roadway_excavation", () => {
    expect(classifyWorkType("Hill Cutting", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Rock Cutting' as roadway_excavation", () => {
    expect(classifyWorkType("Rock Cutting", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Formation Excavation' as roadway_excavation", () => {
    expect(classifyWorkType("Formation Excavation", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Cutting in Ordinary Soil' as roadway_excavation", () => {
    expect(classifyWorkType("Cutting in Ordinary Soil", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Cutting in Hard Rock' as roadway_excavation", () => {
    expect(classifyWorkType("Cutting in Hard Rock", CUM)).toBe("roadway_excavation");
  });

  it("classifies 'Ordinary Soil Excavation' as roadway_excavation", () => {
    expect(classifyWorkType("Ordinary Soil Excavation", CUM)).toBe("roadway_excavation");
  });

  it("classifies MoRTH Cl.301 long-form desc with 'removal of unsuitable soil' as roadway_excavation (regression: must not be trapped by removal-null guard)", () => {
    expect(
      classifyWorkType(
        "Roadway excavation including removal of unsuitable soil for construction of roadway including shoulders and median to designated widths and depths in existing roadway embankment for purpose of pavement construction including trimming of bottom and side slopes in accordance with requirements of lines, grades and cross sections, loading and disposal of surplus and unsuitable material",
        "Cum"
      )
    ).toBe("roadway_excavation");
  });
});

describe("classifyWorkType — earthwork (embankment/fill, not cutting)", () => {
  const CUM = "CUM";

  it("classifies the production-shaped embankment item as earthwork when roadway excavation is only its material source", () => {
    expect(classifyWorkType(
      "Forming embankment with excavated earth obtained from roadway excavation for Embankment by mechanical means upto SDR including pre-watering of soil, removal of top soil, excavation of soils, depositing the soils on the embankment, spreading soil, breaking clods, sectioning, grading and consolidation with 8 to 10 Tonnes Vibratory Road Roller @ OMC",
      CUM,
    )).toBe("earthwork");
  });

  it("classifies a short embankment source-reference description as earthwork", () => {
    expect(
      classifyWorkType("Embankment with excavated earth obtained from roadway excavation", CUM),
    ).toBe("earthwork");
  });

  it("preserves the real project's genuine roadway-excavation source classification", () => {
    expect(classifyWorkType(
      "Earthwork excavation  in road way  soils upto SDR  by mechanical means  including trimming bottom and side slopes in accordance with requirements of lines, grades and cross sections etc.,  complete  including  for finished item of work for trench cutting as per MoRT&H specification 301(5th Revision)  and as directed by the Engineer-in-Charge",
      "Cum",
    )).toBe("roadway_excavation");
  });

  it("classifies 'Embankment with Cut Material' as earthwork", () => {
    expect(classifyWorkType("Embankment with Cut Material", CUM)).toBe("earthwork");
  });

  it("classifies 'Embankment with Borrow Material' as earthwork", () => {
    expect(classifyWorkType("Embankment with Borrow Material", CUM)).toBe("earthwork");
  });

  it("classifies 'Formation Filling' as earthwork", () => {
    expect(classifyWorkType("Formation Filling", CUM)).toBe("earthwork");
  });

  it("classifies 'Earthwork in Embankment' as earthwork", () => {
    expect(classifyWorkType("Earthwork in Embankment", CUM)).toBe("earthwork");
  });

  it("classifies 'Subgrade Preparation' as earthwork", () => {
    expect(classifyWorkType("Subgrade Preparation", CUM)).toBe("earthwork");
  });

  it("classifies 'Cut and Fill' as earthwork", () => {
    expect(classifyWorkType("Cut and Fill", CUM)).toBe("earthwork");
  });

  it("classifies MoRTH Cl.305 embankment-from-structure-excavation as earthwork, not excavation_structure (regression: phrase 'structure excavation' is a material source, not the primary work)", () => {
    // Item 877 pattern: embankment whose material comes from structure excavation cuts
    expect(classifyWorkType(
      "Construction of embankment with approved materials obtained from roadway, drainage & structure excavation, including lead upto 5 Km and all lifts",
      CUM,
    )).toBe("earthwork");
  });

  it("still classifies genuine culvert foundation excavation as excavation_structure", () => {
    expect(classifyWorkType("Excavation for foundation of culvert box in ordinary soil", CUM)).toBe("excavation_structure");
  });
});

// ─── generateSequencedProgramme: excavation and embankment are concurrent ─────

describe("generateSequencedProgramme — roadway_excavation and earthwork start concurrently", () => {
  const BASE_OPTS = {
    fronts: 3,
    totalMonths: 18,
    roadLengthKm: 10,
    chainageStartKm: 0,
    staggerMonths: 1,
    lagMonths: 0.25,
  };

  function makeItem(id: number, description: string): Parameters<typeof generateSequencedProgramme>[0][number] {
    return {
      boqItemId: id,
      description,
      unit: "CUM",
      totalQty: 100_000,
      fullDurationMonths: 6,
    };
  }

  it("roadway excavation and embankment bars share the same startMonth on each reach", () => {
    const items = [
      makeItem(1, "Roadway Excavation in Ordinary Soil"),
      makeItem(2, "Embankment with Cut Material"),
    ];

    const { bars } = generateSequencedProgramme(items, BASE_OPTS);

    // Collect bars by reach label
    const reachLabels = [...new Set(bars.map(b => b.reachLabel))];
    expect(reachLabels.length).toBeGreaterThan(0);

    for (const reach of reachLabels) {
      const reachBars = bars.filter(b => b.reachLabel === reach);
      const excBars  = reachBars.filter(b => b.boqItemId === 1);
      const embBars  = reachBars.filter(b => b.boqItemId === 2);

      // Both item types must have bars on this reach
      if (excBars.length === 0 || embBars.length === 0) continue;

      const excStart = Math.min(...excBars.map(b => b.startMonth));
      const embStart = Math.min(...embBars.map(b => b.startMonth));

      expect(excStart).toBe(embStart);
    }
  });

  it("embankment with borrow starts concurrently with roadway excavation", () => {
    const items = [
      makeItem(10, "Excavation in Cutting"),
      makeItem(11, "Embankment with Borrow Material"),
    ];

    const { bars } = generateSequencedProgramme(items, BASE_OPTS);
    const reachLabels = [...new Set(bars.map(b => b.reachLabel))];

    for (const reach of reachLabels) {
      const reachBars = bars.filter(b => b.reachLabel === reach);
      const excBars  = reachBars.filter(b => b.boqItemId === 10);
      const embBars  = reachBars.filter(b => b.boqItemId === 11);
      if (excBars.length === 0 || embBars.length === 0) continue;

      expect(Math.min(...excBars.map(b => b.startMonth)))
        .toBe(Math.min(...embBars.map(b => b.startMonth)));
    }
  });

  it("GSB starts after earthwork stage on every reach (stage ordering is preserved)", () => {
    const items = [
      makeItem(20, "Roadway Excavation in Hard Rock"),
      makeItem(21, "Embankment with Cut Material"),
      makeItem(22, "Granular Sub-Base"),
    ];

    const { bars } = generateSequencedProgramme(items, BASE_OPTS);
    const reachLabels = [...new Set(bars.map(b => b.reachLabel))];

    for (const reach of reachLabels) {
      const reachBars = bars.filter(b => b.reachLabel === reach);
      const excBars = reachBars.filter(b => b.boqItemId === 20);
      const embBars = reachBars.filter(b => b.boqItemId === 21);
      const gsbBars = reachBars.filter(b => b.boqItemId === 22);
      if (!excBars.length || !embBars.length || !gsbBars.length) continue;

      const earthworkEnd = Math.max(
        ...excBars.map(b => b.endMonth),
        ...embBars.map(b => b.endMonth),
      );
      const gsbStart = Math.min(...gsbBars.map(b => b.startMonth));

      // GSB must start at or after the earthwork stage ends (with lag)
      expect(gsbStart).toBeGreaterThanOrEqual(earthworkEnd);
    }
  });
});

// ─── normaliseBoqUnit — strip leading numeric prefix ─────────────────────────

describe("normaliseBoqUnit", () => {
  it("passes plain CUM through unchanged", () => {
    expect(normaliseBoqUnit("CUM")).toBe("CUM");
  });

  it("strips leading '1 ' from '1 Cum' and uppercases", () => {
    expect(normaliseBoqUnit("1 Cum")).toBe("CUM");
  });

  it("strips leading '1.00 ' from '1.00 Cum' and uppercases", () => {
    expect(normaliseBoqUnit("1.00 Cum")).toBe("CUM");
  });

  it("strips leading integer without space ('1CUM')", () => {
    expect(normaliseBoqUnit("1CUM")).toBe("CUM");
  });

  it("leaves non-numeric-prefixed units alone ('SQM')", () => {
    expect(normaliseBoqUnit("SQM")).toBe("SQM");
  });

  it("leaves 'MT' alone", () => {
    expect(normaliseBoqUnit("MT")).toBe("MT");
  });

  it("strips '2 ' from '2 NOS'", () => {
    expect(normaliseBoqUnit("2 NOS")).toBe("NOS");
  });
});

// ─── classifyWorkType: "1 Cum" unit variant (BOQ import prefix bug) ──────────

describe("classifyWorkType — unit '1 Cum' (BOQ numeric-prefix import format)", () => {
  it("classifies roadway excavation with '1 Cum' as roadway_excavation", () => {
    expect(classifyWorkType("Roadway Excavation in Ordinary Soil", "1 Cum")).toBe("roadway_excavation");
  });

  it("classifies roadway excavation with '1.00 Cum' as roadway_excavation", () => {
    expect(classifyWorkType("Roadway Excavation in Hard Rock", "1.00 Cum")).toBe("roadway_excavation");
  });

  it("classifies embankment with borrow earth with '1 Cum' as earthwork", () => {
    expect(classifyWorkType("Embankment with Borrow Earth", "1 Cum")).toBe("earthwork");
  });

  it("classifies embankment with excavated earth with '1 Cum' as earthwork", () => {
    expect(classifyWorkType("Embankment with Excavated Earth", "1 Cum")).toBe("earthwork");
  });

  it("classifies construction of subgrade with '1 Cum' as earthwork", () => {
    expect(classifyWorkType("Construction of Subgrade using Embankment Material", "1 Cum")).toBe("earthwork");
  });

  it("classifies earthen shoulders with '1 Cum' as earthwork", () => {
    expect(classifyWorkType("Construction of Earthen Shoulders", "1 Cum")).toBe("earthwork");
  });
});

// ─── generateSequencedProgramme: workCategory fallback ───────────────────────

describe("generateSequencedProgramme — workCategory fallback when classifyWorkType returns null", () => {
  const BASE_OPTS = { fronts: 1, staggerMonths: 0, lagMonths: 0 };

  it("sequences an EARTHWORK-category item that has an unrecognisable unit ('UNIT')", () => {
    const items = [
      {
        boqItemId: 1,
        description: "Some unusual earthwork description XYZ-99",
        unit: "UNIT",   // classifyWorkType will return null for this
        totalQty: 1000,
        fullDurationMonths: 3,
        workCategory: "EARTHWORK",
      },
    ];
    const { bars, unclassifiedItemIds } = generateSequencedProgramme(items, BASE_OPTS);
    expect(unclassifiedItemIds).not.toContain(1);
    expect(bars.some(b => b.boqItemId === 1)).toBe(true);
  });

  it("sequences a BITUMINOUS-category item that has an unrecognisable unit", () => {
    const items = [
      {
        boqItemId: 2,
        description: "Some bituminous item with weird unit",
        unit: "UNIT",
        totalQty: 5000,
        fullDurationMonths: 2,
        workCategory: "BITUMINOUS",
      },
    ];
    const { bars, unclassifiedItemIds } = generateSequencedProgramme(items, BASE_OPTS);
    expect(unclassifiedItemIds).not.toContain(2);
    expect(bars.some(b => b.boqItemId === 2)).toBe(true);
  });

  it("still places item in unclassifiedItemIds when workCategory is null and unit is unrecognisable", () => {
    const items = [
      {
        boqItemId: 3,
        description: "Completely unknown item type",
        unit: "UNIT",
        totalQty: 100,
        fullDurationMonths: 1,
        workCategory: null,
      },
    ];
    const { unclassifiedItemIds } = generateSequencedProgramme(items, BASE_OPTS);
    expect(unclassifiedItemIds).toContain(3);
  });

  it("EARTHWORK workCategory items are sequenced before SUBBASE_BASE items", () => {
    const items = [
      {
        boqItemId: 10,
        description: "Unknown earthwork item XYZ",
        unit: "UNIT",
        totalQty: 500,
        fullDurationMonths: 2,
        workCategory: "EARTHWORK",
      },
      {
        boqItemId: 11,
        description: "Unknown subbase item XYZ",
        unit: "UNIT",
        totalQty: 500,
        fullDurationMonths: 2,
        workCategory: "SUBBASE_BASE",
      },
    ];
    const { bars } = generateSequencedProgramme(items, BASE_OPTS);
    const earthworkBars = bars.filter(b => b.boqItemId === 10);
    const subbaseBars  = bars.filter(b => b.boqItemId === 11);
    expect(earthworkBars.length).toBeGreaterThan(0);
    expect(subbaseBars.length).toBeGreaterThan(0);
    const earthworkEnd = Math.max(...earthworkBars.map(b => b.endMonth));
    const subbaseStart = Math.min(...subbaseBars.map(b => b.startMonth));
    // Subbase must start after or at earthwork end (dependency ordering)
    expect(subbaseStart).toBeGreaterThanOrEqual(earthworkEnd);
  });
});

describe("canonical planning classifier parity", () => {
  it("keeps ROAD_FURNITURE with an RCC foundation on the road track", () => {
    const item = {
      boqItemId: 99,
      description: "Providing RCC M20 foundation for kilometre stone",
      unit: "CUM",
      totalQty: 10,
      fullDurationMonths: 1,
      workCategory: "ROAD_FURNITURE",
    };
    expect(classifyPlanningItem(item).planningWorkType).toBe("road");
    const { diagnostics, unclassifiedItemIds } = generateSequencedProgramme([item], {
      fronts: 1, staggerMonths: 0, lagMonths: 0,
    });
    expect(unclassifiedItemIds).not.toContain(item.boqItemId);
    expect(diagnostics.find(diagnostic => diagnostic.boqItemId === item.boqItemId)?.track).toBe("pavement");
  });
});
