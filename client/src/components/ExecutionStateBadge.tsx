/**
 * Instruction 027 Part A — compact operational execution-state badge.
 *
 * One badge per programme bar (or Procurement row) derived via the shared
 * deriveExecutionState() rules. Clicking the badge opens the stretch
 * Execution Plan panel (caller supplies onClick).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  deriveExecutionState,
  EXECUTION_STATE_COLORS,
  type ExecutionStateArrangement,
  type ExecutionStateResult,
} from "@shared/executionState";

export interface ProjectArrangement {
  id: number;
  status: string;
  arrangementType: string;
  allocatedQty: number;
  agencyName: string | null;
  boqItemId: number | null;
  boqItemAllocations: Array<{ boqItemId: number; qty: number }> | null;
  components?: Record<string, string> | null;
  pendingRevision?: unknown;
  uom?: string | null;
}

export interface ProjectBarAllocation {
  id: number;
  arrangementId: number;
  programmeBarId: number;
  boqItemId: number;
  allocatedQty: number;
  arrangementStatus?: string;
}

/** Project-wide arrangement + bar-allocation queries (deduped by react-query). */
export function useProjectArrangements(projectId: number, enabled = true) {
  const { data: arrangements = [] } = useQuery<ProjectArrangement[]>({
    queryKey: ["earthwork-arrangements-project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/earthwork-arrangements`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
  const { data: allocations = [] } = useQuery<ProjectBarAllocation[]>({
    queryKey: ["/api/boq/projects", projectId, "arrangement-programme-allocations"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/arrangement-programme-allocations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
  return { arrangements, allocations };
}

/**
 * Derive a bar's execution state. Bar-linked allocations count toward this bar;
 * an arrangement with unlinked quantity on this bar's BOQ item also counts
 * (legacy whole-item coverage) proportionally — kept simple: unlinked quantity
 * counts toward the bar only when NOT linked to any other bar of the same item.
 */
/**
 * Pure derivation (Instruction 030): same rules as useBarExecutionState, but
 * callable in a loop (e.g. item-header aggregate counts over all bars).
 */
export function deriveBarExecutionStateFromProject(
  arrangements: ProjectArrangement[],
  allocations: ProjectBarAllocation[],
  opts: {
    barId: number;
    boqItemId: number;
    barPlannedQty: number;
    unit?: string;
    category?: "earthwork" | "bituminous" | null;
    itemType?: string | null;
  },
): ExecutionStateResult {
    const liveStatusByArrangementId = new Map(arrangements.map((arrangement) => [arrangement.id, arrangement.status]));
    const linkedByArr = new Map<number, number>();
    for (const al of allocations) {
      const currentStatus = liveStatusByArrangementId.get(al.arrangementId);
      if (currentStatus == null) continue;
      if (["cancelled", "rejected"].includes(String(currentStatus ?? "").toLowerCase())) continue;
      linkedByArr.set(al.arrangementId, (linkedByArr.get(al.arrangementId) ?? 0) + Number(al.allocatedQty));
    }
    const relevant: ExecutionStateArrangement[] = [];
    for (const arr of arrangements) {
      // Quantity attributable to this BOQ item
      const itemQty = arr.boqItemAllocations?.length
        ? Number(arr.boqItemAllocations.find(a => Number(a.boqItemId) === opts.boqItemId)?.qty ?? 0)
        : (Number(arr.boqItemId) === opts.boqItemId ? Number(arr.allocatedQty) : 0);
      if (itemQty <= 0.001) continue;
      const linkedHere = allocations
        .filter(al =>
          al.arrangementId === arr.id &&
          al.programmeBarId === opts.barId &&
          !["cancelled", "rejected"].includes(String(liveStatusByArrangementId.get(al.arrangementId) ?? "").toLowerCase())
        )
        .reduce((s, al) => s + Number(al.allocatedQty), 0);
      const linkedTotal = linkedByArr.get(arr.id) ?? 0;
      const unlinked = Math.max(0, Number(arr.allocatedQty) - linkedTotal);
      // Bar scope = qty explicitly linked here + (unlinked legacy remainder capped to this bar)
      const qtyForScope = linkedHere + Math.min(unlinked, Math.max(0, opts.barPlannedQty - linkedHere));
      if (qtyForScope <= 0.001) continue;
      relevant.push({
        id: arr.id, status: arr.status, arrangementType: arr.arrangementType,
        qtyForScope, agencyName: arr.agencyName, components: arr.components ?? null,
        pendingRevision: arr.pendingRevision ?? null,
      });
    }
    return deriveExecutionState(opts.barPlannedQty, relevant, {
      uom: opts.unit ?? "CUM",
      category: opts.category ?? "earthwork",
      itemType: opts.itemType ?? null,
    });
}

export function useBarExecutionState(opts: {
  projectId: number;
  barId: number;
  boqItemId: number;
  barPlannedQty: number;
  unit?: string;
  enabled?: boolean;
  /** Instruction 028: work category of the bar's BOQ item (earthwork default). */
  category?: "earthwork" | "bituminous" | null;
  itemType?: string | null;
}): ExecutionStateResult | null {
  const { arrangements, allocations } = useProjectArrangements(opts.projectId, opts.enabled !== false);
  return useMemo(() => {
    if (opts.enabled === false) return null;
    return deriveBarExecutionStateFromProject(arrangements, allocations, opts);
  }, [arrangements, allocations, opts.barId, opts.boqItemId, opts.barPlannedQty, opts.unit, opts.enabled, opts.category, opts.itemType]);
}

export function ExecutionStateBadge({
  result, onClick, compact, testId,
}: {
  result: ExecutionStateResult;
  onClick?: () => void;
  compact?: boolean;
  testId?: string;
}) {
  const c = EXECUTION_STATE_COLORS[result.state];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${result.badge}${result.pendingRevision ? " · Revision Pending" : ""} — click for the execution plan`}
      className={`inline-flex items-center gap-1 max-w-[220px] truncate whitespace-nowrap rounded border px-1.5 py-0.5 font-semibold ${c.bg} ${c.border} ${c.text} ${compact ? "text-[10px]" : "text-[11px]"} hover:brightness-95 transition`}
      data-testid={testId ?? "badge-execution-state"}
    >
      <span className="truncate">{result.badge}</span>
      {result.pendingRevision && (
        <span className="shrink-0 rounded bg-purple-100 border border-purple-300 text-purple-700 px-1 text-[9px]" title="A material/commercial revision is awaiting approval">
          Rev
        </span>
      )}
    </button>
  );
}
