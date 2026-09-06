---
name: Arrangement effective status history
description: Durable contract for explicit, append-only effective-date events on Execution Arrangement lifecycle changes.
---

Execution Arrangement status changes append a typed `status_change` event to the existing revision history with the prior/current status, explicit business effective date, recording time, actor, and reason. Never infer the business date from `updatedAt`.

**Why:** Recording time and effective time can differ. A cancellation recorded later must still allow historical transactions before its confirmed effective date to retain the arrangement.

**How to apply:** Preserve every prior history entry. Existing cancelled arrangements receive a same-status confirmation event only after PM/Admin supplies the effective date; do not guess or bulk-backfill legacy dates. Date-effective DPR/trip resolution is a separate downstream concern.