import { useQuery } from "@tanstack/react-query";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Loader2 } from "lucide-react";
import { fmtQty } from "@shared/planningEngine";
import type { PlanVsActualRow } from "@shared/schema";

// Task #1240 — single, DPR-fed source of truth for the contractor-style
// Plan vs Actual table. Both WorkProgramme.tsx (Gantt "Plan vs Actual" tab)
// and WorkDemand.tsx (BOM & Demand "Plan vs Actual" tab) render THIS same
// component against the same `/api/boq/projects/:id/plan-vs-actual`
// endpoint, so the numbers can never drift between the two pages.
// Columns match the contractor-familiar layout: UOM / BOQ Rate / BOQ Qty /
// Planned-to-date / Actual-to-date / BOQ Value / Planned Value / Actual
// Value / BOQ Balance / % Complete / Status / Last Activity.

function deriveStatus(row: PlanVsActualRow): { label: string; className: string } {
  const balance = row.currentQty - row.totalActual;
  if (row.percentComplete >= 100 || balance <= 0) {
    return { label: "Complete", className: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  }
  if (row.totalActual <= 0) {
    return { label: "Not started", className: "text-slate-500 bg-slate-50 border-slate-200" };
  }
  if (row.totalPlanned > 0 && row.totalActual < row.totalPlanned * 0.8) {
    return { label: "Behind plan", className: "text-red-700 bg-red-50 border-red-200" };
  }
  return { label: "On track", className: "text-teal-700 bg-teal-50 border-teal-200" };
}

export function PlanVsActualTable({ projectId }: { projectId: number }) {
  const { data: rows = [], isLoading } = useQuery<PlanVsActualRow[]>({
    queryKey: ["/api/boq/projects", projectId, "plan-vs-actual"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/plan-vs-actual`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>;
  if (!rows.length) return <div className="py-8 text-center text-muted-foreground text-sm">No planned items yet.</div>;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm border-collapse" data-testid="table-plan-vs-actual">
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[220px]" style={{ background: "#0F5F64" }}>BOQ Item</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[60px]">UOM</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">BOQ Rate (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">BOQ Qty</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Planned to Date</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Actual to Date</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">BOQ Balance</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">BOQ Value (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">Planned Value (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[110px]">Actual Value (₹)</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[80px]">% Complete</th>
            <th className="px-2 py-2 font-semibold text-white text-left min-w-[100px]">Status</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[90px]">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const balance = row.currentQty - row.totalActual;
            const status = deriveStatus(row);
            return (
              <tr key={row.boqItemId} className="border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/30" data-testid={`pva-contractor-row-${row.boqItemId}`}>
                <td className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-950 z-10 text-slate-700 dark:text-slate-300 max-w-[320px]">
                  <HoverCard openDelay={120} closeDelay={40}>
                    <HoverCardTrigger asChild>
                      <span className="block truncate cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">
                        {row.itemCode ? `[${row.itemCode}] ` : ""}{row.description}
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent align="start" side="bottom" className="w-96 max-w-[90vw]">
                      {row.itemCode && (
                        <span className="font-mono text-xs text-teal-700">{row.itemCode}</span>
                      )}
                      <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug whitespace-pre-wrap">
                        {row.description}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {fmtQty(row.currentQty, 1)} {row.unit}
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">{row.unit}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-600">{row.clientRate != null ? fmtQty(row.clientRate, 2) : "—"}</td>
                <td className="px-2 py-2 text-right font-mono">{fmtQty(row.currentQty, 1)}</td>
                <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(row.totalPlanned, 1)}</td>
                <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(row.totalActual, 1)}</td>
                <td className={`px-2 py-2 text-right font-mono font-semibold ${balance <= 0 ? "text-emerald-700" : "text-slate-600"}`}>{fmtQty(balance, 1)}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-600">{fmtQty(row.boqAmount, 0)}</td>
                <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(row.plannedAmount, 0)}</td>
                <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(row.actualAmount, 0)}</td>
                <td className="px-2 py-2 text-right">
                  <span className={`font-semibold ${
                    row.percentComplete >= 100 ? "text-emerald-700"
                    : row.percentComplete >= 80 ? "text-teal-700"
                    : row.percentComplete >= 50 ? "text-amber-700"
                    : "text-red-700"
                  }`}>
                    {fmtQty(row.percentComplete, 1)}%
                  </span>
                </td>
                <td className="px-2 py-2 text-left">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold border whitespace-nowrap ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">{row.lastActivityDate ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold bg-slate-50 dark:bg-slate-800/40">
            <td className="px-3 py-2 sticky left-0 bg-slate-50 dark:bg-slate-800/40">Total</td>
            <td></td><td></td><td></td><td></td><td></td><td></td>
            <td className="px-2 py-2 text-right font-mono">{fmtQty(rows.reduce((s, r) => s + (r.boqAmount || 0), 0), 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-blue-700">{fmtQty(rows.reduce((s, r) => s + (r.plannedAmount || 0), 0), 0)}</td>
            <td className="px-2 py-2 text-right font-mono text-teal-700">{fmtQty(rows.reduce((s, r) => s + (r.actualAmount || 0), 0), 0)}</td>
            <td></td><td></td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
