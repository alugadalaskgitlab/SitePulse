/**
 * Execution-arrangement status cell for Procurement / BOM rows — READ-ONLY.
 *
 * FINAL EXECUTION ARRANGEMENT / PROCUREMENT CORRECTION:
 * Procurement is not an arrangement setup, management or navigation screen.
 * No arrangement record simply means normal HLC/contractor self-execution —
 * never a warning, never an action prompt. Arrangements are managed only in
 * Work Program & BOQ → Execution Arrangements.
 */
import { ArrangementStatusBadge } from "@/components/EarthworkArrangementDialog";
import { deriveEarthworkSourcingBadge, type EarthworkArrangementSummary } from "@shared/planningEngine";

export function ArrangementRegisterLink({
  arrangements, totalDemand,
}: {
  projectId?: number;
  arrangements?: EarthworkArrangementSummary[];
  totalDemand: number;
  uom?: string;
}) {
  const activeArrs = (arrangements ?? []).filter(a => a.status !== "cancelled" && a.status !== "rejected");
  const badge = deriveEarthworkSourcingBadge(activeArrs, totalDemand);
  const badgeMeta: Record<string, { label: string; tone: "green" | "slate" } | undefined> = {
    // No arrangement = default self-execution. Neutral, no warning, no action.
    none: { label: "HLC / Self-execution", tone: "slate" },
    partially_arranged: { label: "Partly Outsourced", tone: "slate" },
    fully_arranged: { label: "Fully Arranged", tone: "green" },
    internally_sourced: { label: "Internally Sourced (Cut-to-Fill)", tone: "green" },
  };
  const meta = badgeMeta[badge];

  return (
    <div className="flex flex-col gap-1" data-testid="arrangement-register-cell">
      {meta && (
        <span className={`inline-flex w-fit items-center gap-1 text-[11px] font-semibold rounded border px-1.5 py-0.5 ${meta.tone === "green" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-slate-600 bg-slate-50 border-slate-200"}`}>
          {meta.label}
        </span>
      )}
      {activeArrs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeArrs.map(a => <ArrangementStatusBadge key={a.id} status={a.status} />)}
        </div>
      )}
    </div>
  );
}
