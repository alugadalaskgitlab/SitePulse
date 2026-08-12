/**
 * Batch 06F — allocator-side daily fulfilment context for Tomorrow's Requirements.
 *
 * Shown ONLY on the PM / allocating-authority review side — the Engineer's
 * requirement entry never carries fulfilment decisions. Purely a recording UI:
 * it never mutates the standing Execution Arrangement, its scope/quantities,
 * programme allocations, or BOM responsibility.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2 } from "lucide-react";
import { useProjectArrangements } from "@/components/ExecutionStateBadge";
import {
  resolveRequirementArrangements,
  standingArrangementExceptionNote,
  fulfilmentLabel,
  type RequirementArrangementResolution,
  type RequirementArrangementInput,
  type AllocationEntryLike,
  type FulfilmentType,
} from "@shared/requirementFulfilment";

export interface FulfilmentValue {
  fulfilmentType: FulfilmentType | null;
  arrangementId: number | null;
  agencyNameSnapshot: string | null;
  exceptionReason: string | null;
}

export const EMPTY_FULFILMENT: FulfilmentValue = {
  fulfilmentType: null, arrangementId: null, agencyNameSnapshot: null, exceptionReason: null,
};

const ARRANGEMENT_TYPE_LABEL: Record<string, string> = {
  fully_outsourced_composite: "Fully outsourced (composite)",
  vendor_material_delivered: "Vendor material delivered",
  hlc_source_outsourced_execution: "HLC source, outsourced execution",
  hlc_in_house: "HLC in-house",
  client_supplied: "Client supplied",
  reused_excavated: "Reused excavated",
};

function fmtCh(v: number | null | undefined): string {
  if (v == null) return "?";
  const km = Math.floor(v);
  const m = Math.round((v - km) * 1000);
  return `${km}+${String(m).padStart(3, "0")}`;
}

type Arr = RequirementArrangementInput & { agencyName?: string | null; arrangementType?: string | null };

/**
 * Resolve arrangement context for a requirement's planned work.
 * Uses the exact same project/arrangement queries as the rest of the app.
 * programmeBarId is used ONLY when genuinely persisted on plannedWork.
 */
