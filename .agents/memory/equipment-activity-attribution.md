---
name: Equipment activity attribution
description: Durable parent-versus-child rules for splitting one equipment usage across BOQ activities.
---

# Equipment Activity Attribution

One equipment log remains the single physical usage record for the machine and day. When activity allocations exist, their hours are authoritative for BOQ and programme attribution; the legacy parent BOQ link is used only when no child allocations exist.

**Why:** Diesel, hire attendance, meters, maintenance, breakdowns, movement, and equipment-day totals are physical parent facts. Counting one copy per child would inflate operational and commercial records.

**How to apply:** Sum child hours by BOQ for demand/report attribution, but process every operational fact once from the parent. Partial allocation is valid and unallocated time remains unattributed. Never spread parent distance or hours into children that users did not record.

Omitted allocation data means “preserve existing children” during replacement/version flows. An explicit empty list means “clear the children.” Legacy parent-only rows and clones must keep their fallback attribution when the hydrated relation is merely empty.

**Why:** Drizzle hydrates absent child relations as empty arrays, while clients also need an intentional clear operation. Treating both identically silently removes legacy attribution during ordinary edits.

**How to apply:** Preserve omission separately from explicit clearing. The server recalculates every child duration from same-day clock start/end times and validates overlap plus the parent clock window. Meter working hours are display-only and must never cap these clock segments. Programme links are silently reused only when the DPR progress context gives one unique match; otherwise retain null without prompting or guessing.