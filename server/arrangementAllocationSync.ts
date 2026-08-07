/**
 * Instruction 030 Part A — server-side auto-sync of arrangement → bar allocations.
 *
 * On approval (and via one-time startup backfill for previously-approved
 * arrangements), distribute an arrangement's unassigned quantity to the
 * Work Programme bars whose chainage overlaps its range. Pure planning lives
 * in shared/arrangementAutoAllocation.ts; this module wraps it in a
 * FOR UPDATE transaction so concurrent allocation writes serialize.
 */
import { asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  earthworkArrangements,
  earthworkArrangementProgrammeAllocations,
  workProgramBars,
} from "@shared/schema";
import {
  planArrangementBarAutoAllocations,
  AUTO_SYNC_STATUSES,
} from "@shared/arrangementAutoAllocation";

export interface AutoSyncResult {
  created: number;
  updated: number;
  removed: number;
  allocatedQty: number;
  shortfall: number;
}

/**
 * Auto-allocate an arrangement's unassigned quantity to overlapping bars.
 * Idempotent — never reduces or replaces existing (manual) allocations.
 */
export async function syncArrangementBarAllocations(
  arrangementId: number,
  userId: number | null,
): Promise<AutoSyncResult> {
  return db.transaction(async (tx) => {
    const [arr] = await tx.select().from(earthworkArrangements)
      .where(eq(earthworkArrangements.id, arrangementId)).for("update");
    if (!arr || !AUTO_SYNC_STATUSES.has(arr.status)) {
      return { created: 0, updated: 0, removed: 0, allocatedQty: 0, shortfall: 0 };
    }

    const itemIds = new Set<number>();
    if (Array.isArray(arr.boqItemAllocations) && (arr.boqItemAllocations as any[]).length > 0) {
      for (const a of arr.boqItemAllocations as Array<{ boqItemId: number }>) itemIds.add(Number(a.boqItemId));
    } else if (arr.boqItemId != null) {
      itemIds.add(Number(arr.boqItemId));
    }
    if (itemIds.size === 0) return { created: 0, updated: 0, removed: 0, allocatedQty: 0, shortfall: 0 };

    // Lock candidate bars too (id order → deterministic, deadlock-safe). Both
    // this path and the manual applyBarAllocationTx path take locks in the
    // same arrangement → bar order, so concurrent allocation writes for
    // DIFFERENT arrangements serialize on the shared bar rows and cannot both
    // observe the same remaining bar capacity (review fix).
    const bars = await tx.select().from(workProgramBars)
      .where(inArray(workProgramBars.boqItemId, Array.from(itemIds)))
      .orderBy(asc(workProgramBars.id))
      .for("update");

    // All allocations touching those bars OR this arrangement, with owning status.
    const barIds = bars.map(b => b.id);
    const allocRows = await tx.select({
      alloc: earthworkArrangementProgrammeAllocations,
      status: earthworkArrangements.status,
    })
      .from(earthworkArrangementProgrammeAllocations)
      .innerJoin(earthworkArrangements, eq(earthworkArrangementProgrammeAllocations.arrangementId, earthworkArrangements.id))
      .where(or(
        eq(earthworkArrangementProgrammeAllocations.arrangementId, arr.id),
        barIds.length > 0 ? inArray(earthworkArrangementProgrammeAllocations.programmeBarId, barIds) : undefined,
      ));

    const plan = planArrangementBarAutoAllocations(
      {
        id: arr.id,
        boqProjectId: arr.boqProjectId,
        status: arr.status,
        allocatedQty: Number(arr.allocatedQty ?? 0),
        boqItemId: arr.boqItemId != null ? Number(arr.boqItemId) : null,
        boqItemAllocations: arr.boqItemAllocations as any,
        chainageFrom: arr.chainageFrom != null ? Number(arr.chainageFrom) : null,
        chainageTo: arr.chainageTo != null ? Number(arr.chainageTo) : null,
      },
      bars.map(b => ({
        id: b.id,
        boqProjectId: b.boqProjectId,
        boqItemId: b.boqItemId,
        plannedQty: Number(b.plannedQty ?? 0),
        chainageFrom: b.chainageFrom != null ? Number(b.chainageFrom) : null,
        chainageTo: b.chainageTo != null ? Number(b.chainageTo) : null,
      })),
      allocRows.map(r => ({
        id: r.alloc.id,
        arrangementId: r.alloc.arrangementId,
        programmeBarId: r.alloc.programmeBarId,
        boqItemId: r.alloc.boqItemId,
        allocatedQty: Number(r.alloc.allocatedQty),
        arrangementStatus: r.status,
        source: (r.alloc as any).source ?? "manual",
      })),
    );

    let created = 0, updated = 0, removed = 0, allocatedQty = 0;
    for (const action of plan.actions) {
      if (action.remove && action.existingAllocId != null) {
        // Stale AUTO row after a scope revision — manual rows never get here.
        await tx.delete(earthworkArrangementProgrammeAllocations)
          .where(eq(earthworkArrangementProgrammeAllocations.id, action.existingAllocId));
        removed++;
      } else if (action.existingAllocId != null) {
        const [existing] = await tx.select().from(earthworkArrangementProgrammeAllocations)
          .where(eq(earthworkArrangementProgrammeAllocations.id, action.existingAllocId));
        if (!existing) continue;
        await tx.update(earthworkArrangementProgrammeAllocations)
          .set({ allocatedQty: Math.max(0, Number(existing.allocatedQty) + action.qty), updatedAt: new Date() })
          .where(eq(earthworkArrangementProgrammeAllocations.id, action.existingAllocId));
        updated++;
      } else {
        await tx.insert(earthworkArrangementProgrammeAllocations).values({
          arrangementId: arr.id,
          programmeBarId: action.programmeBarId,
          boqItemId: action.boqItemId,
          allocatedQty: action.qty,
          source: "auto",
          createdBy: userId,
        } as any);
        created++;
      }
      if (action.qty > 0) allocatedQty += action.qty;
    }

    return { created, updated, removed, allocatedQty, shortfall: plan.shortfall };
  });
}

