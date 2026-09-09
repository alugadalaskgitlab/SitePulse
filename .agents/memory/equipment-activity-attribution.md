---
name: Equipment activity attribution
description: Durable parent-versus-child rules for splitting one equipment usage across BOQ activities.
---

# Equipment Activity Attribution

One equipment log remains the single physical usage record for the machine and day. New assignments store physical clock segments separately from their BOQ links, allowing one segment to credit several BOQs while its physical duration counts once. Legacy flat allocations remain fallback-only.

**Why:** Diesel, hire attendance, meters, maintenance, breakdowns, movement, and equipment-day totals are physical parent facts. Counting one copy per child would inflate operational and commercial records.

**How to apply:** Sum each segment’s full duration into every explicitly linked BOQ for demand matching, but sum the segment only once for physical time and process every operational fact once from the parent. Partial assignment is valid and unassigned time remains unattributed. Never split or duplicate actual cost, diesel, hire, distance, meters, or breakdowns across BOQ links.

Omitted assignment data means “preserve existing children” during replacement/version flows. An explicit empty normalized list means “clear the children.” Normalized segments win only when present or explicitly supplied without a legacy array; an empty hydrated normalized relation must never erase non-empty legacy allocations.

**Why:** Drizzle hydrates absent child relations as empty arrays, while clients also need an intentional clear operation. Treating both identically silently removes legacy attribution during ordinary edits.

**How to apply:** Read normalized segments first and fall back to unchanged legacy rows when normalized segments are absent; do not bulk-backfill historical DPRs. Convert one equipment log only through an explicit edit/save. Recalculate every segment duration from same-day clock times and validate overlap between physical segments, duplicate BOQs within a segment, and the parent clock window. Meter working hours never cap clock segments. Programme links are silently reused only for one unique DPR-progress match; otherwise retain null.