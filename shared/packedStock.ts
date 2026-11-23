import { convertStockQuantity } from "./stockUnits";

export function packedReceiptStockQuantity(input: {
  count: number;
  actualNetWeightKg?: number | null;
  unitNetWeightKg?: number | null;
  unitVolumeLiters?: number | null;
  stockUom: string;
  bulkDensity?: number | null;
}): number {
  if (!Number.isFinite(input.count) || input.count <= 0) {
    throw new Error("Enter a packed-unit count greater than zero.");
  }
  const actualKg = input.actualNetWeightKg == null ? null : Number(input.actualNetWeightKg);
  if (actualKg != null) {
    if (!Number.isFinite(actualKg) || actualKg <= 0) throw new Error("Actual net weight must be greater than zero.");
    return convertStockQuantity(actualKg, "kg", input.stockUom, input.bulkDensity);
  }
  if (input.unitNetWeightKg != null && Number(input.unitNetWeightKg) > 0) {
    return convertStockQuantity(input.count * Number(input.unitNetWeightKg), "kg", input.stockUom, input.bulkDensity);
  }
  if (input.unitVolumeLiters != null && Number(input.unitVolumeLiters) > 0) {
    return convertStockQuantity(input.count * Number(input.unitVolumeLiters), "Liters", input.stockUom, input.bulkDensity);
  }
  throw new Error("Set the packed-unit net weight or volume in Material Master before recording this receipt.");
}
