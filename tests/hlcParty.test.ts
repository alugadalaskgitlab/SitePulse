import { describe, expect, it } from "vitest";
import { resolveHlcParty } from "../shared/hlcParty";

describe("resolveHlcParty", () => {
  it("prefers a case-insensitive exact HLC party name", () => {
    expect(resolveHlcParty([
      { id: 10, name: "High Lane Constructions Private Limited" },
      { id: 11, name: " hlc " },
    ])?.id).toBe(11);
  });

  it("uses the unique HIGH LANE match only when exact HLC is absent", () => {
    expect(resolveHlcParty([{ id: 3, name: "High Lane Construction" }])?.id).toBe(3);
    expect(resolveHlcParty([
      { id: 3, name: "High Lane Construction" },
      { id: 4, name: "Other Vendor" },
    ])?.id).toBe(3);
  });

  it("returns no party rather than choosing an ambiguous or unrelated record", () => {
    expect(resolveHlcParty([{ id: 1, name: "Other Vendor" }])).toBeNull();
    expect(resolveHlcParty([
      { id: 2, name: "High Lane Construction" },
      { id: 3, name: "High Lane Logistics" },
    ])).toBeNull();
    expect(resolveHlcParty([
      { id: 4, name: "HLC" },
      { id: 5, name: "HLC" },
    ])).toBeNull();
  });
});
