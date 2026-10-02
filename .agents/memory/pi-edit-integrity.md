---
name: Purchase indent edit integrity
description: Approved PI edit boundaries and concurrency hazards around downstream receipt creation.
---

PI edits must preserve item identity, procurement tracking and surviving history. No-op and General Remarks-only edits preserve header approval/status; other genuine changes retain the existing reapproval behavior.

**Why:** The user approved this policy to allow harmless corrections without destroying ordered-item lineage or withdrawing approval.

**How to apply:** Keep edit-owned planning fields separate from workflow-owned tracking fields. Protect quantity, UOM, material identity and removal after activity. Do not broaden editable fields or receipt eligibility without approval.

A header marked ordered is not proof that every child item has ordering activity. A zero-approved, untouched child can still exist beneath it.

**Why:** An executable receipt/edit interleaving exposed an item that could be removed while physical receipt creation was in progress. The physical stock operation and later PI-link operation can commit separately.

**How to apply:** Prove protection using authoritative item-level evidence and coordinated transactions. A later missing-item check does not undo an earlier committed receipt. Do not claim multi-connection race safety from serialized PGlite tests, or wrap independently committing receipt helpers in a transaction and assume atomicity.

The approved receipt guard rejects untouched, unapproved items before stock creation. Eligible receipt admission needs durable, truthful attempt evidence, not just a snapshot of positive approval.

**Why:** Approval can later be reduced to zero while receipt creation is in progress. Without durable evidence, a subsequent PI edit can then consider the item removable. The user approved restricting receipt eligibility to close this race.

**How to apply:** Preserve the distinction between an attempt and a completed physical receipt. An attempt must not increase delivered quantities or claim successful stock posting. Its audit evidence must survive failed receipt creation and continue protecting the item’s identity and history.