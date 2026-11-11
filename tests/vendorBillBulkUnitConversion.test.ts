import { describe, expect, it } from "vitest";
import {
  defaultConvertedQuantity,
  isDifferentBillingUnit,
  matchingRateCardsForGroup,
  normalizeRateCardPart,
  type VendorRateCardRecord,
} from "../client/src/lib/vendorBillRateSelection";

const soilGroup = {
  equipmentId: null,
  groupName: "SOIL",
  entryType: "CFT",
  category: "material",
  unit: "CFT",
};

const card = (overrides: Partial<VendorRateCardRecord>): VendorRateCardRecord => ({
  vendorName: "FASIUDDIN",
  category: "material",
  itemKey: "MAT_SOIL_CFT",
  unit: "CFT",
  rate: 800,
  ...overrides,
});

describe("vendor bill bulk billing-unit conversion", () => {
  it("prioritizes the exact modern identity over a legacy key", () => {
    const matches = matchingRateCardsForGroup(soilGroup, "CFT", [
      card({ itemKey: "MAT_SOIL", rate: 700, updatedAt: "2099-01-01" }),
      card({ itemKey: "MAT_SOIL_CFT", rate: 800, updatedAt: "2020-01-01" }),
    ], "FASIUDDIN");

    expect(matches[0]?.itemKey).toBe("MAT_SOIL_CFT");
    expect(matches[0]?.rate).toBe(800);
  });

  it("uses a blank-unit legacy card only for current-unit prefill", () => {
    const blank = card({ itemKey: "MAT_SOIL", unit: "", rate: 650 });
    expect(matchingRateCardsForGroup(soilGroup, "CFT", [blank], "FASIUDDIN")).toEqual([]);
    expect(matchingRateCardsForGroup(soilGroup, "CFT", [blank], "FASIUDDIN", { allowBlankUnitFallback: true })[0]?.rate).toBe(650);
    // A blank unit cannot become an alternate-unit choice.
    expect(matchingRateCardsForGroup(soilGroup, "TRIP", [blank], "FASIUDDIN")).toEqual([]);
    expect(matchingRateCardsForGroup(soilGroup, "TRIP", [blank], "FASIUDDIN", { allowBlankUnitFallback: true })).toEqual([]);
  });

  it("isolates category, material, and vendor/alias collisions", () => {
    const exact = card({ rate: 800 });
    const matches = matchingRateCardsForGroup(soilGroup, "CFT", [
      exact,
      card({ category: "transport", rate: 900 }),
      card({ itemKey: "MAT_SOIL_MIX_CFT", rate: 901 }),
      card({ vendorName: "UNRELATED VENDOR", rate: 902 }),
      card({ vendorName: "FASIUDDIN ALIAS", rate: 903 }),
    ], "FASIUDDIN");

    expect(matches).toHaveLength(1);
    expect(matches[0]?.rate).toBe(800);
    expect(matchingRateCardsForGroup(soilGroup, "CFT", [
      card({ vendorName: "UNRELATED VENDOR", rate: 902 }),
      card({ vendorName: "FASIUDDIN ALIAS", rate: 903 }),
    ], "FASIUDDIN")).toEqual([]);
    expect(matchingRateCardsForGroup(soilGroup, "CFT", [
      card({ vendorName: "FASIUDDIN ALIAS", rate: 903 }),
    ], "FASIUDDIN", { allowVendorAliases: true })[0]?.rate).toBe(903);
  });

  it("normalizes same-unit comparisons without treating case as conversion", () => {
    expect(normalizeRateCardPart(" cFt ")).toBe("CFT");
    expect(isDifferentBillingUnit("cft", "CFT")).toBe(false);
    expect(isDifferentBillingUnit("cft", "TRIP")).toBe(true);
  });

  it("finds both exact CFT and TRIP candidates for one material", () => {
    const matches = matchingRateCardsForGroup(soilGroup, "TRIP", [
      card({ itemKey: "MAT_SOIL_CFT", unit: "CFT", rate: 600 }),
      card({ itemKey: "MAT_SOIL_TRIP", unit: "TRIP", rate: 800 }),
    ], "FASIUDDIN");

    expect(matches).toHaveLength(1);
    expect(matches[0]?.itemKey).toBe("MAT_SOIL_TRIP");
    expect(defaultConvertedQuantity("TRIP")).toBe(1);
    expect(defaultConvertedQuantity("CUM")).toBe(1);
  });

  it("preserves the historical slash-to-underscore equipment key", () => {
    const equipmentGroup = {
      equipmentId: 42,
      groupName: "TIPPER",
      entryType: "TIME/METER",
      category: "equipment",
      unit: "HRS",
    };
    const matches = matchingRateCardsForGroup(equipmentGroup, "HRS", [{
      vendorName: "FASIUDDIN",
      category: "equipment",
      itemKey: "42_TIME_METER",
      unit: "HRS",
      rate: 1200,
    }], "FASIUDDIN");
    expect(matches[0]?.rate).toBe(1200);
  });
});