import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

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
  overQuantity: number;
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

  if (query.isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading work value…</p>;
  if (query.isError) return <p className="p-4 text-sm text-destructive" role="alert">{(query.error as Error).message}</p>;
  const data = query.data;
  if (!data) return null;
  const workRows = data.rows.filter(row => row.rowType === "working_reach");
  const noScopeRows = data.rows.filter(row => row.rowType === "no_scope");

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
        <table className="w-full min-w-[1100px] border-collapse text-xs">
          <thead>
            <tr className="border-b bg-slate-100 text-left print:bg-white">
              <th className="p-2">BOQ item · Reach</th>
              <th className="p-2 text-right">Scope share</th>
              <th className="p-2 text-right">Done</th>
              <th className="p-2 text-right">Incidental · no value</th>
              <th className="p-2 text-right">Rework · no value</th>
              <th className="p-2 text-right">Balance</th>
              <th className="p-2 text-right">Value done</th>
              <th className="p-2 text-right">Over BOQ</th>
              <th className="p-2 text-right">Value balance</th>
            </tr>
          </thead>
          <tbody>
            {workRows.map((row, index) => (
              <tr className="border-t align-top print:border-black" key={`${row.boqItemId}-${row.reachId}-${index}`}>
                <td className="p-2">
                  <div className="font-medium">{row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}</div>
                  <div className="text-[10px] text-muted-foreground print:text-black">{row.reachLabel} · Ch {ch(row.chainageFrom)}–{ch(row.chainageTo)}</div>
                </td>
                <td className="p-2 text-right font-mono">{qty(row.scopeQuantity, row.unit)}</td>
                <td className="p-2 text-right font-mono">{qty(row.doneQuantity, row.unit)}</td>
                <td className="p-2 text-right font-mono">{row.incidentalQuantity > 0 ? qty(row.incidentalQuantity, row.unit) : "—"}</td>
                <td className="p-2 text-right font-mono">{row.reworkQuantity > 0 ? qty(row.reworkQuantity, row.unit) : "—"}</td>
                <td className="p-2 text-right font-mono">{qty(row.balanceQuantity, row.unit)}</td>
                <td className="p-2 text-right font-mono">{money(row.valueDone)}</td>
                <td className="p-2 text-right font-mono">
                  {row.overQuantity > 0 ? <><span>{qty(row.overQuantity, row.unit)}</span><span className="block text-[10px]">{money(row.overValue)} · needs variation</span></> : "—"}
                </td>
                <td className="p-2 text-right font-mono">{money(row.valueBalance)}</td>
              </tr>
            ))}
            {noScopeRows.map((row, index) => (
              <tr className="border-t bg-slate-50 print:border-black print:bg-white" key={`no-scope-${row.boqItemId}-${index}`}>
                <td className="p-2">
                  <div className="font-medium">{row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}</div>
                  <div className="text-[10px] print:text-black">{row.reachLabel} · excluded from bill estimate</div>
                </td>
                <td className="p-2 text-right font-mono">{qty(row.scopeQuantity, row.unit)}</td>
                <td className="p-2 text-right">—</td><td className="p-2 text-right">—</td><td className="p-2 text-right">—</td>
                <td className="p-2 text-right font-mono">{qty(row.balanceQuantity, row.unit)}</td>
                <td className="p-2 text-right">—</td><td className="p-2 text-right">—</td>
                <td className="p-2 text-right font-mono">{money(row.valueBalance)}</td>
              </tr>
            ))}
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
