// INSTRUCTION 06T — Guided DPR integrity & context chain.
// Focused seam tests: tolerant material suggestion matching (§4), suggestion
// tier gating with hints, and chainage-derived length reconciliation (§1).
import { describe, it, expect } from "vitest";
import {
  materialsLooselyMatch,
  classifyReceiptMatch,
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

describe("06T §1 — chainage-derived length", () => {
  it("2.800–3.050 gives 250 m (DPR #281 rows showed NULL length)", () => {
    expect(calculateLengthFromChainage("2.800", "3.050")).toBe(250);
  });
  it("returns null on incomplete chainage", () => {
    expect(calculateLengthFromChainage("", "3.050")).toBeNull();
    expect(calculateLengthFromChainage("2.800", "")).toBeNull();
  });
});
