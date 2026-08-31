import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stockOwnerLabel } from "@shared/stockOwnerLabel";

describe("diesel stock owner labels", () => {
  it.each(["DIESEL", " diesel ", "HSD"])(
    "labels no-party %s stock as Plant Common",
    (materialName) => {
      expect(stockOwnerLabel({ partyId: null, materialName })).toBe("Plant Common");
    },
  );

  it("does not relabel another material's no-party bucket", () => {
    expect(stockOwnerLabel({
      partyId: null,
      materialName: "20MM AGGREGATE",
    })).toBe("Unknown");
    expect(stockOwnerLabel({
      partyId: null,
      materialName: "LDO",
    })).toBe("Unknown");
  });

  it("keeps a resolved party name for diesel", () => {
    expect(stockOwnerLabel({
      partyId: 1,
      materialName: "DIESEL",
      resolvedPartyName: "HIGH LANE CONSTRUCTIONS",
    })).toBe("HIGH LANE CONSTRUCTIONS");
  });

  it("keeps an unresolved non-null party id visible", () => {
    expect(stockOwnerLabel({
      partyId: 42,
      materialName: "DIESEL",
      unresolvedPartyPrefix: "Party #",
    })).toBe("Party #42");
  });

  it("returns Plant Common for a no-party receipt on the Diesel Procurement Report", () => {
    expect(stockOwnerLabel({
      partyId: null,
      materialName: "DIESEL",
    })).toBe("Plant Common");
  });

  it("uses the material-aware helper on every affected stock and diesel report view", () => {
    for (const page of [
      "client/src/pages/PlantStock.tsx",
      "client/src/pages/PlantMaterialIssues.tsx",
      "client/src/pages/PlantMaterialReceipts.tsx",
      "client/src/pages/PlantDieselProcurementReport.tsx",
    ]) {
      const source = readFileSync(page, "utf8");
      expect(source).toContain('from "@shared/stockOwnerLabel"');
      expect(source).toContain("materialName:");
    }
  });
});