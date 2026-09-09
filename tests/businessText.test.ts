import { describe, expect, it } from "vitest";
import {
  normalizeBoqProjectBusinessText,
  uppercaseBusinessText,
  uppercaseOptionalBusinessText,
} from "../shared/businessText";

describe("uppercase business-text policy", () => {
  it("uppercases and collapses whitespace in approved display labels", () => {
    expect(uppercaseBusinessText("  Takkadpally-\nsirur  ")).toBe("TAKKADPALLY- SIRUR");
  });

  it("normalizes only the allowlisted BOQ project fields", () => {
    expect(normalizeBoqProjectBusinessText({
      name: "alipur-kothur hlb",
      client: "NHAI piu Hyderabad",
      contractor: "Abc Constructions",
      contractNo: "Case-Sensitive/Ref-a",
      notes: "Preserve Narrative Case",
    })).toEqual({
      name: "ALIPUR-KOTHUR HLB",
      client: "NHAI PIU HYDERABAD",
      contractor: "ABC CONSTRUCTIONS",
      contractNo: "Case-Sensitive/Ref-a",
      notes: "Preserve Narrative Case",
    });
  });

  it("preserves null and undefined optional values", () => {
    expect(uppercaseOptionalBusinessText(null)).toBeNull();
    expect(uppercaseOptionalBusinessText(undefined)).toBeUndefined();
  });
});