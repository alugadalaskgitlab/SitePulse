/**
 * Instruction 029B — Execution Stage/Front model + side-aware stretch overlap.
 *
 * Acceptance coverage (unit level — dialog UI covered manually):
 *  C — shared stage is allowed (no "priority used more than once" error)
 *  D — same-stage stretches receive an identical stagger offset
 *  E — same stage + same front → non-blocking warning
 *  F — same stage + different fronts → no warning
 *  G — same chainage, LHS vs RHS → accepted (distinct corridors)
 *  H — same chainage, LHS vs LHS → overlap error remains
 *  I — same chainage, Full Width vs LHS → overlap remains
 *  J — same chainage, one side unspecified → "side must be confirmed" error
 *  K — legacy stretches without front/executionOrder still schedule fine
 */
import { describe, it, expect } from "vitest";
import {
  generateSequencedProgramme,
  validateStretches,
  type SeqInputItem,
} from "../shared/programmeSequencer";
import { areSidesDistinctCorridors } from "../shared/barSide";

const gsbItem: SeqInputItem = {
  boqItemId: 1,
  description: "Providing and laying Granular Sub Base with well graded material as per MoRTH 401",
  unit: "Cum",
  totalQty: 30000,
  fullDurationMonths: 6,
};

const baseOpts = {
  fronts: 2,
  totalMonths: 18,
  roadLengthKm: 20,
  chainageStartKm: 100,
  staggerMonths: 2,
  lagMonths: 0,
  disableStructureFronts: true,
};

describe("029B areSidesDistinctCorridors", () => {
  it("distinct named corridors are non-overlapping", () => {
    expect(areSidesDistinctCorridors("lhs", "rhs")).toBe(true);
    expect(areSidesDistinctCorridors("shoulder_lhs", "shoulder_rhs")).toBe(true);
    expect(areSidesDistinctCorridors("service_road_lhs", "service_road_rhs")).toBe(true);
    expect(areSidesDistinctCorridors("median", "lhs")).toBe(true);
  });
  it("same side, full_width/both_sides, or null are NOT distinct", () => {
    expect(areSidesDistinctCorridors("lhs", "lhs")).toBe(false);
    expect(areSidesDistinctCorridors("full_width", "lhs")).toBe(false);
    expect(areSidesDistinctCorridors("both_sides", "rhs")).toBe(false);
    expect(areSidesDistinctCorridors(null, "lhs")).toBe(false);
    expect(areSidesDistinctCorridors("lhs", null)).toBe(false);
  });
});

describe("029B validateStretches — stage/front model", () => {
  it("C: two stretches sharing a stage produce no duplicate-priority error", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs", front: "A" },
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "rhs", front: "B" },
      ],
      100, 120,
    );
    expect(v.errors).toHaveLength(0);
    expect(v.overlaps).toHaveLength(0);
  });

  it("E: same stage + same front → non-blocking warning only", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs", front: "Front A" },
        { chainageFrom: 110, chainageTo: 120, priority: 1, side: "lhs", front: "front a" },
      ],
      100, 120,
    );
    expect(v.errors).toHaveLength(0);
    expect(v.overlaps).toHaveLength(0);
    expect(v.warnings.some(w => /double-booked in stage 1/i.test(w))).toBe(true);
  });

  it("F: same stage + different fronts → no warning", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs", front: "A" },
        { chainageFrom: 110, chainageTo: 120, priority: 1, side: "lhs", front: "B" },
      ],
      100, 120,
    );
    expect(v.warnings).toHaveLength(0);
  });

  it("blank fronts never trigger the double-booking warning", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs" },
        { chainageFrom: 110, chainageTo: 120, priority: 1, side: "rhs" },
      ],
      100, 120,
    );
    expect(v.warnings).toHaveLength(0);
  });
});

