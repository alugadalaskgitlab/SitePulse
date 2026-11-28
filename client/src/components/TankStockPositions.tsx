import { TankAssignmentButton } from "@/components/TankAssignmentButton";
import { TANK_STOCK_HEADERS, TANK_STOCK_NOTE, tankStockCells, visibleTankStockRows, type TankStockPosition } from "@shared/tankAssignment";

export function TankStockPositions({ rows, owner, showAll, onShowAllChange }: {
  rows: TankStockPosition[]; owner: boolean; showAll: boolean; onShowAllChange: (value: boolean) => void;
}) {
  const visible = visibleTankStockRows(rows, showAll);
  return <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">{TANK_STOCK_NOTE}</p>
      <label className="flex items-center gap-2 print:hidden"><input type="checkbox" checked={showAll} onChange={event => onShowAllChange(event.target.checked)} />Show all</label>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="tank-stock-positions">
      <thead><tr className="border-b text-left">{TANK_STOCK_HEADERS.map((header, index) =>
        <th key={header} className={`py-2 pr-3 ${index > 1 ? "text-right" : ""}`}>{header}</th>)}
        {owner && <th className="py-2 pl-3 text-right print:hidden">Owner action</th>}
      </tr></thead>
      <tbody>{visible.map(row => <tr key={`${row.materialId}:${row.partyId ?? "common"}`} className="border-b last:border-0">
        {tankStockCells(row).map((value, index) => <td key={index} className={`py-2 pr-3 ${index > 1 ? "text-right" : ""} ${index === 6 ? "font-semibold" : ""}`}>{value}</td>)}
        {owner && <td className="py-2 pl-3 text-right print:hidden"><TankAssignmentButton row={row} /></td>}
      </tr>)}
      {!visible.length && <tr><td colSpan={owner ? 8 : 7} className="py-3 text-muted-foreground">No non-zero stock positions.</td></tr>}
      </tbody>
    </table></div>
  </>;
}
