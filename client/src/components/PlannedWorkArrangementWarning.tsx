/**
 * Instruction 030 Part C — reviewer-side arrangement awareness.
 *
 * Shown inside the PM/Admin site-requirements review list next to a
 * requirement's Planned Work block. Purely informational: it never gates
 * approval or allocation actions.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useProjectArrangements } from "@/components/ExecutionStateBadge";
import { derivePlannedWorkExecutionState, type PlannedWorkBar } from "@/lib/plannedWorkArrangement";
import { executionArrangementCategoryForItem } from "@shared/planningEngine";

export function PlannedWorkArrangementWarning({ siteId, plannedWork }: {
  siteId: number | null | undefined;
  plannedWork: { boqItemId?: number | null; chainageFrom?: number | null; chainageTo?: number | null; plannedQty?: string | number | null } | null | undefined;
}) {
  const boqItemId = plannedWork?.boqItemId ?? null;
  const enabled = !!siteId && boqItemId != null;

  const { data: projects = [] } = useQuery<Array<{ id: number; status?: string; barCount?: number }>>({
    queryKey: ["/api/boq/projects", "bySite", siteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled,
    staleTime: 60_000,
  });
  const projectId = useMemo(() => {
    if (!projects.length) return null;
    const activeWithBars = projects.find(p => p.status === "active" && (p.barCount ?? 0) > 0);
    return (activeWithBars ?? projects.find(p => p.status === "active") ?? projects[0]).id;
  }, [projects]);

  const { data: items = [] } = useQuery<Array<{ id: number } & Record<string, unknown>>>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: enabled && projectId != null,
    staleTime: 60_000,
  });
  const item = useMemo(() => items.find(it => it.id === boqItemId) ?? null, [items, boqItemId]);
  const eligible = useMemo(() => {
    if (!item) return false;
    try { return executionArrangementCategoryForItem(item as any) != null; } catch { return false; }
  }, [item]);

  const { arrangements, allocations } = useProjectArrangements(projectId ?? 0, eligible && projectId != null);
  const { data: bars = [] } = useQuery<PlannedWorkBar[]>({
    queryKey: ["/api/boq/projects", projectId, "programme"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/programme`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: eligible && projectId != null,
    staleTime: 30_000,
  });

  const state = useMemo(() => {
    if (!item || !eligible) return null;
    return derivePlannedWorkExecutionState({
      item,
      chainageFrom: plannedWork?.chainageFrom ?? null,
      chainageTo: plannedWork?.chainageTo ?? null,
      plannedQty: plannedWork?.plannedQty != null ? Number(plannedWork.plannedQty) : null,
      arrangements, allocations, bars,
    });
  }, [item, eligible, plannedWork, arrangements, allocations, bars]);

  if (!state || state.state !== "arrangement_required") return null;
  return (
    <div className="mt-1 flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="warning-planned-work-arrangement">
      <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
      <span><b>Execution arrangement not yet decided</b> for this stretch — decide it in the Execution Arrangements register before the work starts.</span>
    </div>
  );
}
