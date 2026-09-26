import { describe, it, expect } from "vitest";
import { lookupTripBoqQuantity, formatTripQuantity } from "../shared/tripQuantityDisplay";

const trip = { quantity: 800, uom: "CFT", boqItemId: 12, material: "Soil" };
const recipes = [{ boqItemId: 12, materialName: "Soil", uom: "Cum", qtyPerBoqUnit: 999 }];
const materials = [{ name: "Soil", bulkDensity: 1.6 }];
describe("MAT-03 BOQ quantity display", () => {
  it("uses exact recipe target and existing volume constant, not recipe arithmetic", () => {
    const boqQuantity = lookupTripBoqQuantity(trip, recipes, materials);
    expect(boqQuantity?.quantity).toBeCloseTo(800 / 35.3147, 10);
    expect(formatTripQuantity({ ...trip, boqQuantity })).toBe("800 CFT (≈22.653 Cum, BOQ unit)");
  });
  it("uses density for mass target", () => {
    expect(lookupTripBoqQuantity(trip, [{ ...recipes[0], uom: "MT" }], materials)?.quantity).toBeCloseTo(800 / 35.3147 * 1.6);
  });
  it("does not guess links, material names, density, or ambiguous recipes", () => {
    expect(lookupTripBoqQuantity({ ...trip, boqItemId: null }, recipes, materials)).toBeNull();
    expect(lookupTripBoqQuantity(trip, recipes, [{ name: "Soil", bulkDensity: null }])).toBeNull();
    expect(lookupTripBoqQuantity(trip, [{ ...recipes[0], materialName: "soil" }], materials)).toBeNull();
    expect(lookupTripBoqQuantity(trip, [...recipes, ...recipes], materials)).toBeNull();
    expect(lookupTripBoqQuantity({ ...trip, uom: "Trips" }, [{ ...recipes[0], uom: "Bags" }], materials)).toBeNull();
    expect(formatTripQuantity(trip)).toBe("800 CFT");
  });
});