---
name: Explicit trip arrangement links
description: Owner-approved own-source inclusion and deliberate linkage, distinct from material-source assignment.
---

Bulk arrangement linking includes own-source trips. The bulk material-source
tool must retain its exclusion of own-source trips.

**Why:** The owner explicitly chose “Include own-source trips; leave the
material-source tool unchanged.” An HLC-owned borrow source can still have a
vendor execution arrangement; that does not make HLC a material vendor.

**How to apply:** Share ordinary matching semantics between these tools, but
retain their different own-source eligibility. Never infer or auto-assign a
trip's arrangement. Existing-trip work-context corrections must preserve
untouched links, not reuse entry-time automatic selection or clearing.
Trip linkage is operational/commercial context, not BOQ-earned progress.

New trip links must use the existing receipt-operational status set, evaluated
on the trip's date. Planning auto-allocation's on-hold inclusion is not a receipt
linking rule. Keep historical links visible and unchanged; do not infer or
backfill approval dates for old arrangements.

**Why:** The owner requires commercial validity before billing uses these links,
while reserving correction of existing historical links to the owner.

**How to apply:** Route new-link checks through the shared trip-link date rule.
Existing-trip editors must not use entry-time auto-selection or clearing.
Read-only inventories include invalid historical links without repairing them.
