import { describe, expect, it } from "vitest";
import { tripListDefaultsFromSearch } from "./tripListDefaults";

describe("material trip list URL defaults", () => {
  it("opens the requested date range with unresolved roles selected", () => {
    expect(tripListDefaultsFromSearch(
      "?hireDate=2026-08-14&hireRole=unresolved",
      "2026-10-26",
    )).toEqual({
      hireDate: "2026-08-14",
      roleFilter: "unresolved",
    });
  });

  it("keeps normal visits on today with all roles selected", () => {
    expect(tripListDefaultsFromSearch("", "2026-10-26")).toEqual({
      hireDate: "2026-10-26",
      roleFilter: "all",
    });
  });

  it("ignores invalid dates and unsupported role filters", () => {
    expect(tripListDefaultsFromSearch(
      "?hireDate=14-08-2026&hireRole=unknown",
      "2026-10-26",
    )).toEqual({
      hireDate: "2026-10-26",
      roleFilter: "all",
    });
  });
});
