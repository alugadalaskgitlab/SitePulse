---
name: Arrangement bar-level phasing
description: Instruction 026 — arrangements link to work programme bars; exclusion phased by bar months; revision guard; atomic allocation validation
---

# Arrangement bar-level phasing (Instruction 026)

- `earthwork_arrangement_programme_allocations` links arrangements to `work_program_bars` with an allocated qty. Engine input: `ArrangementDemandInput.programmeAllocations`.
- `arrangementExclusionEffect()` in shared/planningEngine.ts returns `{fraction, monthFraction(m)}`: bar-linked qty excluded per that bar's month shares (`barMonthShares` from calculateMonthlyDistribution); unlinked remainder falls back to legacy proportional exclusion. **No double exclusion**: linking shifts timing only, totals unchanged.
- The three monthly demand loops (equipment hours, diesel, labour) multiply by `eff.monthFraction(month)`; totals use the flat fraction. monthFraction clamped ≥ 0.
- `validateBarAllocation()` is the pure validation helper shared by routes and tests (error codes incl. BAR_ALLOCATION_EXCEEDS_PLANNED_QTY / ARRANGEMENT_ALLOCATION_TOTAL_MISMATCH with `remainingQty`).

**Concurrency rule:** allocation create/update runs inside `db.transaction` with `SELECT … FOR UPDATE` on the arrangement row (`applyBarAllocationTx` in routes.ts). Check-then-write validation without this lock over-allocates under concurrent requests — verified live with parallel curls.

**Revision guard (§17):** PATCH on operational arrangements (approved/mobilisation/in_progress/on_hold) touching commercial fields returns 409 `ARRANGEMENT_REVISION_REQUIRES_APPROVAL` unless `saveIntent:"revise"` → stored in `pendingRevision` (old values keep driving demand) until `revisionAction: approve|discard`.
**Why bar linking is exempt:** §7/§22 require assigning existing approved legacy arrangements to stretches; linking changes exclusion timing only, not commercial terms. All allocation changes are audit-logged instead.

**Procurement is downstream (§14–16):** Work Demand earthwork cell shows "Manage Execution Plan →" to Work Programme as primary action; earthwork rows must never count as mapping warnings (filter on `procurementStatus === earthwork_*` in WorkDemand.tsx counts/badges).
Client cache: `invalidateArrangementQueries()` in client/src/lib/arrangementCache.ts is the single invalidation helper after any arrangement/allocation mutation.
