import { describe, expect, it } from "vitest";
import { directGranularMasterHint, isClearanceOrScarifyingSoilRecipe } from "../shared/materialUseEligibility";

describe("WORKVALUE-02 material identity safeguards", () => {
  it("excludes only Soil recipes for clearing and scarifying work", () => {
    expect(isClearanceOrScarifyingSoilRecipe({ description: "Clearing and grubbing road land" }, "Soil / Earth")).toBe(true);
    expect(isClearanceOrScarifyingSoilRecipe({ description: "Scarifying the granular surface" }, "Soil")).toBe(true);
    expect(isClearanceOrScarifyingSoilRecipe({ description: "Construction of earthen shoulders" }, "Soil")).toBe(false);
    expect(isClearanceOrScarifyingSoilRecipe({ description: "Clearing and grubbing road land" }, "Bitumen")).toBe(false);
  });

  it("uses the item's specific granular master instead of the generic name", () => {
    expect(directGranularMasterHint({ description: "Wet Mix Macadam, 250 mm thick" })).toBe("WMM");
    expect(directGranularMasterHint({ itemName: "GSB layer", description: "Granular sub-base" })).toBe("GSB");
    expect(directGranularMasterHint({ description: "Granular material from quarry" })).toBeNull();
  });
});
