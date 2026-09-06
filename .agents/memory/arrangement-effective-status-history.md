---
name: Arrangement effective status history
description: Durable contract for explicit, append-only effective-date events on Execution Arrangement lifecycle changes.
---

Execution Arrangement status changes append a typed `status_change` event to the existing revision history with the prior/current status, explicit business effective date, recording time, actor, and reason. Never infer the business date from `updatedAt`.

Arrangement lifecycle status belongs to the whole vendor arrangement. Programme-bar outcomes are separate per-bar evidence and must never automatically change the parent arrangement status.

**Why:** Recording time and effective time can differ. A cancellation recorded later must still allow historical transactions before its confirmed effective date to retain the arrangement.

**How to apply:** Preserve every prior history entry. An old cancelled arrangement may receive exactly one same-status confirmation event after PM/Admin supplies the missing effective date; hide and reject legacy confirmation once a valid cancelled status event exists. All future transitions capture the date in the normal lifecycle form. Do not guess or bulk-backfill legacy dates. Date-effective DPR/trip resolution is a separate downstream concern.