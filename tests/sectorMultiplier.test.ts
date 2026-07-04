import { describe, it, expect } from "vitest";
import { getSectorMultiplier } from "../server/snlAutoMapper";

// Task #1240 — widen SDB cross-book matching so structure categories can
// fall back to IRRIGATION-book SDB items, but only as a penalized secondary
// candidate (never primary), and never for pure road/earthwork categories.

describe("getSectorMultiplier — cross-book SDB fallback", () => {
  it("IRRIGATION is a penalized secondary match for pipe_culvert", () => {
    const m = getSectorMultiplier("pipe_culvert", "IRRIGATION");
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it("IRRIGATION is a penalized secondary match for retaining_wall", () => {
    const m = getSectorMultiplier("retaining_wall", "IRRIGATION");
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it("IRRIGATION is a penalized secondary match for bridge_structure", () => {
    const m = getSectorMultiplier("bridge_structure", "IRRIGATION");
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it("IRRIGATION is a penalized secondary match for reinforcement", () => {
    const m = getSectorMultiplier("reinforcement", "IRRIGATION");
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it("IRRIGATION is a penalized secondary match for drainage", () => {
    const m = getSectorMultiplier("drainage", "IRRIGATION");
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it("STRUCTURES remains a full primary match (no penalty) for bridge_structure", () => {
    expect(getSectorMultiplier("bridge_structure", "STRUCTURES")).toBe(1.0);
  });

  it("ROAD remains excluded (0) for earthwork's non-allowed sectors, but IRRIGATION is never even secondary there", () => {
    // earthwork has no secondary sectors at all — IRRIGATION must be excluded, not merely penalized.
    expect(getSectorMultiplier("earthwork", "IRRIGATION")).toBe(0);
  });

  it("IRRIGATION is excluded (0) for road_furniture — pure road category with no fallback", () => {
    expect(getSectorMultiplier("road_furniture", "IRRIGATION")).toBe(0);
  });

  it("IRRIGATION is excluded (0) for electrical_misc — unrelated category", () => {
    expect(getSectorMultiplier("electrical_misc", "IRRIGATION")).toBe(0);
  });

  it("road_pavement's own primary sectors (ROAD) still score 1.0 unaffected by the IRRIGATION change", () => {
    expect(getSectorMultiplier("road_pavement", "ROAD")).toBe(1.0);
  });

  it("secondary-sector penalty is strictly less than the primary score for the same category", () => {
    const primary = getSectorMultiplier("bridge_structure", "STRUCTURES");
    const secondaryIrrigation = getSectorMultiplier("bridge_structure", "IRRIGATION");
    expect(secondaryIrrigation).toBeLessThan(primary);
  });

  it("unknown/blank sector returns the neutral 0.7 fallback regardless of category", () => {
    expect(getSectorMultiplier("pipe_culvert", null)).toBe(0.7);
    expect(getSectorMultiplier("pipe_culvert", "")).toBe(0.7);
    expect(getSectorMultiplier("pipe_culvert", undefined)).toBe(0.7);
  });

  // ── MISCELLANEOUS ("SDB MISCELLANEOUS" source book) ─────────────────────────

  it("MISCELLANEOUS is a penalized secondary match for structure/protection categories", () => {
    for (const cat of ["pipe_culvert", "retaining_wall", "bridge_structure", "reinforcement", "drainage"] as const) {
      const m = getSectorMultiplier(cat, "MISCELLANEOUS");
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThan(1);
    }
  });

  it("MISCELLANEOUS is excluded (0) for pure road categories with no fallback", () => {
    expect(getSectorMultiplier("earthwork", "MISCELLANEOUS")).toBe(0);
    expect(getSectorMultiplier("road_furniture", "MISCELLANEOUS")).toBe(0);
    expect(getSectorMultiplier("electrical_misc", "MISCELLANEOUS")).toBe(0);
  });

  it("MISCELLANEOUS and IRRIGATION receive the same penalized fallback weight", () => {
    expect(getSectorMultiplier("bridge_structure", "MISCELLANEOUS")).toBe(getSectorMultiplier("bridge_structure", "IRRIGATION"));
  });
});
