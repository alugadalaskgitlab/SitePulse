// INSTRUCTION 06T — Guided DPR integrity & context chain.
// Focused seam tests: tolerant material suggestion matching (§4), suggestion
// tier gating with hints, and chainage-derived length reconciliation (§1).
import { describe, it, expect } from "vitest";
import {
  materialsLooselyMatch,
  classifyReceiptMatch,
  resolveApplicableArrangements,
  aggregateReceived,
  normaliseUom,
  type ApplicableArrangementInput,
  type SuggestableTrip,
} from "../shared/materialReceiptSummary";
import { calculateLengthFromChainage } from "../shared/dprGeometry";

const trip = (over: Partial<SuggestableTrip> = {}): SuggestableTrip => ({
  id: 1,
  date: "2026-08-16",
  site: "TAKKADPALLY-SIRUR",
  material: "Soil",
  quantity: 450,
  uom: "CFT",
  isCancelled: false,
  isDeleted: false,
  ...over,
});

describe("06T §4 — tolerant material matching (suggested tier only)", () => {
  it("matches 'Soil' against 'Soil / Earth' (the real prod arrangement label)", () => {
    expect(materialsLooselyMatch("Soil", "Soil / Earth")).toBe(true);
  });
  it("matches 'Soil' against 'Embankment - Borrow Earth' via the earth→soil alias", () => {
    expect(materialsLooselyMatch("Soil", "Embankment - Borrow Earth")).toBe(true);
  });
  it("matches murrum/moorum spellings into the soil group", () => {
    expect(materialsLooselyMatch("Murrum", "Soil / Earth")).toBe(true);
    expect(materialsLooselyMatch("Moorum filling", "soil")).toBe(true);
  });
  it("does NOT match unrelated materials", () => {
    expect(materialsLooselyMatch("Soil", "GSB")).toBe(false);
    expect(materialsLooselyMatch("Aggregate 20mm", "Soil / Earth")).toBe(false);
    expect(materialsLooselyMatch("Cement", "Embankment - Borrow Earth")).toBe(false);
  });
  it("stopwords alone never create a match", () => {
    expect(materialsLooselyMatch("Supply of material", "Material for grade")).toBe(false);
  });
  it("null/empty never match", () => {
    expect(materialsLooselyMatch(null, "Soil")).toBe(false);
    expect(materialsLooselyMatch("Soil", "")).toBe(false);
  });
});

describe("06T §4 — classifyReceiptMatch with hints", () => {
  const baseCtx = {
    siteName: "TAKKADPALLY-SIRUR",
    date: "2026-08-16",
    boqProjectId: 1,
    boqItemId: 3,
    programmeBarId: 411,
    earthworkArrangementId: 1,
    materialLabel: "Soil / Earth",
  };
  it("suggests an unclaimed 'Soil' trip against arrangement label 'Soil / Earth'", () => {
    expect(classifyReceiptMatch(trip(), baseCtx)).toBe("suggested");
  });
  it("suggests via materialHints (BOQ item name) when the arrangement label differs", () => {
    const ctx = { ...baseCtx, materialLabel: null, materialHints: ["Construction of Embankment with Borrow Earth"] };
    expect(classifyReceiptMatch(trip(), ctx)).toBe("suggested");
  });
  it("never suggests a trip already ID-claimed by another activity", () => {
    expect(classifyReceiptMatch(trip({ boqItemId: 99 }), baseCtx)).toBeNull();
  });
  it("linked tier stays strict — ID equality only", () => {
    expect(classifyReceiptMatch(trip({ earthworkArrangementId: 1 }), baseCtx)).toBe("linked");
    expect(classifyReceiptMatch(trip({ earthworkArrangementId: 2 }), baseCtx)).toBeNull();
  });
  it("unrelated material with no hints yields no suggestion", () => {
    expect(classifyReceiptMatch(trip({ material: "GSB" }), baseCtx)).toBeNull();
  });
});

// ── 06T-HF: real TAKKADPALLY-SIRUR arrangements (prod shapes verbatim) ──────
describe("06T-HF §1 — live resolution against the real prod arrangements", () => {
  const prodArrangements: ApplicableArrangementInput[] = [
    { id: 1, status: "submitted", arrangementType: "reused_excavated", boqProjectId: 1, boqItemId: 3, agencyName: "", materialLabel: "Soil / Earth" },
    { id: 2, status: "in_progress", arrangementType: "hlc_source_outsourced_execution", boqProjectId: 1, boqItemId: 5, agencyName: "Narasimulu", materialLabel: "Embankment - Borrow earth" },
    { id: 3, status: "in_progress", arrangementType: "hlc_source_outsourced_execution", boqProjectId: 1, boqItemId: 6, agencyName: "narsimulu", materialLabel: "Construction of Sub grade — reach 3" },
  ];
  const allocations = [
    { arrangementId: 2, programmeBarId: 458, boqItemId: 5, allocatedQty: 3783.052 },
    { arrangementId: 2, programmeBarId: 473, boqItemId: 5, allocatedQty: 291.004 },
    { arrangementId: 2, programmeBarId: 472, boqItemId: 5, allocatedQty: 2473.534 },
    { arrangementId: 3, programmeBarId: 459, boqItemId: 6, allocatedQty: 9000 },
  ];
  it("arrangement #2 (in_progress, plain boqItemId link) resolves for item 5", () => {
    const r = resolveApplicableArrangements(prodArrangements, { boqProjectId: 1, boqItemId: 5, programmeBarId: 472 }, allocations);
    expect(r.prefill?.id).toBe(2);
    expect(r.none).toBe(false);
  });
  it("resolves for item 5 even on a bar with no allocation row (no narrowing to empty)", () => {
    const r = resolveApplicableArrangements(prodArrangements, { boqProjectId: 1, boqItemId: 5, programmeBarId: 999 }, allocations);
    expect(r.prefill?.id).toBe(2);
  });
  it("arrangement #1 (still 'submitted') is correctly NOT applicable for item 3", () => {
    const r = resolveApplicableArrangements(prodArrangements, { boqProjectId: 1, boqItemId: 3, programmeBarId: null }, allocations);
    expect(r.none).toBe(true);
  });
});

describe("06T-HF §3 — Supplied/Balance UOM comparability", () => {
  it("Cum vs CUM are comparable after normalisation", () => {
    expect(normaliseUom("Cum")).toBe(normaliseUom("CUM"));
  });
  it("aggregation across same-UOM trips gives a single balanceable total", () => {
    const agg = aggregateReceived([
      { quantity: 2000, uom: "Cum" },
      { quantity: 1600, uom: "CUM" },
    ] as any);
    expect(agg.mixedUoms).toBe(false);
    expect(agg.receivedQty).toBe(3600);
  });
  it("mixed UOMs are flagged — Balance must show 'Not comparable', never convert", () => {
    const agg = aggregateReceived([
      { quantity: 2000, uom: "Cum" },
      { quantity: 10500, uom: "CFT" },
    ] as any);
    expect(agg.mixedUoms).toBe(true);
  });
});

describe("06T §1 — chainage-derived length", () => {
  it("2.800–3.050 gives 250 m (DPR #281 rows showed NULL length)", () => {
    expect(calculateLengthFromChainage("2.800", "3.050")).toBe(250);
  });
  it("returns null on incomplete chainage", () => {
    expect(calculateLengthFromChainage("", "3.050")).toBeNull();
    expect(calculateLengthFromChainage("2.800", "")).toBeNull();
  });
});
