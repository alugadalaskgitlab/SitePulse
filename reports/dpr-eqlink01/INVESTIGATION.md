# DPR-EQLINK-01 — investigation checkpoint, not patch completion

## A: evidence and approval boundary

The read-only development audit found **zero dangling equipment links** in
`sitelog_dev`. No exact affected owner DPR/log/usage can therefore be identified
from this database. Production was not accessed.

In `server/storage.ts`, the submitted update path deletes equipment logs
(around 4124), reinserts equipment payload rows, and unconditionally calls
`finalizeDprEquipmentUsageTx` under `isSubmitting` (around 4192). Log IDs can
therefore change even on an unrelated correction; copied `plantUsageId` values
continue pointing at the same usage. The closure loop locks and loads every
positive usage ID before any unchanged/movement/clone short circuit.
Consequently unchanged equipment does not avoid the missing-usage check.

Closure is not uniformly a no-op: it can update closure actor/time and DPR
ownership, synchronize equipment facts through `_updateEquipmentUsageTxn`,
and materialize unlinked Site equipment. Closed non-owned rows skip updates;
some unchanged moved-source copies also skip updates, but only after the
linked usage has been found. The finalizer queries movement successors; this
loop does not itself create successors. Canonical usage changes feed equipment,
fuel and hire consumers. Blanket removal of closure is unsafe.

Proposed narrow approach, pending approval: retain existence/date/ownership
validation and locking, compare normalized stored equipment facts and relevant
DPR context, then avoid only redundant mutation for proven unchanged rows.
Changed rows retain current processing. This cannot make a dangling link save:
the instruction explicitly requires that conflict to remain. Skipping existence
validation would contradict that requirement and is not proposed.

Potential cause, NOT a proven explanation of the owner's incident:
`deleteEquipmentUsage` checks for a successor but has no equipment-log reference
guard before deleting usage. `equipment_logs.plant_usage_id` is declared as an
integer without a foreign key. This permits dangling links structurally.
It does not establish who deleted the missing row or when.

## B: restoration

No affected row exists in the inspected development dataset. Restoration
confidence is therefore **undetermined**, not “cannot be restored.”
The owner's named DPR/log and matching deletion/movement evidence are needed.
No candidate was guessed, no usage row reconstructed and no data repaired.
Do not build detach based on this absence of evidence.

## D: read-only audit

Executed within BEGIN READ ONLY, after verifying current_database() exactly
equals sitelog_dev:

```sql
SELECT l.id, l.dpr_id, d.date, d.site, d.dpr_status,
       l.machine, l.plant_usage_id
FROM equipment_logs l
LEFT JOIN equipment_usage u ON u.id = l.plant_usage_id
LEFT JOIN dprs d ON d.id = l.dpr_id
WHERE l.plant_usage_id IS NOT NULL AND u.id IS NULL
ORDER BY l.id;
```

Result: `[]`; count: **0**. Transaction rolled back. Owner data remains the
real incident test. No corrective feature was written before this report.

## Outstanding acceptance

Parts C and D1 are not implemented; P1–P8, Z1 checksums, full-suite and build
verification are not claimed. No fixtures were created, so none need cleanup.
No app changes, startup changes, permissions changes, or data writes occurred.
This checkpoint honors the explicit investigation-first gate rather than
claiming the requested emergency fix is complete.

The read-only Publish preview is saved alongside this report. No publication.
Git push remains subject to repository authentication; see delivery outcome.
