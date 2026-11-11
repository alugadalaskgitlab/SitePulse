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

  it("C leaves a transporter unchanged when its identity has no matching card", () => {
    expect(selectAutoMaterialRateConversion(
      { sourceType: "site_material_trip", category: "transport", unit: "TRIP" },
      { ...group, category: "transport", unit: "TRIP" },
      [card({ category: "transport" })],
      "MATERIALS SUPPLIER",
    )).toEqual({ status: "no_match" });
  });
});

describe("VB25 role-independent, unit-safe pull conversion", () => {
  const regularMaterialItem = {
    sourceType: "site_material_trip",
    category: "material",
    unit: "CFT",
  };
  const soilGroup: RateSelectionGroup = {
    equipmentId: null,
    groupName: "SOIL",
    entryType: "CFT",
    category: "material",
    unit: "CFT",
  };

  it("D converts a regular vendor's 600 CFT row to exactly 1 TRIP at the configured rate", () => {
    const result = selectAutoMaterialRateConversion(
      regularMaterialItem,
      soilGroup,
      [card({ vendorName: "REGULAR VENDOR", itemKey: "MAT_SOIL_TRIP", unit: "TRIP", rate: 800 })],
      "REGULAR VENDOR",
    );

    expect(result).toMatchObject({
      status: "converted",
      targetUnit: "TRIP",
      quantity: 1,
      rate: 800,
    });
    expect(result.status === "converted" ? 600 * result.rate : 0).toBe(480_000);
    expect(result.status === "converted" ? result.quantity * result.rate : 0).toBe(800);
  });

  it("E handles a legacy-key-only mismatched card by explicit unit conversion, never 600 CFT times a TRIP rate", () => {
    expect(selectAutoMaterialRateConversion(
      regularMaterialItem,
      soilGroup,
      [card({ vendorName: "REGULAR VENDOR", itemKey: "MAT_SOIL", unit: "TRIP", rate: 800 })],
      "REGULAR VENDOR",
    )).toMatchObject({
      status: "converted",
      targetUnit: "TRIP",
      quantity: 1,
      rate: 800,
    });
  });

  it("E refuses a unitless legacy card instead of guessing its billing unit", () => {
    expect(selectAutoMaterialRateConversion(
      regularMaterialItem,
      soilGroup,
      [card({ vendorName: "REGULAR VENDOR", itemKey: "MAT_SOIL", unit: "", rate: 800 })],
      "REGULAR VENDOR",
    )).toEqual({ status: "no_match" });
  });

  it("F preserves the VB22 material-source conversion result", () => {
    expect(selectAutoMaterialRateConversion(materialItem, group, [card()], "MATERIALS SUPPLIER")).toMatchObject({
      status: "converted",
      targetUnit: "TRIP",
      quantity: 1,
      rate: 800,
    });
  });

  it("generalizes the same exact unit-aware conversion to another eligible category", () => {
    expect(selectAutoMaterialRateConversion(
      { sourceType: "site_material_trip", category: "transport", unit: "CFT" },
      { ...soilGroup, groupName: "TIPPER", category: "transport" },
      [card({
        vendorName: "TRANSPORTER",
        category: "transport",
        itemKey: "EQ_TIPPER_TRIP",
        unit: "TRIP",
        rate: 1200,
      })],
      "TRANSPORTER",
    )).toMatchObject({
      status: "converted",
      targetUnit: "TRIP",
      quantity: 1,
      rate: 1200,
    });
  });

  it("does not guess that 600 CFT is 1 MT for a regular vendor", () => {
    expect(selectAutoMaterialRateConversion(
      regularMaterialItem,
      soilGroup,
      [card({ vendorName: "REGULAR VENDOR", itemKey: "MAT_SOIL_MT", unit: "MT", rate: 500 })],
      "REGULAR VENDOR",
    )).toMatchObject({
      status: "manual_conversion_required",
      targetUnit: "MT",
    });
  });

  it("does not guess that equipment hours equal one day", () => {
    expect(selectAutoMaterialRateConversion(
      { sourceType: "equipment_usage", category: "equipment", unit: "HRS" },
      {
        equipmentId: 12,
        groupName: "EXCAVATOR",
        entryType: "HOURLY HIRE",
        category: "equipment",
        unit: "HRS",
      },
      [card({
        vendorName: "EQUIPMENT VENDOR",
        category: "equipment",
        itemKey: "EQ_EXCAVATOR_DAYS",
        unit: "DAYS",
        rate: 5000,
      })],
      "EQUIPMENT VENDOR",
    )).toMatchObject({
      status: "manual_conversion_required",
      targetUnit: "DAYS",
    });
  });

  it("prefers one exact same-unit card over an alternate-unit card", () => {
    expect(selectAutoMaterialRateConversion(
      regularMaterialItem,
      soilGroup,
      [
        card({ vendorName: "REGULAR VENDOR", itemKey: "MAT_SOIL_CFT", unit: "CFT", rate: 12 }),
        card({ vendorName: "REGULAR VENDOR", itemKey: "MAT_SOIL_TRIP", unit: "TRIP", rate: 800 }),
      ],
      "REGULAR VENDOR",
    )).toMatchObject({
      status: "same_unit",
      rate: 12,
    });
  });
});