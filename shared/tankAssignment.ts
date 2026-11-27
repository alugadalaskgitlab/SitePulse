import { roundStockQuantity } from "./stockUnits";

export type TankAssignmentFigures = { tank1: number; tank2: number; unassigned: number; total: number };
export type TankAssignmentPosition = TankAssignmentFigures & {
  materialId: number; materialName: string; partyId: number | null; partyName: string; stockUom: string;
};
export type TankAssignmentInput = {
  date: string; materialId: number; partyId: number | null; tankNumber: 1 | 2; amount: number; uom: string;
};

export function tankAssignmentPreview(row: TankAssignmentFigures, tank: 1 | 2): TankAssignmentFigures {
  return {
    tank1: roundStockQuantity(row.tank1 + (tank === 1 ? row.unassigned : 0)),
    tank2: roundStockQuantity(row.tank2 + (tank === 2 ? row.unassigned : 0)),
    unassigned: 0,
    total: row.total,
  };
}
