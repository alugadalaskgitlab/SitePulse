import { describe, expect, it } from "vitest";
import { tripListDefaultsFromSearch } from "./tripListDefaults";

describe("material trip list URL defaults", () => {
  it("opens the requested date range, transporter, and unresolved roles", () => {
    expect(tripListDefaultsFromSearch(
      "?dateFrom=2026-09-16&dateTo=2026-09-19&hireSupplier=G%20SANGANNA&hireRole=unresolved",
      "2026-10-26",
    )).toEqual({
      hireDate: "2026-10-26",
      dateFrom: "2026-09-16",
      dateTo: "2026-09-19",
      supplierFilter: "G SANGANNA",
      roleFilter: "unresolved",
    });
  });

  it("keeps normal visits on today with all roles selected", () => {
    expect(tripListDefaultsFromSearch("", "2026-10-26")).toEqual({
      hireDate: "2026-10-26",
      dateFrom: "2026-10-26",
      dateTo: "2026-10-26",
      supplierFilter: "",
      roleFilter: "all",
    });
  });

  it("ignores invalid dates and unsupported role filters", () => {
    expect(tripListDefaultsFromSearch(
      "?hireDate=14-08-2026&hireRole=unknown",
      "2026-10-26",
    )).toEqual({
      hireDate: "2026-10-26",
      dateFrom: "2026-10-26",
      dateTo: "2026-10-26",
      supplierFilter: "",
      roleFilter: "all",
    });
  });
});
