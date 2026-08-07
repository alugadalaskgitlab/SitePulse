/**
 * Instruction 030 Part A — pure planner for auto-creating arrangement→bar
 * allocations on approval.
 *
 * Arrangements are item-level records; the Gantt per-reach badge reads the
 * earthwork_arrangement_programme_allocations table. Before Instruction 030
 * that table was only populated manually, so approved arrangements left every
 * bar stuck on "Arrangement Required". This planner distributes an approved
 * arrangement's UNASSIGNED quantity across the programme bars whose chainage
 * overlaps the arrangement's range, capped by each bar's remaining plannable
 * quantity and (for multi-source arrangements) the per-BOQ-item split.
 *
 * Design rules:
 *  - Never touches or reduces existing allocations (manual links are preserved);
 *    only the arrangement's remaining unassigned quantity is distributed.
 *  - Idempotent: running twice yields no new actions (remainder becomes 0).
 *  - Partially covered bars simply receive less than their planned quantity —
 *    they stay flagged with a shortfall by the existing execution-state logic.
 *  - Pure: no IO. The server wraps this in a FOR UPDATE transaction.
 */

export interface AutoAllocArrangement {
  id: number;
  boqProjectId: number;
  status: string;
  allocatedQty: number;
  boqItemId: number | null;
  boqItemAllocations?: Array<{ boqItemId: number; qty: number }> | null;
  chainageFrom: number | null;
  chainageTo: number | null;
}

export interface AutoAllocBar {
  id: number;
  boqProjectId: number;
  boqItemId: number;
  plannedQty: number;
  chainageFrom: number | null;
  chainageTo: number | null;
}

export interface AutoAllocExisting {
  id: number;
  arrangementId: number;
  programmeBarId: number;
  boqItemId: number;
  allocatedQty: number;
  /** Status of the OWNING arrangement (cancelled/rejected rows don't consume bar capacity). */
  arrangementStatus?: string | null;
  /** "auto" rows may be reconciled (moved/removed) on scope revisions; "manual"/unknown rows are never touched. */
  source?: string | null;
}

export interface AutoAllocAction {
  programmeBarId: number;
  boqItemId: number;
  /** Quantity to ADD to this bar for this arrangement (negative = reduce an auto row). */
  qty: number;
  /** When set, update this existing allocation row (qty += qty) instead of inserting. */
  existingAllocId?: number;
  /** Delete the existing auto row entirely (stale after a scope revision). */
  remove?: boolean;
}

export interface AutoAllocPlan {
  actions: AutoAllocAction[];
  /** Arrangement quantity that could not be placed on any overlapping bar. */
  shortfall: number;
}

/** Statuses whose allocations consume bar capacity / arrangement remainder. */
const INACTIVE = new Set(["cancelled", "rejected"]);

/** Arrangement statuses eligible for auto-sync (operational lifecycle). */
export const AUTO_SYNC_STATUSES = new Set(["approved", "mobilisation_pending", "in_progress", "on_hold"]);

const EPS = 0.001;

/** Open-ended chainage overlap. A null bound means "unbounded on that side". */
export function chainageRangesOverlap(
  aFrom: number | null, aTo: number | null,
  bFrom: number | null, bTo: number | null,
): boolean {
  const af = aFrom ?? -Infinity, at = aTo ?? Infinity;
  const bf = bFrom ?? -Infinity, bt = bTo ?? Infinity;
  // Touching-only ranges (bt === af) do not count as overlap.
  return Math.min(at, bt) - Math.max(af, bf) > EPS;
}

