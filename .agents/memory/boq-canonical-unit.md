---
name: BOQ Canonical Unit System
description: shared/boqNormalise.ts is the single canonical unit service. canonical_unit DB column backfilled at startup. All modules use this.
---

# BOQ Canonical Unit System

## Rule
`shared/boqNormalise.ts` is the one canonical unit normalisation service. Every module that needs to work with BOQ units imports from here. Do NOT add another unit normaliser anywhere else.

## How it works
- `canonicalizeUnit(raw)` — strips numeric prefix ("1 Cum" → "Cum"), collapses punctuation ("Cu.m" → "Cum"), looks up comprehensive `CANONICAL_UNIT_MAP` (60+ entries), falls back to de-prefixed original for unknown units
- `normaliseBoqUnit(raw)` — deprecated alias returning uppercase; kept for backwards-compat with regex classifiers in workTypeRecipes.ts

## DB Column
`canonical_unit text` in `boq_items` — added via `ensureBoqCanonicalUnit()` startup migration in storage.ts. ALWAYS NULL-guarded: only writes rows where canonical_unit IS NULL. Original `unit` column never touched.

## Startup Migration (`ensureBoqCanonicalUnit`)
Called from server/index.ts just after `ensureStructureBarColumns`. On first run:
- Adds column (`ALTER TABLE IF NOT EXISTS`)
- Backfills canonical_unit for all rows (first run: 286 items on the Takkadpally-Sirur project)
- Also backfills work_category for NULL rows using suggestWorkCategoryFromDescription (first run: 117 items)
- Idempotent: subsequent runs process 0 rows (fast)

## Import flow
`importBoqItems` (storage.ts) now sets `canonical_unit = canonicalizeUnit(item.unit)` and uses a 3-level workCategory fallback: `item.workCategory ?? suggestWorkCategory(itemCode) ?? suggestWorkCategoryFromDescription(desc, canonical) ?? null`

## No circular deps
`boqNormalise.ts` has zero imports from other shared modules. Import chain: boqNormalise ← workTypeRecipes ← boqWorkCategories (no cycle).

**Why:** workTypeRecipes.ts previously imported nothing for its inline normaliser. boqWorkCategories imports classifyWorkType from workTypeRecipes. If boqNormalise imported from boqWorkCategories, it would create boqNormalise → boqWorkCategories → workTypeRecipes → boqNormalise (circular).

## Tests
`tests/boqNormalise.test.ts` — 106 tests covering all major unit variants (Cum, Sqm, Ha, Rmt, MT, Kg, Nos, LS, KL), prefix stripping, pass-through for unknowns, and normaliseBoqUnit compatibility.

## Display
All key BOQ unit displays in WorkProgramme.tsx (Gantt qty label, Plan vs Actual table, coverage badges, calculateAutoDurationFull calls) and BoqItemReview.tsx use `(item as any).canonicalUnit ?? item.unit`. BoqItemReview shows tooltip with original when canonical differs.
