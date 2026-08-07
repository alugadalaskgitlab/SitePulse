/**
 * Instruction 030 — compact "manage in register" cell.
 *
 * Work Demand and Earthwork Control no longer embed the full inline
 * EarthworkArrangementCell editor; they show sourcing status and link out to
 * the project's Execution Arrangements register, which is the single place
 * where arrangements are created and edited.
 */
import { Link } from "wouter";
import { AlertTriangle, Handshake } from "lucide-react";
import { ArrangementStatusBadge } from "@/components/EarthworkArrangementDialog";
import { deriveEarthworkSourcingBadge, type EarthworkArrangementSummary } from "@shared/planningEngine";

export function ArrangementRegisterLink({
  projectId, arrangements, totalDemand, uom,
}: {
  projectId: number;
  arrangements?: EarthworkArrangementSummary[];
  totalDemand: number;
  uom: string;
}) {
  const activeArrs = (arrangements ?? []).filter(a => a.status !== "cancelled" && a.status !== "rejected");
  const allocatedTotal = activeArrs.reduce((s, a) => s + Number(a.allocatedQty), 0);
  const unallocatedQty = Math.max(0, totalDemand - allocatedTotal);
  const badge = deriveEarthworkSourcingBadge(activeArrs, totalDemand);
  const badgeMeta: Record<string, { label: string; tone: "green" | "amber" | "slate" } | undefined> = {
    none: { label: "Execution Arrangement Required", tone: "amber" },
    partially_arranged: { label: "Partly Arranged", tone: "amber" },
    fully_arranged: { label: "Fully Arranged", tone: "green" },
    internally_sourced: { label: "Internally Sourced (Cut-to-Fill)", tone: "green" },
  };
  const meta = badgeMeta[badge];

  return (
    <div className="flex flex-col gap-1" data-testid="arrangement-register-cell">
      {meta && (
        <span className={`inline-flex w-fit items-center gap-1 text-[11px] font-semibold rounded border px-1.5 py-0.5 ${meta.tone === "green" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : meta.tone === "amber" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200"}`}>
          {meta.tone === "amber" && <AlertTriangle className="w-3 h-3" />}
          {meta.label}
        </span>
      )}
      {activeArrs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeArrs.map(a => <ArrangementStatusBadge key={a.id} status={a.status} />)}
        </div>
      )}
      {unallocatedQty > 0.001 && (
        <span className="text-[11px] text-amber-700">
          {unallocatedQty.toLocaleString()} {uom} not covered by an arrangement yet.
        </span>
      )}
      <Link
        href={`/work-program/${projectId}/execution-arrangements`}
        className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 hover:bg-teal-100 transition-colors"
        data-testid="link-execution-arrangements"
      >
        <Handshake className="w-3 h-3" /> Manage in Execution Arrangements →
      </Link>
    </div>
  );
}
