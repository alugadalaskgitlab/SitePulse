import { describe, expect, it } from "vitest";
import {
  calculateArrangementExecutionEvidence,
  DPR_INCOMPLETE_WARNING,
  PARTIALLY_LINKED_WARNING,
} from "../shared/arrangementExecutionEvidence";

const arrangement = { id: 10, boqProjectId: 1, agencyName: "Narasimulu" };
const bars = [
  { id: 1, boqProjectId: 1, boqItemId: 20, chainageFrom: 0, chainageTo: 1, side: "lhs", allocatedQty: 500, unit: "CUM" },
  { id: 2, boqProjectId: 1, boqItemId: 20, chainageFrom: 1, chainageTo: 2, side: "lhs", allocatedQty: 500, unit: "CUM" },
];

describe("arrangement execution evidence", () => {
  it("uses exact current DPR bar links once and corrected links replace old aggregates", () => {
    const first = calculateArrangementExecutionEvidence(arrangement, bars, [{ id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, quantity: 500, isValid: true }], []);
    const corrected = calculateArrangementExecutionEvidence(arrangement, bars, [{ id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 2, quantity: 500, isValid: true }], []);
    expect(first.map(x => x.dprExecutedQty)).toEqual([500, 0]);
    expect(corrected.map(x => x.dprExecutedQty)).toEqual([0, 500]);
  });

  it("does not retain a wrong-BOQ DPR contribution after its current correction", () => {
    const wrong = calculateArrangementExecutionEvidence(arrangement, bars, [{ id: 1, boqProjectId: 1, boqItemId: 99, programmeBarId: 1, quantity: 500, isValid: true }], []);
    const corrected = calculateArrangementExecutionEvidence(arrangement, bars, [{ id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, quantity: 500, isValid: true }], []);
    expect(wrong[0].dprExecutedQty).toBe(0);
    expect(corrected[0].dprExecutedQty).toBe(500);
  });

  it("does not guess fallback layer identity because programme bars have no layer field", () => {
    const incomplete = calculateArrangementExecutionEvidence(arrangement, bars, [{
      id: 1, boqProjectId: 1, boqItemId: 20, quantity: 100, chainageFromKm: 0, chainageToKm: 1, side: "LHS", layerNo: 2, isValid: true,
    }], []);
    const completed = calculateArrangementExecutionEvidence(arrangement, bars, [{
      id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, quantity: 100, chainageFromKm: 0, chainageToKm: 1, side: "LHS", layerNo: 2, isValid: true,
    }], []);
    expect(incomplete[0].warnings).toContain(DPR_INCOMPLETE_WARNING);
    expect(incomplete[0].dprExecutedQty).toBe(0);
    expect(completed[0].dprExecutedQty).toBe(100);
  });

  it("splits a fallback DPR by chainage rather than duplicating its full quantity", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [{
      id: 1, boqProjectId: 1, boqItemId: 20, quantity: 100, chainageFromKm: 0, chainageToKm: 2, side: "LHS", isValid: true,
    }], []);
    expect(result.map(x => x.dprExecutedQty)).toEqual([50, 50]);
    expect(result[0].balanceVsAllocation).toBe(450);
  });

  it("flags insufficient DPR linkage instead of guessing", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [{ id: 1, boqProjectId: 1, boqItemId: 20, quantity: 10, isValid: true }], []);
    expect(result[0].warnings).toContain(DPR_INCOMPLETE_WARNING);
    expect(result[0].balanceVsAllocation).toBeNull();
  });

  it("marks incomplete multi-bar coverage rather than allocating an uncovered remainder", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [{
      id: 1, boqProjectId: 1, boqItemId: 20, quantity: 100, chainageFromKm: 0, chainageToKm: 3, side: "LHS", isValid: true,
    }], []);
    expect(result.map(x => x.dprExecutedQty)).toEqual([33.333333, 33.333333]);
    expect(result[0].warnings).toContain(DPR_INCOMPLETE_WARNING);
  });

  it("counts only active exact-ID vendor trips and retains CFT plus Cum", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [], [
      { id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 35314.7, uom: "CFT" },
      { id: 2, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, earthworkArrangementId: 10, supplier: "Other vendor", quantity: 100, uom: "CFT" },
      { id: 3, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 100, uom: "CFT", isCancelled: true },
    ]);
    expect(result[0].tripCount).toBe(1);
    expect(result[0].tripOriginal).toEqual([{ uom: "CFT", quantity: 35314.7 }]);
    expect(result[0].tripConvertedCum).toBe(1000);
    expect(result[0].warnings).toContain(PARTIALLY_LINKED_WARNING);
  });

  it("sums multiple canonical trips once and moves corrected trip linkage live", () => {
    const initial = calculateArrangementExecutionEvidence(arrangement, bars, [], [
      { id: 1, boqProjectId: 1, boqItemId: 20, supplier: "Narasimulu", quantity: 35.3147, uom: "CFT" },
    ]);
    const corrected = calculateArrangementExecutionEvidence(arrangement, bars, [], [
      { id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 2, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 35.3147, uom: "CFT" },
      { id: 2, boqProjectId: 1, boqItemId: 20, programmeBarId: 2, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 35.3147, uom: "CFT" },
    ]);
    expect(initial[0].tripCount).toBe(0);
    expect(corrected.map(x => x.tripCount)).toEqual([0, 2]);
    expect(corrected[1].tripConvertedCum).toBe(2);
  });

  it("deduplicates repeated canonical trip IDs and does not warn unrelated wrong-BOQ trips", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [], [
      { id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 35.3147, uom: "CFT" },
      { id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 35.3147, uom: "CFT" },
      { id: 2, boqProjectId: 1, boqItemId: 99, supplier: "Narasimulu", quantity: 20, uom: "CFT" },
    ]);
    expect(result[0].tripCount).toBe(1);
    expect(result[0].warnings).not.toContain(PARTIALLY_LINKED_WARNING);
  });

  it("does not present absent trips as zero-Cum evidence or a variance", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [{
      id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, quantity: 20, isValid: true,
    }], []);
    expect(result[0].tripConvertedCum).toBeNull();
    expect(result[0].varianceCum).toBeNull();
  });

  it("shows DPR/trip variance without using trip quantity as work-progress balance", () => {
    const result = calculateArrangementExecutionEvidence(arrangement, bars, [{ id: 1, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, quantity: 1820, isValid: true }], [
      { id: 2, boqProjectId: 1, boqItemId: 20, programmeBarId: 1, earthworkArrangementId: 10, supplier: "Narasimulu", quantity: 63404.01238, uom: "CFT" },
    ]);
    expect(result[0].varianceCum).toBe(24.6);
    expect(result[0].balanceVsAllocation).toBe(-1320);
    expect((result[0] as any).officialStatus).toBeUndefined();
  });
});