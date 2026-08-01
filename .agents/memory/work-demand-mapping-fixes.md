---
name: Work Demand Mapping Fixes
description: Instruction 019 — floor-based horizon, 3-stage alias resolution, UOM validation on mapping save, audit columns on boq_material_mappings.
---

## Horizon bucket formula (Instruction 019)
`dateToMonthBucket(rawIdx, maxProgrammeMonth)` in `shared/planningEngine.ts` — the single authoritative formula. Uses `Math.floor`, never `Math.ceil`.

**Why:** `Math.ceil(1.3)` = 2, which pulls in month 2 demand for a date that is only 30% into month 1. Floor-based containment is correct.

**How to apply:** Every horizon resolution (`current_month`, `next_30_days`, `custom`) in routes.ts now calls `dateToMonthBucket`. Never use `Math.ceil` on a rawIdx.

## Material label normalization
`normalizeMaterialLabel(label)` in `shared/boqNormalise.ts` — lowercase, trim, collapse spaces, normalize "/" and "-", collapse "10 mm" → "10mm".

**Why:** BOM label text varies in whitespace and punctuation. Centralised here so Work Demand and shortage-check both use the same normalisation.

## 3-stage alias resolution (shortage-check route)
Priority order in `GET /api/boq/projects/:id/shortage-check`:
1. Saved mapping (project-specific > global)
2. Exact normalised name match (`materialIdByName`)
3. Alias match (`aliasToMaterialId` built from `plant_materials.aliases` JSON column + normalised material name itself)

`aliases` column is a JSON text array added to `plant_materials` via idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `ensureBoqMaterialMappings`. 10 standard road material aliases seeded on startup.

## UOM compatibility validation
`checkMappingUomCompatibility(sourceUom, target)` in `shared/boqNormalise.ts` — returns `{ compatible, mode, conversionFactor, basis, errorCode }`.

**Why:** Blocking MT↔CFT without density prevents silent quantity errors. Server is authoritative; client shows real-time feedback only.

**How to apply:**
- `POST /api/boq/projects/:id/material-mappings` validates when `sourceUom` is provided; returns `MATERIAL_UOM_MISMATCH` or `MATERIAL_CONVERSION_REQUIRED`.
- `ResolveMappingDialog` in WorkDemand.tsx shows per-candidate UOM status in dropdown; disables Save when incompatible.
- `GET /api/plant-materials/search` now returns `allowedUoms`, `bulkDensity`, `conversionFactor`, `conversionFromUom`, `conversionToUom` for client-side preview.

## boq_material_mappings audit columns (Instruction 019)
Added 4 nullable columns via startup migration:
- `source_uom` — BOM UOM at time of mapping
- `normalized_source_label` — result of `normalizeMaterialLabel(materialLabel)`
- `conversion_mode` — "direct" | "configured_factor" | "bulk_density"
- `conversion_factor_used` — numeric factor (1 for direct)