/**
 * One-time-style startup backfill: auto-allocate operational arrangements that
 * have NO bar allocations at all (any arrangement with at least one allocation
 * — manual or previous auto-sync — is left untouched, so manual choices and
 * deliberate unlink-then-relink flows are never overridden for linked rows).
 */
export async function backfillArrangementBarAllocations(): Promise<{ arrangements: number; created: number; shortfallCount: number }> {
  // Schema guard: the source marker distinguishes auto-created rows (safe to
  // reconcile on scope revisions) from manual links (never touched).
  await db.execute(sql`ALTER TABLE earthwork_arrangement_programme_allocations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`);
  const arrs = await db.select({
    id: earthworkArrangements.id,
    status: earthworkArrangements.status,
  }).from(earthworkArrangements);
  const candidates = arrs.filter(a => AUTO_SYNC_STATUSES.has(a.status));
  if (candidates.length === 0) return { arrangements: 0, created: 0, shortfallCount: 0 };

  const allocs = await db.select({
    arrangementId: earthworkArrangementProgrammeAllocations.arrangementId,
  }).from(earthworkArrangementProgrammeAllocations);
  const hasAlloc = new Set(allocs.map(a => a.arrangementId));

  let arrangements = 0, created = 0, shortfallCount = 0;
  for (const a of candidates) {
    if (hasAlloc.has(a.id)) continue;
    try {
      const r = await syncArrangementBarAllocations(a.id, null);
      if (r.created > 0 || r.updated > 0) { arrangements++; created += r.created; }
      if (r.shortfall > 0.001) shortfallCount++;
    } catch (e) {
      console.error(`Backfill: arrangement ${a.id} auto-allocation failed:`, e);
    }
  }
  return { arrangements, created, shortfallCount };
}