describe("029B validateStretches — side-aware overlap", () => {
  const range: [number, number] = [100, 120];

  it("G: same chainage LHS vs RHS → accepted, no overlap error", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs" },
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "rhs" },
      ],
      ...range,
    );
    expect(v.overlaps).toHaveLength(0);
    expect(v.errors).toHaveLength(0);
  });

  it("H: same chainage LHS vs LHS → overlap error remains", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs" },
        { chainageFrom: 100, chainageTo: 110, priority: 2, side: "lhs" },
      ],
      ...range,
    );
    expect(v.overlaps).toHaveLength(1);
  });

  it("I: same chainage Full Width vs LHS → overlap remains", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "full_width" },
        { chainageFrom: 100, chainageTo: 110, priority: 2, side: "lhs" },
      ],
      ...range,
    );
    expect(v.overlaps).toHaveLength(1);
  });

  it("J: same chainage with one side unspecified → clear 'side must be confirmed' error", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: null },
        { chainageFrom: 100, chainageTo: 110, priority: 2, side: "rhs" },
      ],
      ...range,
    );
    expect(v.overlaps).toHaveLength(0); // not a false duplicate
    expect(v.errors.some(e => /side must be confirmed/i.test(e))).toBe(true);
  });

  it("non-overlapping chainage never asks for side confirmation", () => {
    const v = validateStretches(
      [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: null },
        { chainageFrom: 110, chainageTo: 120, priority: 2, side: null },
      ],
      ...range,
    );
    expect(v.errors).toHaveLength(0);
    expect(v.overlaps).toHaveLength(0);
  });
});

describe("029B sequencer — shared-stage stagger + front carry-through", () => {
  it("D: same-stage stretches get an identical stagger offset; next stage advances", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 108, priority: 1, side: "lhs", front: "A" },
        { chainageFrom: 100, chainageTo: 108, priority: 1, side: "rhs", front: "B" },
        { chainageFrom: 108, chainageTo: 120, priority: 2, side: "full_width", front: "A" },
      ],
    });
    const lhs = bars.find(b => (b as any).side === "lhs")!;
    const rhs = bars.find(b => (b as any).side === "rhs")!;
    const fw = bars.find(b => (b as any).side === "full_width")!;
    expect(lhs.startMonth).toBeCloseTo(rhs.startMonth, 5); // start together
    expect(fw.startMonth).toBeGreaterThan(lhs.startMonth); // stage 2 staggers on
    expect(lhs.sequenceOrder).toBe(1);
    expect(rhs.sequenceOrder).toBe(1);
    expect(fw.sequenceOrder).toBe(2);
  });

  it("carries front + executionOrder onto road bars", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "lhs", front: "Crew 1", executionOrder: 1 },
        { chainageFrom: 100, chainageTo: 110, priority: 1, side: "rhs", front: "Crew 2", executionOrder: 2 },
      ],
    });
    const lhs = bars.find(b => (b as any).side === "lhs")!;
    const rhs = bars.find(b => (b as any).side === "rhs")!;
    expect(lhs.executionFront).toBe("Crew 1");
    expect(rhs.executionFront).toBe("Crew 2");
    expect(lhs.executionOrder).toBe(1);
    expect(rhs.executionOrder).toBe(2);
  });

  it("K: legacy stretches without front/executionOrder schedule unchanged", () => {
    const { bars } = generateSequencedProgramme([gsbItem], {
      ...baseOpts,
      stretches: [
        { chainageFrom: 100, chainageTo: 110, priority: 1 },
        { chainageFrom: 110, chainageTo: 120, priority: 2 },
      ],
    });
    const r1 = bars.find(b => b.sequenceOrder === 1)!;
    const r2 = bars.find(b => b.sequenceOrder === 2)!;
    expect(r2.startMonth - r1.startMonth).toBeCloseTo(2, 5); // distinct stages still stagger
    expect(r1.executionFront ?? null).toBeNull();
    expect(r1.executionOrder ?? null).toBeNull();
  });
});
