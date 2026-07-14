---
name: BOQ Canonical Unit System
description: How canonical unit normalisation works end-to-end, and which layers to fix when raw units surface in the UI.
---

## The Rule
`shared/boqNormalise.ts` (`canonicalizeUnit`) is the single source of truth. Every BOQ unit display must come from `canonical_unit` (DB column), not raw `unit`.

## DB Setup
- `ensureBoqCanonicalUnit()` runs at startup: backfills any row where `canonical_unit IS NULL` OR starts with a digit (stale import artifact).
- 286 units + 117 work_categories fixed on first run.

## Fix Pattern
**Frontend:** `(item as any).canonicalUnit ?? item.unit`
**Storage functions:** `item.canonicalUnit ?? item.unit` (or SQL `COALESCE(canonical_unit, unit)`)
**planningEngine breakdown items:** `item.canonicalUnit ?? item.unit` (BomInputItem interface now includes `canonicalUnit?: string | null`)

## Locations Fixed (complete as of Jul 2026)
- **storage.getWorkProgramBars** — selects `canonicalUnit` from the JOIN alongside raw `unit`
- **storage.getPlanVsActual** — returns `unit: item.canonicalUnit ?? item.unit`
- **storage.getBoqRevisions** — revision items use `COALESCE(canonical_unit, unit)`
- **planningEngine.ts** — all 3 breakdown push locations (materials/equipment/labour) use canonical; BomInputItem interface has `canonicalUnit?: string | null`
- **routes.ts computeProjectBom** — `deriveMaterialsFromLayerConfig` call uses canonical
- **Frontend pages** — WorkProgramme, SiteEntry, BoqItemRecipes, WorkDemand, BoqProjectDetail (form init + revision display), ResourceReview, FieldHome all use canonical pattern

## Why
Raw imported data often has "1 Cum", "1.00 Cum", "Cu.m" etc. as the unit string. The canonical_unit column stores the normalised form ("Cum"). Always read canonical_unit, not the raw unit column, for any user-facing display.

## How to Apply
When adding a new screen that displays BOQ item units: always use `canonicalUnit ?? unit` pattern. When adding a new storage function that returns BOQ items: include `canonicalUnit` in the select, or use SQL COALESCE.
