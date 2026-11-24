import { convertStockQuantity } from "./stockUnits";

export function tankPositionBalance(input: {
  entries: Array<{
    quantityIn: number | string | null;
    quantityOut: number | string | null;
    uom: string | null;
    stockPosition?: string | null;
    tankNumber?: number | null;
  }>;
  tankNumber: 1 | 2;
  stockUom: string;
  bulkDensity?: number | null;
}): number {
  const targetPosition = input.tankNumber === 1 ? "tank_1" : "tank_2";
  return input.entries.reduce((total, entry) => {
    const position = entry.stockPosition
      ?? (entry.tankNumber === 1 ? "tank_1" : entry.tankNumber === 2 ? "tank_2" : null);
    if (position !== targetPosition) return total;
    return total
      + convertStockQuantity(Number(entry.quantityIn ?? 0), entry.uom ?? input.stockUom, input.stockUom, input.bulkDensity ?? null)
      - convertStockQuantity(Number(entry.quantityOut ?? 0), entry.uom ?? input.stockUom, input.stockUom, input.bulkDensity ?? null);
  }, 0);
}

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

export function formatPackedUnitLabel(unitName: string | null | undefined, count: number): string {
  const unit = (unitName || "packed unit").trim().toLocaleLowerCase();
  if (count === 1) return unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return unit.endsWith("s") ? unit : `${unit}s`;
}
