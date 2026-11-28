import { roundStockQuantity } from "./stockUnits";

export type TankAssignmentFigures = { tank1: number; tank2: number; unassigned: number; total: number };
export type TankAssignmentPosition = TankAssignmentFigures & {
  materialId: number; materialName: string; partyId: number | null; partyName: string; stockUom: string;
  packed?: number; packedCount?: number; mtPerStockUnit?: number | null; litersPerStockUnit?: number | null;
};
export type TankAssignmentInput = {
  date: string; materialId: number; partyId: number | null; tankNumber: 1 | 2; amount: number; uom: string;
} | {
  date: string; materialId: number; partyId: number | null; uom: string;
  actualTank1: number; actualTank2: number;
  preview: TankAssignmentFigures & { packed: number; packedCount: number };
};

export function tankAssignmentDisplay(row: TankAssignmentPosition) {
  const ldo = /^ldo$/i.test(row.materialName.trim());
  const native = row.stockUom.toUpperCase();
  const factor = ldo ? row.litersPerStockUnit ?? (/^(L|LITER|LITERS|LITRE|LITRES)$/.test(native) ? 1 : null) :
    row.mtPerStockUnit ?? (/^(MT|TONNE|TONNES|TON|TONS)$/.test(native) ? 1 : /^(KG|KGS|KILOGRAMS?)$/.test(native) ? 0.001 : null);
  return { unit: ldo ? "L" : "MT", factor: factor != null && factor > 0 && Number.isFinite(factor) ? factor : null };
}

export function tankAssignmentPreview(row: TankAssignmentFigures, tank: 1 | 2): TankAssignmentFigures {
  return {
    tank1: roundStockQuantity(row.tank1 + (tank === 1 ? row.unassigned : 0)),
    tank2: roundStockQuantity(row.tank2 + (tank === 2 ? row.unassigned : 0)),
    unassigned: 0,
    total: row.total,
  };
}
