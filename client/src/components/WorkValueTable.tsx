import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { boqItemDisplayName } from "@/lib/itemName";
import { getShortName } from "@shared/planningEngine";

type WorkValueRow = {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  reachId: number | null;
  reachLabel: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  scopeQuantity: number;
  doneQuantity: number;
  incidentalQuantity: number;
  reworkQuantity: number;
  balanceQuantity: number;
  /** Informational only: billable work beyond this reach's share. */
  overQuantity: number;
  overBoqQuantity: number;
  overBoqSummaryRow: boolean;
  overBoqValue: number | null;
  claimedAboveEstimate: boolean;
  claimedAboveEstimateNote: string | null;
  rate: number | null;
  valueDone: number | null;
  valueBalance: number | null;
  overValue: number | null;
  rowType: "working_reach" | "no_scope";
};

type WorkValueResponse = {
  projectId: number;
  projectName: string;
  siteName: string;
  scopeBasis: string;
  rows: WorkValueRow[];
  reachTotals: Array<{
    reachId: number | null; reachLabel: string; chainageFrom: number | null; chainageTo: number | null;
    scopeQuantity: number; doneQuantity: number; balanceQuantity: number; overQuantity: number;
    valueDone: number; valueBalance: number; overValue: number; incompleteValueRows: number;
  }>;
  totals: {
    billEstimateWithinBoq: number;
    overBoqValue: number;
    valueBalance: number;
    boqNotNeededValue: number;
    incompleteValueRows: number;
  };
  unassignedDone: Array<{ boqItemId: number; itemCode: string | null; description: string; quantity: number; reason: string }>;
  barsBeyondCorridor: Array<{ barId: number; itemCode: string | null; description: string; label: string | null; chainageFrom: number | null; chainageTo: number | null; corridorEnd: number }>;
};

