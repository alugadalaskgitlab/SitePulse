import { useMemo, useState, Fragment } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { fmtQty, getShortName, monthLabel, type BomInputBar, type BomInputItem } from "@shared/planningEngine";
import { canonicalizeUnit } from "@shared/boqNormalise";
import { boqItemDisplayName } from "@/lib/itemName";
import {
  buildBalanceWorkByReach,
  type WorkValueBalanceRow,
} from "@/lib/bomReachBalance";

type MaterialDemandRow = { materialName: string; uom: string; totalQty: number };
type ShortageStockRow = {
  materialName: string;
  uom: string;
  totalDemand: number;
  hlcRecordedStock: number;
  materialMappingUnresolved: boolean;
  conversionBasis?: string | null;
};

type Props = {
  items: BomInputItem[];
  bars: BomInputBar[];
  workRows: WorkValueBalanceRow[];
  workValueItems?: BomInputItem[];
  totalMonths: number;
  projectStartDate: string | null;
  currentMonth: number;
  endMonth?: number;
  demandMaterials: MaterialDemandRow[];
  stockRows: ShortageStockRow[];
  stockLoading?: boolean;
  arrangements?: any[];
};

const numberText = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : fmtQty(value, digits);
const unitText = (unit: string | null | undefined) => {
  if (!unit) return "—";
  const canonical = canonicalizeUnit(unit).toUpperCase();
  if (["CUM", "M3", "CBM"].includes(canonical)) return "cum";
  if (["CFT", "CUFT"].includes(canonical)) return "loose CFT";
  if (["MT", "T", "TON", "TONS", "TONNE", "TONNES"].includes(canonical)) return "MT";
  if (["L", "LITRE", "LITER", "LITRES", "LITERS"].includes(canonical)) return "L";
  return unit;
};

