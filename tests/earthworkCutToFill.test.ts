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
import { deriveEarthworkSourcingBadge, checkCutFillBalance } from "../shared/planningEngine";

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
