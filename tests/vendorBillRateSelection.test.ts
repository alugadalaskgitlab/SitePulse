import { describe, expect, it } from "vitest";
import {
  selectAutoMaterialRateConversion,
  SITE_MATERIAL_TRIP_MATERIAL_SOURCE,
  vendorBillAutoSourceIdentity,
  type RateSelectionGroup,
  type VendorRateCardRecord,
} from "../client/src/lib/vendorBillRateSelection";

const group: RateSelectionGroup = {
  equipmentId: null,
  groupName: "STONE DUST",
  entryType: "CFT",
  category: "material",
  unit: "CFT",
};

const materialItem = {
  sourceType: SITE_MATERIAL_TRIP_MATERIAL_SOURCE,
  category: "material",
  unit: "CFT",
};

const card = (patch: Partial<VendorRateCardRecord> = {}): VendorRateCardRecord => ({
  vendorName: "MATERIALS SUPPLIER",
  category: "material",
  itemKey: "MAT_STONE_DUST_TRIP",
  unit: "TRIP",
  rate: 800,
  ...patch,
});

describe("VB22 material-source pull conversion", () => {
  it("B converts an exactly matched alternate-unit card to one billing unit", () => {
    expect(selectAutoMaterialRateConversion(materialItem, group, [card()], "MATERIALS SUPPLIER")).toMatchObject({
      status: "converted",
      targetUnit: "TRIP",
      quantity: 1,
      rate: 800,
    });
  });

  it("E leaves logged quantity and unit unchanged when no exact card matches", () => {
    expect(selectAutoMaterialRateConversion(materialItem, group, [
      card({ vendorName: "OTHER SUPPLIER" }),
      card({ category: "transport" }),
      card({ itemKey: "MAT_SAND_TRIP" }),
    ], "MATERIALS SUPPLIER")).toEqual({ status: "no_match" });
  });

  it("D explicitly reports ambiguity instead of choosing a sorted card", () => {
    expect(selectAutoMaterialRateConversion(materialItem, group, [
      card({ rate: 800, updatedAt: "2026-01-01" }),
      card({ rate: 900, updatedAt: "2026-02-01" }),
    ], "MATERIALS SUPPLIER")).toEqual({ status: "ambiguous" });
  });

  it("C keeps same-trip material and transporter identities independent", () => {
    expect(vendorBillAutoSourceIdentity(SITE_MATERIAL_TRIP_MATERIAL_SOURCE, 42))
      .toBe("auto:site_material_trip_material:42");
    expect(vendorBillAutoSourceIdentity("site_material_trip", 42)).toBe("auto:42");
  });

  it("C does not change old transporter rate behavior", () => {
    expect(selectAutoMaterialRateConversion(
      { sourceType: "site_material_trip", category: "transport", unit: "TRIP" },
      { ...group, category: "transport", unit: "TRIP" },
      [card({ category: "transport" })],
      "MATERIALS SUPPLIER",
    )).toEqual({ status: "not_applicable" });
  });
});