const qty = (value: number | null | undefined, unit: string) =>
  value == null ? "—" : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit}`.trim();
const money = (value: number | null | undefined) =>
  value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ch = (value: number | null) => value == null ? "—" : `${Math.floor(value)}+${String(Math.round((value - Math.floor(value)) * 1000)).padStart(3, "0")}`;

export function WorkValueTable({ projectId }: { projectId: number }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const query = useQuery<WorkValueResponse>({
    queryKey: ["/api/boq/projects", projectId, "work-value"],
    enabled: Number.isInteger(projectId) && projectId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects/${projectId}/work-value`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not load Work value.");
      return body;
    },
  });

  const groups = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const working = rows.filter(row => row.rowType === "working_reach");
    const reachGroups = new Map<string, { key: string; label: string; chainageFrom: number | null; rows: WorkValueRow[] }>();
    const wholeRoadRows: WorkValueRow[] = [];
    for (const row of working) {
      if (row.reachId == null) {
        wholeRoadRows.push(row);
        continue;
      }
      const key = `reach-${row.reachId}`;
      const group = reachGroups.get(key) ?? {
        key,
        label: row.reachLabel,
        chainageFrom: row.chainageFrom,
        rows: [],
      };
      group.rows.push(row);
      reachGroups.set(key, group);
    }
    const sortedReachGroups = Array.from(reachGroups.values())
      .sort((a, b) => (a.chainageFrom ?? 0) - (b.chainageFrom ?? 0));
    const noScopeRows = rows.filter(row => row.rowType === "no_scope");
    return [
      ...sortedReachGroups,
      ...(wholeRoadRows.length ? [{ key: "whole-road", label: "Whole road", chainageFrom: null, rows: wholeRoadRows }] : []),
      ...noScopeRows.map((row, index) => ({
        key: `no-scope-${row.boqItemId}-${index}`,
        label: `No-scope · ${row.itemCode ? `[${row.itemCode}] ` : ""}${getShortName(boqItemDisplayName({ description: row.description }), 48)}`,
        chainageFrom: null,
        rows: [row],
      })),
    ];
  }, [query.data?.rows]);

  if (query.isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading work value…</p>;
  if (query.isError) return <p className="p-4 text-sm text-destructive" role="alert">{(query.error as Error).message}</p>;
  const data = query.data;
  if (!data) return null;
  const allRows = data.rows;
  const nullableSum = (rows: WorkValueRow[], get: (row: WorkValueRow) => number | null) => {
    if (!rows.length) return null;
    const values = rows.map(get);
    return values.some(value => value == null) ? null : values.reduce<number>((sum, value) => sum + Number(value), 0);
  };
  const fmtAmount = (value: number | null) => money(value);

  return (
    <section className="space-y-4 print:bg-white print:text-black" data-testid="work-value-report">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Work value by working reach</h2>
          <p className="text-xs text-muted-foreground print:text-black">{data.scopeBasis}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden" data-testid="button-print-work-value">
          Print
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Bill estimate (within BOQ)", data.totals.billEstimateWithinBoq],
          ["Over BOQ — needs variation", data.totals.overBoqValue],
          ["Value balance", data.totals.valueBalance],
          ["BOQ not needed (no-scope portion)", data.totals.boqNotNeededValue],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border bg-white p-3 print:border-black">
            <p className="text-xs text-muted-foreground print:text-black">{label}</p>
            <p className="mt-1 font-mono font-semibold">{money(Number(value))}</p>
          </div>
        ))}
      </div>
      {data.totals.incompleteValueRows > 0 && (
        <p className="text-xs text-amber-800 print:text-black">
          {data.totals.incompleteValueRows} reach/item row{data.totals.incompleteValueRows === 1 ? "" : "s"} has no saved BOQ rate; its values are not included in the totals.
        </p>
      )}

      {data.reachTotals.length > 0 && (
        <section className="rounded border p-3 print:border-black" data-testid="work-value-reach-totals">
          <h3 className="mb-2 text-sm font-semibold">Totals by reach</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.reachTotals.map((reach, index) => (
              <div key={`${reach.reachId ?? "full"}-${index}`} className="rounded border bg-white p-2 print:border-black">
                <p className="text-xs font-semibold">{reach.reachLabel}{reach.chainageFrom != null && reach.chainageTo != null ? ` · Ch ${ch(reach.chainageFrom)}–${ch(reach.chainageTo)}` : ""}</p>
                <p className="mt-1 text-[11px]">Value done: {money(reach.valueDone)} · Over BOQ — needs variation: {money(reach.overValue)} · Value balance: {money(reach.valueBalance)}</p>
                {reach.incompleteValueRows > 0 && <p className="text-[10px]">{reach.incompleteValueRows} item rows have no saved BOQ rate.</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded border print:border-black">
        <table className="w-full min-w-[1000px] border-collapse text-xs" data-testid="table-work-value">
          <thead>
            <tr className="border-b bg-slate-100 text-left print:bg-white">
              <th className="p-2">Item</th>
              <th className="p-2">Unit</th>
              <th className="p-2 text-right">Scope qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Scope amount</th>
              <th className="p-2 text-right">Done qty</th>
              <th className="p-2 text-right">Done amount</th>
              <th className="p-2 text-right">Balance qty</th>
              <th className="p-2 text-right">Balance amount</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <Fragment key={group.key}>
                <tr className="border-t bg-slate-50 print:border-black print:bg-white">
                  <th colSpan={9} className="px-2 py-2 text-left font-semibold">{group.label}</th>
                </tr>
                {group.rows.map((row, index) => {
                  const key = `${group.key}-${row.boqItemId}-${index}`;
                  const isExpanded = expandedRows.has(key);
                  const scopeAmount = row.rate == null ? null : row.scopeQuantity * row.rate;
                  const itemTitle = boqItemDisplayName({ description: row.description, displayName: (row as any).displayName });
                  return (
                    <Fragment key={key}>
                      <tr className="border-t align-top print:border-black" data-testid={`work-value-row-${group.key}-${row.boqItemId}`}>
                        <td className="p-2">
                          <button
                            type="button"
                            className="flex items-start gap-1 text-left"
                            onClick={() => setExpandedRows(current => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            })}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${itemTitle}`}
                            title={row.description}
                          >
                            {isExpanded ? <ChevronDown className="mt-0.5 h-3 w-3" /> : <ChevronRight className="mt-0.5 h-3 w-3" />}
                            <span className="font-medium">{row.itemCode ? `[${row.itemCode}] ` : ""}{getShortName(itemTitle, 48)}</span>
                          </button>
                        </td>
                        <td className="p-2">{row.unit}</td>
                        <td className="p-2 text-right font-mono">{qty(row.scopeQuantity, row.unit)}</td>
                        <td className="p-2 text-right font-mono">{money(row.rate)}</td>
                        <td className="p-2 text-right font-mono">{fmtAmount(scopeAmount)}</td>
                        <td className="p-2 text-right font-mono">{qty(row.doneQuantity, row.unit)}</td>
                        <td className="p-2 text-right font-mono">{money(row.valueDone)}</td>
                        <td className="p-2 text-right font-mono">{qty(row.balanceQuantity, row.unit)}</td>
                        <td className="p-2 text-right font-mono">{money(row.valueBalance)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t bg-slate-50 print:border-black print:bg-white">
                          <td colSpan={9} className="px-5 py-2 text-[11px] print:text-black">
                            <span title={row.description}>{row.description}</span>
                            <span className="ml-2 text-slate-600">Incidental: {qty(row.incidentalQuantity, row.unit)} · Rework: {qty(row.reworkQuantity, row.unit)} · Over reach share: {qty(row.overQuantity, row.unit)} · Over BOQ: {qty(row.overBoqQuantity, row.unit)} ({money(row.overBoqValue)}) · Claimed above estimate: {row.claimedAboveEstimate ? `Yes${row.claimedAboveEstimateNote ? ` — ${row.claimedAboveEstimateNote}` : ""}` : "No"}</span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="border-t bg-slate-100 font-semibold print:border-black print:bg-white" data-testid={`work-value-subtotal-${group.key}`}>
                  <td className="p-2" colSpan={2}>Subtotal · {group.label}</td>
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2 text-right font-mono">{fmtAmount(nullableSum(group.rows, row => row.rate == null ? null : row.scopeQuantity * row.rate))}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right font-mono">{fmtAmount(nullableSum(group.rows, row => row.valueDone))}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right font-mono">{fmtAmount(nullableSum(group.rows, row => row.valueBalance))}</td>
                </tr>
              </Fragment>
            ))}
            {allRows.length > 0 && (
              <tr className="border-t-2 border-slate-500 bg-slate-200 font-bold print:border-black print:bg-white" data-testid="work-value-grand-total">
                <td className="p-2" colSpan={2}>Grand total</td>
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2 text-right font-mono">{fmtAmount(nullableSum(allRows, row => row.rate == null ? null : row.scopeQuantity * row.rate))}</td>
                <td className="p-2" />
                <td className="p-2 text-right font-mono">{fmtAmount(nullableSum(allRows, row => row.valueDone))}</td>
                <td className="p-2" />
                <td className="p-2 text-right font-mono">{fmtAmount(nullableSum(allRows, row => row.valueBalance))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.unassignedDone.length > 0 && (
        <section className="rounded border p-3 print:border-black">
          <h3 className="text-sm font-semibold">Submitted quantities not assigned to a working reach</h3>
          <p className="mb-2 text-xs text-muted-foreground print:text-black">These lines lack a unique chainage match and are not included in reach values.</p>
          {data.unassignedDone.map((row, index) => (
            <p key={`${row.boqItemId}-${index}`} className="text-xs">{row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}: {qty(row.quantity, "")}</p>
          ))}
        </section>
      )}
      {data.barsBeyondCorridor.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 print:border-black print:bg-white" data-testid="bars-beyond-corridor">
          <h3 className="text-sm font-semibold">Programme bars extending beyond corridor end {ch(data.barsBeyondCorridor[0].corridorEnd)}</h3>
          <p className="mb-2 text-xs">Bars are not changed here; review their chainage in the programme.</p>
          {data.barsBeyondCorridor.map(bar => (
            <p key={bar.barId} className="text-xs">{bar.itemCode ? `[${bar.itemCode}] ` : ""}{bar.description} · {bar.label || `Bar #${bar.barId}`} · Ch {ch(bar.chainageFrom)}–{ch(bar.chainageTo)}</p>
          ))}
        </section>
      )}
    </section>
  );
}
