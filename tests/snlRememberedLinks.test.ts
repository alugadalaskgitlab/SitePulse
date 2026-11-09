import { describe, expect, it } from "vitest";
import {
  matchRememberedSnlLinks,
  normalizeRememberedBoqWording,
  type RememberedSnlLink,
} from "../server/snlRememberedLinks";

describe("remembered MoRTH link wording", () => {
  it("normalizes chainage, quantities, BOQ item numbers and extra spaces", () => {
    const first = normalizeRememberedBoqWording(
      "Sl. No. 17  Chainage 0/0 to 2/900  WMM laying, BOQ Qty: 1,200 cum",
    );
    const next = normalizeRememberedBoqWording(
      "Item No. 44   Ch 1.9–3.2   WMM   laying   900 cum",
    );
    expect(first).toBe("wet mix macadam laying");
    expect(next).toBe(first);
  });

  it("reuses the exact remembered sub-item and keeps conflicting targets as choices", () => {
    const base: RememberedSnlLink = {
      id: 1,
      normalizedBoqWording: "wet mix macadam",
      displayBoqWording: "WMM, Chainage 0/0 to 2/900",
      snlItemId: 120,
      itemCode: "4.12",
      itemTitle: "Wet Mix Macadam",
      unit: "CUM",
      confirmedBy: "Owner",
      confirmedAt: new Date("2026-11-09T10:00:00Z"),
      createdAt: new Date("2026-11-09T10:00:00Z"),
    };
    expect(matchRememberedSnlLinks("WMM, Ch 1.9–3.2", [base]).map(row => row.itemCode)).toEqual(["4.12"]);
    expect(matchRememberedSnlLinks("WMM, Ch 1.9–3.2", [
      base,
      { ...base, id: 2, itemCode: "4.14", snlItemId: 121 },
    ]).map(row => row.itemCode)).toEqual(["4.12", "4.14"]);

    const gradingII = {
      ...base,
      id: 3,
      normalizedBoqWording: "dense graded bituminous macadam",
      displayBoqWording: "DGBM Grading II, Sl. No. 8",
      snlItemId: 122,
      itemCode: "5.6-ii",
      itemTitle: "Dense Graded Bituminous Macadam, Grading II",
    };
    expect(matchRememberedSnlLinks("Item No. 34 Ch 1.9–3.2 DGBM", [gradingII]).map(row => row.itemCode))
      .toEqual(["5.6-ii"]);
  });
});
