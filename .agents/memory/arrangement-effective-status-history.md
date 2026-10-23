---
name: Arrangement effective status history
description: Durable contract for explicit, append-only effective-date events on Execution Arrangement lifecycle changes.
---

Execution Arrangement status changes append a typed `status_change` event to the existing revision history with the prior/current status, explicit business effective date, recording time, actor, and reason. Never infer the business date from `updatedAt`.

Arrangement lifecycle status belongs to the whole vendor arrangement. Programme-bar outcomes are separate per-bar evidence and must never automatically change the parent arrangement status.

**Why:** Recording time and effective time can differ. A cancellation recorded later must still allow historical transactions before its confirmed effective date to retain the arrangement. Cancellation is inclusive: an arrangement is inactive on the effective cancellation date itself.

**How to apply:** Preserve every prior history entry. An old cancelled arrangement may receive exactly one same-status confirmation event after PM/Admin supplies the missing effective date; hide and reject legacy confirmation once a valid cancelled status event exists. All future transitions capture the date in the normal lifecycle form. Do not guess or bulk-backfill legacy dates. Persist historical arrangement IDs, but exclude inactive links from current DPR cut/fill, receipt, trip, source, and Required Today resolution using the relevant business date.

Completed arrangements may receive commercial-term corrections in place without reopening lifecycle status. Updated terms affect not-yet-billed trip pricing only; existing saved bill amounts, statuses, and snapshots remain frozen.

**Why:** The owner needs to restore pricing for trips linked to completed arrangements that lacked a declared commercial basis, without reactivating the arrangement or changing historical bills.

**How to apply:** Keep commercial edits separate from lifecycle transitions. Preserve `completed` during the save, and do not rewrite existing bill snapshots when future trip pricing changes.