export function planArrangementBarAutoAllocations(
  arrangement: AutoAllocArrangement,
  bars: AutoAllocBar[],
  existingAllocations: AutoAllocExisting[],
): AutoAllocPlan {
  const empty: AutoAllocPlan = { actions: [], shortfall: 0 };
  if (!AUTO_SYNC_STATUSES.has(arrangement.status)) return empty;

  // Per-item quantity budget: multi-source split when present, else single item.
  const itemBudget = new Map<number, number>();
  if (Array.isArray(arrangement.boqItemAllocations) && arrangement.boqItemAllocations.length > 0) {
    for (const a of arrangement.boqItemAllocations) {
      const id = Number(a.boqItemId);
      if (Number.isFinite(id) && Number(a.qty) > 0) itemBudget.set(id, (itemBudget.get(id) ?? 0) + Number(a.qty));
    }
  } else if (arrangement.boqItemId != null) {
    itemBudget.set(Number(arrangement.boqItemId), Number(arrangement.allocatedQty) || 0);
  }
  if (itemBudget.size === 0) return empty;

  const active = existingAllocations.filter(a => !INACTIVE.has(String(a.arrangementStatus ?? "")));

  // Candidate bars: same project, item in budget, chainage overlap.
  const candidates = bars
    .filter(b => b.boqProjectId === arrangement.boqProjectId)
    .filter(b => itemBudget.has(b.boqItemId))
    .filter(b => {
      // A bar with no chainage at all only matches an arrangement with no range
      // (whole-item arrangements); with a bounded arrangement we cannot tell
      // where the bar sits, so leave it flagged rather than guess.
      if (b.chainageFrom == null && b.chainageTo == null) {
        return arrangement.chainageFrom == null && arrangement.chainageTo == null;
      }
      return chainageRangesOverlap(arrangement.chainageFrom, arrangement.chainageTo, b.chainageFrom, b.chainageTo);
    })
    .sort((x, y) => (x.chainageFrom ?? Infinity) - (y.chainageFrom ?? Infinity) || x.id - y.id);
  const candidateIds = new Set(candidates.map(b => b.id));

  const actions: AutoAllocAction[] = [];

  // ── Reconcile this arrangement's own rows against the (possibly revised) scope.
  // AUTO rows on bars that no longer fit (chainage moved, item dropped from the
  // split) are removed, freeing their quantity for redistribution. MANUAL rows
  // are never touched, even when stale — they still consume budget/capacity.
  const ownActive = active.filter(a => a.arrangementId === arrangement.id);
  const keptOwn: AutoAllocExisting[] = [];
  for (const a of ownActive) {
    if (String(a.source ?? "manual") === "auto" && !candidateIds.has(a.programmeBarId)) {
      actions.push({ programmeBarId: a.programmeBarId, boqItemId: a.boqItemId, qty: -Number(a.allocatedQty), existingAllocId: a.id, remove: true });
    } else {
      keptOwn.push(a);
    }
  }

  // Per-item overrun after a split reduction: shrink kept AUTO rows (newest
  // first) until the item budget fits. Manual rows are never reduced.
  const reducedQty = new Map<number, number>(); // allocId → new effective qty
  for (const [itemId, budget] of Array.from(itemBudget.entries())) {
    let consumed = keptOwn.filter(a => a.boqItemId === itemId).reduce((s, a) => s + Number(a.allocatedQty), 0);
    if (consumed <= budget + EPS) continue;
    const autoRows = keptOwn.filter(a => a.boqItemId === itemId && String(a.source ?? "manual") === "auto").sort((x, y) => y.id - x.id);
    for (const row of autoRows) {
      if (consumed <= budget + EPS) break;
      const cur = Number(row.allocatedQty);
      const cut = Math.min(cur, consumed - budget);
      const next = Math.round((cur - cut) * 1000) / 1000;
      consumed -= cut;
      if (next <= EPS) {
        actions.push({ programmeBarId: row.programmeBarId, boqItemId: row.boqItemId, qty: -cur, existingAllocId: row.id, remove: true });
        reducedQty.set(row.id, 0);
      } else {
        actions.push({ programmeBarId: row.programmeBarId, boqItemId: row.boqItemId, qty: -(Math.round(cut * 1000) / 1000), existingAllocId: row.id });
        reducedQty.set(row.id, next);
      }
    }
  }
  const effQty = (a: AutoAllocExisting) => reducedQty.has(a.id) ? reducedQty.get(a.id)! : Number(a.allocatedQty);

  // Subtract kept rows (post-reconciliation) from per-item budgets and overall
  // remainder. Defensive: the distributable total can never exceed the sum of
  // per-item budgets — a stale/malformed boqItemAllocations split whose sum is
  // below allocatedQty must not let the planner exceed the split.
  const budgetSum = Array.from(itemBudget.values()).reduce((s, q) => s + q, 0);
  let remaining = Math.min(Number(arrangement.allocatedQty) || 0, budgetSum);
  for (const a of keptOwn) {
    remaining -= effQty(a);
    if (itemBudget.has(a.boqItemId)) {
      itemBudget.set(a.boqItemId, (itemBudget.get(a.boqItemId) ?? 0) - effQty(a));
    }
  }
  if (remaining <= EPS) return { actions, shortfall: 0 };

  // Capacity consumed on each bar by ALL active allocations (any arrangement),
  // using post-reconciliation quantities for this arrangement's own rows.
  const removedIds = new Set(actions.filter(x => x.remove).map(x => x.existingAllocId));
  const usedOnBar = new Map<number, number>();
  for (const a of active) {
    if (removedIds.has(a.id)) continue;
    const q = a.arrangementId === arrangement.id ? effQty(a) : Number(a.allocatedQty);
    usedOnBar.set(a.programmeBarId, (usedOnBar.get(a.programmeBarId) ?? 0) + q);
  }
  // This arrangement's surviving row per bar (update instead of duplicate insert).
  const ownRowOnBar = new Map<number, AutoAllocExisting>();
  for (const a of ownActive) {
    if (!removedIds.has(a.id)) ownRowOnBar.set(a.programmeBarId, a);
  }
  for (const bar of candidates) {
    if (remaining <= EPS) break;
    const itemLeft = itemBudget.get(bar.boqItemId) ?? 0;
    if (itemLeft <= EPS) continue;
    const barCap = Math.max(0, (Number(bar.plannedQty) || 0) - (usedOnBar.get(bar.id) ?? 0));
    const give = Math.min(remaining, itemLeft, barCap);
    if (give <= EPS) continue;
    const qty = Math.round(give * 1000) / 1000;
    const own = ownRowOnBar.get(bar.id);
    actions.push({ programmeBarId: bar.id, boqItemId: bar.boqItemId, qty, existingAllocId: own?.id });
    remaining -= qty;
    itemBudget.set(bar.boqItemId, itemLeft - qty);
    usedOnBar.set(bar.id, (usedOnBar.get(bar.id) ?? 0) + qty);
  }

  return { actions, shortfall: Math.max(0, Math.round(remaining * 1000) / 1000) };
}
