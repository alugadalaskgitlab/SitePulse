import { describe, expect, it } from "vitest";
import { personnelNameOptions } from "../client/src/lib/personnelNameOptions";

describe("PLANT-05 personnel dropdown choices", () => {
  it("offers active master staff and preserves only the current saved inactive name", () => {
    const people = [
      { id: 1, name: "Active Operator", isActive: 1 },
      { id: 2, name: "Inactive Former Staff", isActive: 0 },
      { id: 3, name: "Active Operator", isActive: 1 },
    ];
    expect(personnelNameOptions(people, "Saved Former Supervisor"))
      .toEqual(["Active Operator", "Saved Former Supervisor"]);
    expect(personnelNameOptions(people, "Active Operator"))
      .toEqual(["Active Operator"]);
  });
});
