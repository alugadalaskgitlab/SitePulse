import { classifyWorkType } from "./workTypeRecipes";

export type CutFillOutcomeRow = {
  entryKey: string; boqItemId: number | null; quantity: number | null;
  materialOutcome?: string | null; reusableQty?: number | null;
};

export function isRoadwayExcavationRow(row: CutFillOutcomeRow, boqItems: any[]): boolean {
  const item = boqItems.find(candidate => Number(candidate.id) === Number(row.boqItemId));
  return !!item
    && classifyWorkType(String(item.description ?? item.itemName ?? ""), String(item.unit ?? "")) === "roadway_excavation";
}

export function withCutFillReadinessContext<T extends CutFillOutcomeRow>(rows: T[], boqItems: any[]) {
  return rows.map(row => {
    const item = boqItems.find(candidate => Number(candidate.id) === Number(row.boqItemId));
    return {
      ...row,
      isRoadwayExcavation: isRoadwayExcavationRow(row, boqItems),
      uom: item?.unit ?? (row as any).uom ?? null,
    };
  });
}