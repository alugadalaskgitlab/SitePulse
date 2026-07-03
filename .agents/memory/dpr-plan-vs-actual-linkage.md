---
name: DPR Plan vs Actual linkage (Phase 3)
description: How planned vs actual comparison for equipment/labour was wired into DPR entry and BOM & Demand, and why materials were excluded.
---

## What exists
- `equipmentLogs` and `labourLogs` (in `shared/schema.ts`) carry nullable `boqItemId` + `structureId` columns so a DPR usage row can optionally be tied back to a Work Programme BOQ item / structure location.
- SiteEntry.tsx (the live DPR form) exposes an optional "Link to Work Item" selector on equipment and labour rows, with an inline "Planned: X" chip computed via `calculateBomDemand` scoped to that single item + its programme bars.
- WorkDemand.tsx (BOM & Demand page) has a "Plan vs Actual" tab that aggregates linked equipment hours (from opening/closing meter or start/end time) and labour days (row `count`) per BOQ item, compared against `calculateBomDemand` planned totals for that item, with variance badges and an expandable per-equipment/per-designation breakdown.

## Why materials were excluded
**Materials are NOT captured on the DPR form at all** — `SiteEntry.tsx`'s `materials` state array is permanently empty (dead code); real material entry happens in `SiteMaterialTrips.tsx` / `SiteMaterialsReceived.tsx`, which are keyed by site name string and have no BOQ project/item linkage. Reviving that flow to support BOQ-item linkage was judged out of proportion to this task's scope, so `materialLogs` got the same `boqItemId`/`structureId` columns for schema completeness, but the Plan vs Actual UI explicitly notes materials aren't compared yet.

**Why:** avoid silently showing an always-empty/misleading "actual materials" column; be explicit about the gap instead.
**How to apply:** if a future task wants real material plan-vs-actual, the real work is reviving/re-linking the SiteMaterialTrips flow to BOQ items — not just reading `materialLogs`.
