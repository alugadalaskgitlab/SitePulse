import { describe, expect, it } from "vitest";
import {
  calculateLevelSheet,
  convertReadingValues,
  deriveDesignRowsFromFrl,
  formatChainage,
  formatChainagePair,
  interpolateDesignAt,
  normalizeDesignImportRows,
  parseChainage,
  toBookChainage,
  toOursChainage,
  type DesignLevelRow,
  type ReadingRow,
} from "../shared/levelSheets";

const design: DesignLevelRow[] = [
  { chainageOursKm: 2.6, centreLevel: 100, crossfallLeftPct: 2, crossfallRightPct: 2, topWidthLeftM: 3, topWidthRightM: 3, source: "TYPED" },
  { chainageOursKm: 2.7, centreLevel: 100.1, crossfallLeftPct: 2, crossfallRightPct: 2, topWidthLeftM: 3, topWidthRightM: 3, source: "EXCEL" },
];

describe("LEVELS-01 chainage and design utilities", () => {
  it("parses and formats chainage and converts consultant offsets in both directions", () => {
    expect(parseChainage("2+600")).toBe(2.6);
    expect(formatChainage(2.6)).toBe("2+600");
    expect(toOursChainage(3.35, "consultant", 750)).toBe(2.6);
    expect(toBookChainage(2.6, "consultant", 750)).toBe(3.35);
    expect(formatChainagePair(2.6, "consultant", 750)).toBe("Ours 2+600 · Consultant 3+350");
    expect(parseChainage("not a chainage")).toBeNull();
  });

  it("returns exact design rows at their endpoints and linearly interpolates values between them", () => {
    expect(interpolateDesignAt(design, 2.6)).toMatchObject({ centreLevel: 100, crossfallLeftPct: 2 });
    expect(interpolateDesignAt(design, 2.65)).toMatchObject({ centreLevel: 100.05, topWidthRightM: 3 });
    expect(interpolateDesignAt(design, 2.5)).toBeNull();
  });

  it("normalizes mapped consultant Excel values to the project's chainage", () => {
    const rows = normalizeDesignImportRows([{
      "Chainage from book": "3+350", "Design RL": "100,1", "Left crossfall": "2",
      "Right crossfall": "2", "Left width": "3", "Right width": "3",
    }], {
      chainage: "Chainage from book", centreLevel: "Design RL", crossfallLeft: "Left crossfall",
      crossfallRight: "Right crossfall", topWidthLeft: "Left width", topWidthRight: "Right width",
    }, "consultant", 750);
    expect(rows[0]).toMatchObject({ chainageOursKm: 2.6, centreLevel: 100.1, source: "EXCEL" });
  });

  it("derives a layer from FRL minus depth while keeping cross-fall and widths", () => {
    expect(deriveDesignRowsFromFrl(design, 0.25)).toEqual([
      { ...design[0], id: undefined, centreLevel: 99.75, source: "TYPED" },
      { ...design[1], id: undefined, centreLevel: 99.85, source: "TYPED" },
    ]);
  });

  it("calculates staff RLs, cross-fall design levels, tolerance labels, and cut volume", () => {
    const readings: ReadingRow[] = [2.6, 2.61].map(chainageOursKm => ({
      chainageOursKm,
      points: [
        { columnKey: "left", side: "L", distanceM: 2, value: 1.04 },
        { columnKey: "centre", side: "CL", distanceM: 0, value: 1 },
        { columnKey: "right", side: "R", distanceM: 2, value: 1.04 },
      ],
    }));
    const result = calculateLevelSheet({
      designRows: [{ ...design[0], chainageOursKm: 2.6, centreLevel: 101, crossfallLeftPct: 2, crossfallRightPct: 2, topWidthLeftM: 2, topWidthRightM: 2 },
        { ...design[1], chainageOursKm: 2.61, centreLevel: 101, crossfallLeftPct: 2, crossfallRightPct: 2, topWidthLeftM: 2, topWidthRightM: 2 }],
      readings, mode: "staff", tbmRl: 100, backsight: 2, closingForesight: 2,
      toleranceAboveMm: 5, toleranceBelowMm: 10,
    });
    expect(result.sections[0].points.map(point => point.rl)).toEqual([100.96, 101, 100.96]);
    expect(result.sections[0].points.every(point => point.comparison === "Within")).toBe(true);
    expect(result.sections[0].cutAreaSqm).toBeCloseTo(0, 8);
    expect(result.closingErrorMm).toBeCloseTo(0, 6);
  });

  it("converts between staff readings and RLs without changing equivalent heights", () => {
    const readings: ReadingRow[] = [{
      chainageOursKm: 1.25,
      points: [{ columnKey: "centre", side: "CL", distanceM: 0, value: 1.25 }],
    }];
    const rl = convertReadingValues(readings, "staff", "rl", { tbmRl: 100, backsight: 1 });
    expect(rl[0].points[0].value).toBeCloseTo(99.75, 8);
    const staff = convertReadingValues(rl, "rl", "staff", { tbmRl: 100, backsight: 1 });
    expect(staff[0].points[0].value).toBeCloseTo(1.25, 8);
    expect(() => convertReadingValues(readings, "staff", "rl", {})).toThrow(/TBM level and back sight/);
  });

  it("calculates trapezoidal cross-sections and volumes and flags points outside the design width", () => {
    const flatDesign: DesignLevelRow[] = [0, 0.01].map(chainageOursKm => ({
      chainageOursKm, centreLevel: 100, crossfallLeftPct: 0, crossfallRightPct: 0,
      topWidthLeftM: 2, topWidthRightM: 2, source: "TYPED",
    }));
    const readings: ReadingRow[] = [0, 0.01].map(chainageOursKm => ({
      chainageOursKm,
      points: [
        { columnKey: "far-left", side: "L", distanceM: 4, value: 100.1 },
        { columnKey: "left", side: "L", distanceM: 2, value: 100.1 },
        { columnKey: "centre", side: "CL", distanceM: 0, value: 100.1 },
        { columnKey: "right", side: "R", distanceM: 2, value: 100.1 },
      ],
    }));
    const result = calculateLevelSheet({
      designRows: flatDesign, readings, mode: "rl", toleranceAboveMm: 20, toleranceBelowMm: 20,
    });
    expect(result.sections[0].points[0].comparison).toBe("outside width");
    expect(result.sections[0].points[1].differenceMm).toBeCloseTo(100, 6);
    expect(result.sections[0].points[1].comparison).toBe("High");
    expect(result.sections[0].cutAreaSqm).toBeCloseTo(0.4, 6);
    expect(result.cutVolumeCum).toBeCloseTo(4, 6);
    expect(result.volumeSegments).toBe(1);
  });
});
