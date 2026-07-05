---
name: Sticky thead cross-browser bug
description: position:sticky applied directly to a <thead> element causes header/row overlap in some browsers; apply sticky per-<th> instead.
---

`position: sticky` set directly on a `<thead>` element (rather than on each `<th>`) is unreliable across browsers — some browsers fail to clip body rows underneath it, causing the first data row to visually bleed through/overlap the header during scroll.

**Why:** SiteLog's Work Programme tables (Monthly Plan, Procurement shortage-check, Plan vs Actual) originally set `className="sticky top-14 z-10"` on `<thead>` for page-level scroll (not an inner scroll container). This produced a visible overlap bug where a data row rendered on top of the header.

**How to apply:** Move `sticky top-<offset> z-<n>` onto every `<th>` individually (first/left-frozen column additionally gets `left-0` and a higher z-index, e.g. z-30 vs z-20 for the rest) instead of on `<thead>`. This works consistently in every browser and preserves page-level (not inner-container) scroll semantics. This pattern was already proven working in SiteLog's other demand tables (Materials/Equipment/Labour in WorkDemand.tsx) before being applied to Monthly Plan, Procurement, and Plan vs Actual.
