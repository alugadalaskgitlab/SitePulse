import { describe, it, expect } from "vitest";
import { generateSequencedProgramme } from "../shared/programmeSequencer";
import { classifyWorkType } from "../shared/workTypeRecipes";

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
});

describe("classifyWorkType — earthwork (embankment/fill, not cutting)", () => {
  const CUM = "CUM";

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

    const bars = generateSequencedProgramme(items, BASE_OPTS);

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

    const bars = generateSequencedProgramme(items, BASE_OPTS);
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

    const bars = generateSequencedProgramme(items, BASE_OPTS);
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
