---
name: Work Demand Mapping Fixes
description: Instructions 019 + 019B — horizon math, collision-aware alias resolution, typed aliases, mandatory sourceUom, conversion application, search ranking, programmeRelation.
---

## Horizon bucket formula (Instruction 019)
`dateToMonthBucket(rawIdx, maxProgrammeMonth)` in `shared/planningEngine.ts` — the single authoritative formula. Uses `Math.floor`, never `Math.ceil`.

**Why:** `Math.ceil(1.3)` = 2, which pulls in month 2 demand for a date that is only 30% into month 1. Floor-based containment is correct.

**How to apply:** Every horizon resolution in routes.ts calls `dateToMonthBucket`. Never use `Math.ceil` on a rawIdx.

## Material label normalization
`normalizeMaterialLabel(label)` in `shared/boqNormalise.ts` — lowercase, trim, collapse spaces, normalize "/" and "-", collapse "10 mm" → "10mm".

## Typed aliases column (Instruction 019B §1)
`aliases: text("aliases")` is now in the `plantMaterials` Drizzle schema (shared/schema.ts). Physical column added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `ensureBoqMaterialMappings`. Use `mat.aliases` everywhere — never `(mat as any).aliases`.

## Collision-aware alias resolution (Instruction 019B §3)
Replaced `Map.set()` (silently overwrites) with a two-phase algorithm in the shortage-check route:
1. Build `keyToCandidates: Map<normKey, MatCandidate[]>` — includes both material name AND all typed aliases
2. Partition: `resolvedAliasToId` (exactly 1 candidate) + `ambiguousByKey` (2+ candidates)

Ambiguous labels set `materialMappingAmbiguous: true` on the row and return `ambiguousCandidates[]`. They are never auto-resolved.

**Why:** Two materials with the same alias must not silently collapse to whichever was processed last.

## Resolution precedence (Instruction 019B §4)
In shortage rows:
1. Saved BOQ-material mapping (project-specific > global) via `labelToMapping`
2. Exact alias or normalized name via `resolvedAliasToId.get(normLabel)`
3. Exact lowercase name via `materialIdByName.get(labelKey)` (legacy fallback)
4. If none: `materialMappingUnresolved = true` (and if ambiguous: `materialMappingAmbiguous = true`)

No substring auto-resolution. Substring search remains only as manual-search aid in the search endpoint.

## labelToMapping alongside labelToMaterialId
Both maps are built together in the shortage-check route. `labelToMapping` provides the full mapping record (including `conversionFactorUsed`, `conversionMode`, `sourceUom`) for conversion lookups.

## Mandatory sourceUom (Instruction 019B §5)
`POST /api/boq/projects/:id/material-mappings` now returns HTTP 400 with `error: "SOURCE_UOM_REQUIRED"` when `sourceUom` is absent or blank. UOM validation always executes (no `if (sourceUom)` guard).

**Why:** Omitting sourceUom was a bypass vector that let incompatible mappings slip through.

## Conversion application in shortage calculations (Instruction 019B §7)
When a saved mapping has `conversionFactorUsed` (and mode != "direct"), all demand quantities in `matRow` are scaled by the factor before passing to `computeShortageRow`. Stock quantities are already in canonical UOM so they're untouched.

Scaled fields: `totalDemand`, `monthlyQty` (all months), `programmedTotalDemand`, `unprogrammedDemand`. The `uom` field is also replaced with `canonicalUom`.

`conversionBasis` string is attached to the shortage row for UI display ("Using configured bulk density: 1 CFT = 0.05 MT").

## Search ranking (Instruction 019B §8)
`GET /api/plant-materials/search` now returns `matchType: "exact_name" | "exact_alias" | "substring"` and sorts results by match quality. Client shows "exact" / "alias" badges. Never auto-selects a substring result.

## programmeRelation (Instruction 019B §11)
`GET /api/boq/projects/:id/shortage-check` now returns `programmeRelation: "before_start" | "within_programme" | "after_end"` derived from `currentMonth` vs `maxProgrammeMonth`. No horizon math was touched.

## Alias backfill merge strategy (Instruction 019B §2)
`ensureBoqMaterialMappings` now:
- Uses `db.update(plantMaterials)` (ORM, not raw SQL) for alias merges
- Merges new aliases into existing ones (case-insensitive dedup) — never overwrites
- WMM: dynamic lookup; attaches aliases only if exactly ONE WMM master exists; logs otherwise
- Soil/Earth (Selected Soil, Subgrade, Borrow Earth, etc.) intentionally left unresolved — logged on startup

## boq_material_mappings audit columns (Instruction 019)
4 nullable columns: `source_uom`, `normalized_source_label`, `conversion_mode`, `conversion_factor_used`. Added via startup migration; always written on mapping save.
