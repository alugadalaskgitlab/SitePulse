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

export const TANK_STOCK_HEADERS = ["Material", "Party", "Tank 1", "Tank 2", "Barrels", "Not in a tank", "Total"];
export const TANK_STOCK_NOTE = "Book stock by tank. Decant moves barrels into a tank.";
export type TankStockPosition = TankAssignmentPosition & {
  tank1Mt?: unknown; tank2Mt?: unknown; packedMt?: unknown; totalMt?: unknown;
  tank1L?: unknown; tank2L?: unknown; packedL?: unknown; totalL?: unknown;
};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function visibleTankStockRows<T extends TankStockPosition>(rows: T[], showAll: boolean): T[] {
  return showAll ? rows : rows.filter(row =>
    ![row.tank1, row.tank2, row.packed, row.packedCount, row.unassigned, row.total].every(value => finite(value) && value === 0));
}
export function tankStockCells(row: TankStockPosition): string[] {
  const native = String(row.stockUom || "");
  const mass = /bitumen|emulsion/i.test(row.materialName) || /^(MT|TONNES?|TONS?|KGS?|KILOGRAMS?)$/i.test(native);
  const unit = /^ldo$/i.test(row.materialName.trim()) ? "L" : mass ? "MT" : /^(L|LITERS?|LITRES?)$/i.test(native) ? "L" : native;
  const factor = unit === "MT" ? tankAssignmentDisplay({ ...row, stockUom: native }).factor :
    unit === "L" ? row.litersPerStockUnit ?? (/^(L|LITERS?|LITRES?)$/i.test(native) ? 1 : null) : 1;
  const text = (value: number) => `${value.toLocaleString("en-IN", { minimumFractionDigits: unit === "MT" ? 3 : 0, maximumFractionDigits: 3 })} ${unit}`;
  const cell = (key: "tank1" | "tank2" | "packed" | "unassigned" | "total") => {
    const converted = key === "unassigned" ? undefined : `${key}${unit === "MT" ? "Mt" : unit === "L" ? "L" : ""}`;
    if (converted && converted !== key && converted in row) {
      const value = (row as any)[converted];
      return finite(value) ? text(value) : "—";
    }
    const raw = row[key];
    return finite(raw) && finite(factor) ? text(raw * factor) : "—";
  };
  const packed = cell("packed");
  return [row.materialName, row.partyName, cell("tank1"), cell("tank2"),
    finite(row.packedCount) && packed !== "—" ? `${row.packedCount.toLocaleString("en-IN", { maximumFractionDigits: 3 })} (${packed})` : "—",
    cell("unassigned"), cell("total")];
}
export function tankStockExportRows(rows: TankStockPosition[]) {
  return rows.map(row => {
    const cells = tankStockCells(row);
    return Object.fromEntries(TANK_STOCK_HEADERS.map((key, index) => [key, cells[index]]));
  });
}
export function tankStockPrintTable(rows: TankStockPosition[]) {
  if (!rows.length) return "";
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<p>${TANK_STOCK_NOTE}</p><table><thead><tr>${TANK_STOCK_HEADERS.map(value => `<th>${value}</th>`).join("")}</tr></thead><tbody>${
    rows.map(row => `<tr>${tankStockCells(row).map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
}
