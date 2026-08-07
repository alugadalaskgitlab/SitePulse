/**
 * Instruction 030 Part C — Tomorrow's Plan arrangement awareness (non-blocking).
 *
 * Derives the execution state for a planned-work entry (BOQ item + chainage
 * range) so the site form and the PM/Admin review list can show an
 * "Execution Arrangement Required" warning. NEVER used to block submission.
 */
import {
  deriveBarExecutionStateFromProject,
  type ProjectArrangement,
  type ProjectBarAllocation,
} from "@/components/ExecutionStateBadge";
import type { ExecutionStateResult } from "@shared/executionState";
import { executionArrangementCategoryForItem, bituminousItemTypeOf } from "@shared/planningEngine";

export interface PlannedWorkBar {
  id: number;
  boqItemId: number;
  plannedQty: number;
  chainageFrom: number | null;
  chainageTo: number | null;
  unit?: string | null;
  canonicalUnit?: string | null;
}

const EPS = 0.001;

function overlaps(aF: number | null, aT: number | null, bF: number | null, bT: number | null): boolean {
  const af = aF ?? -Infinity, at = aT ?? Infinity;
  const bf = bF ?? -Infinity, bt = bT ?? Infinity;
  return Math.min(at, bt) - Math.max(af, bf) > EPS;
}

/**
 * Returns null when the item is not arrangement-eligible (no badge at all);
 * otherwise the worst-case execution state across the bars the entered
 * chainage range touches (arrangement_required wins).
 */
export function derivePlannedWorkExecutionState(opts: {
  item: { id: number } & Record<string, unknown>;
  chainageFrom: number | null;
  chainageTo: number | null;
  plannedQty: number | null;
  arrangements: ProjectArrangement[];
  allocations: ProjectBarAllocation[];
  bars: PlannedWorkBar[];
}): ExecutionStateResult | null {
  let category: "earthwork" | "bituminous" | null = null;
  try { category = executionArrangementCategoryForItem(opts.item as any); } catch { category = null; }
  if (category == null) return null;
  let itemType: string | null = null;
  if (category === "bituminous") {
    try { itemType = bituminousItemTypeOf(opts.item as any); } catch { itemType = null; }
  }

  const itemBars = opts.bars.filter(b => b.boqItemId === opts.item.id);
  const touched = (opts.chainageFrom != null || opts.chainageTo != null)
    ? itemBars.filter(b => overlaps(opts.chainageFrom, opts.chainageTo, b.chainageFrom, b.chainageTo))
    : itemBars;

  if (touched.length === 0) {
    // No programme bar covers this range — derive item-level coverage using a
    // synthetic scope (the planned quantity), so unlinked arrangements still count.
    const scope = Math.max(opts.plannedQty ?? 0, EPS);
    return deriveBarExecutionStateFromProject(opts.arrangements, opts.allocations, {
      barId: -1, boqItemId: opts.item.id, barPlannedQty: scope,
      unit: (opts.item as any).canonicalUnit ?? (opts.item as any).unit ?? "CUM",
      category, itemType,
    });
  }

  let worst: ExecutionStateResult | null = null;
  for (const bar of touched) {
    const r = deriveBarExecutionStateFromProject(opts.arrangements, opts.allocations, {
      barId: bar.id, boqItemId: bar.boqItemId, barPlannedQty: Number(bar.plannedQty ?? 0),
      unit: bar.canonicalUnit ?? bar.unit ?? "CUM", category, itemType,
    });
    if (r.state === "arrangement_required") return r; // worst case wins immediately
    if (!worst) worst = r;
  }
  return worst;
}