export function useRequirementFulfilmentContext(
  siteId: number | null | undefined,
  plannedWork: { boqItemId?: number | null; programmeBarId?: number | null; chainageFrom?: number | null; chainageTo?: number | null } | null | undefined,
  enabled: boolean,
): RequirementArrangementResolution<Arr> | null {
  const boqItemId = plannedWork?.boqItemId ?? null;
  const on = enabled && !!siteId && boqItemId != null;

  const { data: projects = [] } = useQuery<Array<{ id: number; status?: string; barCount?: number }>>({
    queryKey: ["/api/boq/projects", "bySite", siteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: on,
    staleTime: 60_000,
  });
  const projectId = useMemo(() => {
    if (!projects.length) return null;
    const activeWithBars = projects.find(p => p.status === "active" && (p.barCount ?? 0) > 0);
    return (activeWithBars ?? projects.find(p => p.status === "active") ?? projects[0]).id;
  }, [projects]);

  const { arrangements, allocations } = useProjectArrangements(projectId ?? 0, on && projectId != null);

  return useMemo(() => {
    if (!on || boqItemId == null) return null;
    return resolveRequirementArrangements<Arr>(
      arrangements as unknown as Arr[],
      allocations,
      {
        boqItemId,
        programmeBarId: plannedWork?.programmeBarId ?? null,
        chainageFrom: plannedWork?.chainageFrom ?? null,
        chainageTo: plannedWork?.chainageTo ?? null,
      },
    );
  }, [on, boqItemId, arrangements, allocations, plannedWork?.programmeBarId, plannedWork?.chainageFrom, plannedWork?.chainageTo]);
}

/** Compact display of a saved fulfilment decision (list rows / readiness). */
export function FulfilmentBadge({ entry, testId }: { entry: AllocationEntryLike | null | undefined; testId?: string }) {
  const label = fulfilmentLabel(entry);
  if (!label) return null;
  return (
    <div className="mt-0.5" data-testid={testId}>
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
        <Building2 className="w-2.5 h-2.5" /> {label}
      </span>
      {entry?.exceptionReason && (
        <p className="text-[10px] text-slate-400 italic mt-0.5">Reason: {entry.exceptionReason}</p>
      )}
    </div>
  );
}

/**
 * Fulfilment chooser rendered inside the allocator's per-line status editor.
 * Options: suggested arrangement (prominent), other compatible arrangements,
 * HLC / Internally Arranged, Other Agency (daily exception).
 * Suggestion is never locked; no-arrangement is normal (HLC default, no error).
 */
export function FulfilmentEditor({
  resolution, value, onChange, testIdPrefix = "fulfilment",
}: {
  resolution: RequirementArrangementResolution<Arr> | null;
  value: FulfilmentValue;
  onChange: (v: FulfilmentValue) => void;
  testIdPrefix?: string;
}) {
  const [showOther, setShowOther] = useState(value.fulfilmentType === "other_agency");
  const candidates = resolution?.candidates ?? [];
  const suggested = resolution?.suggested ?? null;

  const pickArrangement = (a: Arr) =>
    onChange({ fulfilmentType: "arrangement", arrangementId: a.id, agencyNameSnapshot: a.agencyName ?? null, exceptionReason: value.exceptionReason });
  const pickHlc = () =>
    onChange({ fulfilmentType: "hlc", arrangementId: null, agencyNameSnapshot: null, exceptionReason: value.exceptionReason });

  const exceptionNote = standingArrangementExceptionNote(value, suggested);

  return (
    <div className="space-y-1.5" data-testid={`${testIdPrefix}-editor`}>
      <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
        Fulfilment — arranged through whom? <span className="font-normal normal-case text-slate-400">(optional)</span>
      </p>

      {candidates.map(({ arrangement: a, matchLevel, onHold }) => {
        const selected = value.fulfilmentType === "arrangement" && value.arrangementId === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => pickArrangement(a)}
            className={`w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
              selected ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
            data-testid={`${testIdPrefix}-arr-${a.id}`}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold">{a.agencyName || `Arrangement #${a.id}`}</span>
              {suggested?.arrangement.id === a.id && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">SUGGESTED</span>
              )}
              {matchLevel === "exact_bar" && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700">This reach</span>}
              {onHold && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">⚠ Arrangement on hold</span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              {ARRANGEMENT_TYPE_LABEL[a.arrangementType ?? ""] ?? a.arrangementType ?? ""}
              {a.chainageFrom != null && a.chainageTo != null ? ` · Ch. ${fmtCh(a.chainageFrom)}–${fmtCh(a.chainageTo)}` : ""}
              {` · ${a.status.replace(/_/g, " ")}`}
            </p>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => { setShowOther(false); pickHlc(); }}
        className={`w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
          value.fulfilmentType === "hlc" ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
        data-testid={`${testIdPrefix}-hlc`}
      >
        <span className="font-semibold">HLC / Internally Arranged</span>
        <p className="text-[10px] text-slate-400">Handled through the normal internal process{candidates.length === 0 ? " (no execution arrangement — that's fine)" : ""}</p>
      </button>

      <button
        type="button"
        onClick={() => { setShowOther(true); onChange({ fulfilmentType: "other_agency", arrangementId: null, agencyNameSnapshot: value.agencyNameSnapshot, exceptionReason: value.exceptionReason }); }}
        className={`w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
          value.fulfilmentType === "other_agency" ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
        data-testid={`${testIdPrefix}-other`}
      >
        <span className="font-semibold">Other Agency — one-day exception</span>
        <p className="text-[10px] text-slate-400">Different supplier for tomorrow only; the standing arrangement is not changed</p>
      </button>

      {showOther && value.fulfilmentType === "other_agency" && (
        <div className="space-y-1 pl-1">
          <input
            type="text"
            value={value.agencyNameSnapshot ?? ""}
            onChange={(e) => onChange({ ...value, agencyNameSnapshot: e.target.value })}
            placeholder="Agency / supplier name (required)"
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-900"
            data-testid={`${testIdPrefix}-agency-name`}
          />
          <input
            type="text"
            value={value.exceptionReason ?? ""}
            onChange={(e) => onChange({ ...value, exceptionReason: e.target.value })}
            placeholder="Reason (e.g. primary vendor unavailable)"
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-900"
            data-testid={`${testIdPrefix}-exception-reason`}
          />
        </div>
      )}

      {exceptionNote && (
        <div className="flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid={`${testIdPrefix}-exception-note`}>
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>{exceptionNote}</span>
        </div>
      )}

      {value.fulfilmentType != null && (
        <button
          type="button"
          onClick={() => { setShowOther(false); onChange({ ...EMPTY_FULFILMENT }); }}
          className="text-[10px] text-slate-400 underline"
          data-testid={`${testIdPrefix}-clear`}
        >
          Clear fulfilment selection
        </button>
      )}
    </div>
  );
}
