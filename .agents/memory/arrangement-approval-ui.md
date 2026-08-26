---
name: Arrangement approval UI
description: Permission and UI consistency rule for ordinary Execution Arrangement approval.
---

Ordinary submitted-to-approved Execution Arrangement transitions use the existing `qto_boq.edit` permission and canonical arrangement PATCH lifecycle. This differs from pending-revision decisions, which use the `qto_boq.approve` action.

**Why:** The Execution Arrangements register had a separate detail popup that omitted lifecycle actions even though the canonical arrangement dialog and backend supported approval for every arrangement type.

**How to apply:** Any arrangement-detail surface must show ordinary status actions according to the same status and edit-permission rules and call the canonical endpoint; never add type-specific approval mechanisms.