export function BalanceWorkMaterialsByReach({
  items,
  bars,
  workRows,
  workValueItems,
  totalMonths,
  projectStartDate,
  currentMonth,
  endMonth,
  demandMaterials,
  stockRows,
  stockLoading = false,
  arrangements = [],
}: Props) {
  const [expandedMonthRows, setExpandedMonthRows] = useState<Set<string>>(() => new Set());
  const sourceItems = workValueItems?.length ? workValueItems : items;
  const result = useMemo(() => buildBalanceWorkByReach({
    items: sourceItems,
    bars,
    workRows,
    totalMonths,
    projectStartDate,
    currentMonth,
    endMonth,
    demandMaterials,
    stockRows,
    arrangements,
  }), [sourceItems, bars, workRows, totalMonths, projectStartDate, currentMonth, endMonth, demandMaterials, stockRows, arrangements]);
  const labelById = useMemo(
    () => new Map(sourceItems.map(item => [Number(item.id), boqItemDisplayName(item)])),
    [sourceItems],
  );

  return (
    <section className="mb-4 rounded-xl border bg-white overflow-hidden" data-testid="balance-work-materials-by-reach">
      <div className="px-3 py-2 border-b bg-slate-50">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Package className="h-4 w-4 text-teal-600" />
          Balance work — materials by reach
        </h3>
        <p className="mt-1 text-xs text-slate-500">Balance quantities come from Work value; materials use the BOM recipes.</p>
      </div>

      {result.groups.length === 0 ? (
        <p className="px-3 py-5 text-center text-sm text-muted-foreground">No balance work remains in the working reaches.</p>
      ) : (
        <div className="space-y-4 p-3">
          {result.groups.map(group => (
            <div key={group.key} className="overflow-hidden rounded-lg border" data-testid={`balance-reach-${group.key}`}>
              <div className="border-b bg-teal-50/60 px-3 py-2">
                <h4 className="text-sm font-semibold text-teal-900">{group.label}</h4>
              </div>

              <div className="grid gap-4 p-3 lg:grid-cols-2">
                <div>
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Work left</h5>
                  {group.workItems.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {group.workItems.map(item => {
                        const shortName = getShortName(labelById.get(item.boqItemId) || item.label, 42);
                        return (
                          <li key={item.boqItemId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5" data-testid={`balance-work-item-${group.key}-${item.boqItemId}`}>
                            <span className="min-w-0 flex-1 text-slate-700" title={item.label}>{shortName}</span>
                            <span className="whitespace-nowrap font-mono text-xs text-slate-800">
                              {numberText(item.quantity)} {item.unit}
                            </span>
                            {!item.hasRecipe && <span className="w-full text-xs text-amber-700">No material recipe</span>}
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">No balance work remains.</p>}
                </div>

                <div>
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Materials needed</h5>
                  {!group.materials.length ? (
                    <p className="text-xs text-muted-foreground">No material recipe is available for this balance.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-xs" data-testid={`balance-materials-${group.key}`}>
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Material</th>
                            <th className="px-2 py-1.5 text-right">Quantity</th>
                            <th className="px-2 py-1.5 text-right">Compacted (cum)</th>
                            <th className="px-2 py-1.5 text-right">MT per cum</th>
                            <th className="px-2 py-1.5 text-right">MT</th>
                            <th className="px-2 py-1.5 text-right">Loose cum</th>
                            <th className="px-2 py-1.5 text-right">Loose CFT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.materials.map((material, index) => {
                            return (
                              <tr key={`${material.materialName}-${material.uom}-${index}`} className="border-t border-slate-100">
                                <td className="px-2 py-1.5 text-slate-700">{material.materialName}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{numberText(material.totalQty)} {material.uom}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{numberText(material.compactedCum)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{numberText(material.mtPerCum)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{numberText(material.mt)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{numberText(material.looseCum)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{numberText(material.looseCft, 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {group.materials.length > 0 && (
                <div className="border-t px-3 py-3">
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By month</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] text-xs" data-testid={`balance-months-${group.key}`}>
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Material</th>
                          <th className="px-2 py-1.5 text-left">Unit</th>
                          <th className="px-2 py-1.5 text-right">Overdue</th>
                          {result.monthColumns.map(month => (
                            <th key={month} className="px-2 py-1.5 text-right">{monthLabel(month, projectStartDate)}</th>
                          ))}
                          {result.hasNotScheduled && <th className="px-2 py-1.5 text-right">Not scheduled</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {group.materials.map((material, index) => {
                          const unit = material.monthlyUnit;
                          const looseValuesMissing = material.valuesUnavailable || (unit === "loose cum" && material.looseCum == null);
                          const expandKey = `${group.key}|${material.materialName}|${material.uom}|${index}`;
                          const isExpanded = expandedMonthRows.has(expandKey);
                          return (
                            <Fragment key={expandKey}>
                              <tr className="border-t border-slate-100">
                                <td className="px-2 py-1.5 text-slate-700">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-left"
                                    onClick={() => setExpandedMonthRows(current => {
                                      const next = new Set(current);
                                      if (next.has(expandKey)) next.delete(expandKey); else next.add(expandKey);
                                      return next;
                                    })}
                                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${material.materialName} contributors`}
                                  >
                                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {getShortName(material.materialName, 32)}
                                  </button>
                                </td>
                                <td className="px-2 py-1.5 text-slate-500">{unit}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{looseValuesMissing ? "—" : numberText(material.overdue)}</td>
                                {result.monthColumns.map(month => (
                                  <td key={month} className="px-2 py-1.5 text-right font-mono">{looseValuesMissing ? "—" : numberText(material.monthly[month] ?? 0)}</td>
                                ))}
                                {result.hasNotScheduled && (
                                  <td className="px-2 py-1.5 text-right font-mono">{looseValuesMissing ? "—" : numberText(material.notScheduled)}</td>
                                )}
                              </tr>
                              {isExpanded && (
                                <tr className="border-t bg-slate-50">
                                  <td colSpan={2 + result.monthColumns.length + (result.hasNotScheduled ? 1 : 0)} className="px-4 py-2">
                                    {material.contributors.map(contributor => (
                                      <p
                                        key={contributor.boqItemId}
                                        className="text-[11px] text-slate-600"
                                        title={contributor.description}
                                      >
                                        {contributor.itemCode ? `[${contributor.itemCode}] ` : ""}
                                        {getShortName(labelById.get(contributor.boqItemId) || contributor.label, 48)}
                                        {" · "}{numberText(contributor.quantity)} {contributor.unit}
                                      </p>
                                    ))}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="overflow-hidden rounded-lg border" data-testid="balance-material-totals">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
              <h4 className="text-sm font-semibold text-slate-700">All reaches — balance total</h4>
              {stockLoading && <span className="text-xs text-muted-foreground">Loading company stock…</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Material</th>
                    <th className="px-2 py-2 text-right">Total needed</th>
                    <th className="px-2 py-2 text-right">Company stock now</th>
                    <th className="px-3 py-2 text-right">Still to arrange</th>
                  </tr>
                </thead>
                <tbody>
                  {result.totals.map((total, index) => (
                    <tr key={`${total.materialName}-${index}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{total.materialName}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {total.needed == null ? "—" : `${numberText(total.needed)} ${unitText(total.neededUom)}`}
                      </td>
                      <td className="px-2 py-2 text-right font-mono" title={total.conversionBasis ?? undefined}>
                        {total.stock == null ? "—" : `${numberText(total.stock)} ${unitText(total.stockUom ?? total.neededUom)}`}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {total.stillToArrange == null
                          ? "—"
                          : total.enough
                            ? "Enough"
                            : `${numberText(total.stillToArrange)} ${unitText(total.neededUom)}`}
                      </td>
                    </tr>
                  ))}
                  {!result.totals.length && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No material balance is available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
