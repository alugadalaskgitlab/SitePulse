---
name: BOQ Canonical Unit System
description: How canonical unit normalisation works end-to-end, and which layers to fix when raw units surface in the UI.
---

## The Rule
`shared/boqNormalise.ts` (`canonicalizeUnit`) is the spelling-normalization authority. For DPR credit and valuation, normalize the saved contractual `unit`; the derived `canonical_unit` can be stale after edits and must not select a different destination unit.

## DB Setup
- `ensureBoqCanonicalUnit()` runs at startup: backfills any row where `canonical_unit IS NULL` OR starts with a digit (stale import artifact).
- 286 units + 117 work_categories fixed on first run.

## Fix Pattern
**DPR credit/valuation:** normalize the saved `unit` using the shared BOQ display-unit resolver.
**Older planning consumers:** many still use `canonicalUnit ?? unit`; do not copy that pattern into credit conversion.
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
When adding a screen that displays BOQ quantities, distinguish physical field units from saved contractual BOQ units. Return the saved source `unit`, not only a COALESCE alias, so unit-aware consumers can resolve the correct destination.

**Why:** stale derived units and saved hectare factors can mislabel Sqm quantities and reduce their value. A normalization alias must never override the contract.
