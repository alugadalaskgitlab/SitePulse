---
name: Work Programme Planning Engine
description: Full Gantt + BOM planning system ported into SitePulse. Schema, engine, UI all built. One UI sub-task pending.
---

## What's built

### Schema (DB pushed)
- `boq_projects`: `hmpChainageKm`, `wmmPlantChainageKm`, `quarryChainageKm`, `avgTipperSpeedKmHr`
- `boq_items`: `layerConfig` (jsonb) — stores LayerConfig object
- `boq_item_materials`: `isAuto` (bool), `notes` (text), `uom` now nullable

### shared/planningEngine.ts exports
- `LAYER_DENSITY_DEFAULTS` — density by layer type string key (BC/DBM/WMM/GSB/CC…)
- `LayerConfig` interface — layerType union + sub-fields per type
- `UnitConversionContext` — densityTPerCum + thicknessMm
- `getUnitConversionFactor(from, to, ctx)` — MT↔CUM↔SQM, returns null when impossible
- `getEffectiveOutputPerHrConverted(eq, targetUnit, ctx)` — exact then converted fallback
- `calculateTipperFleet(input)` → cycle time, tippers needed, delivery rate, isAdequate
- `deriveMaterialsFromLayerConfig(lc, boqUnit, mixTemplate?)` → DerivedMaterialRow[]

### Routes
- `GET /api/planning/mix-templates` — list plant mix templates (id, name, mixType, bitumenPercent)
- `GET /api/planning/mix-templates/:id/components` — components with materialName resolved
- `GET /api/boq/projects/:id/bom` — raw items+bars for client-side BOM calc
- `GET /api/boq/projects/:id/plan-vs-actual` — planned-to-date vs DPR actuals (uses progress_entries.boq_item_id)
- `GET /api/boq/projects/:id/recipe-materials-used` — project-wide material frequency for suggestion chips

### UI pages
- `BoqItemRecipes.tsx`: 4 tabs — Layer Config, Equipment, Labour, Materials
  - Layer Config: picks layer type, mix template, thickness, density; applies derived rows
  - Equipment: converted output per row, bottleneck highlight (amber), Tipper Fleet Check panel
  - Materials: Auto rows read-only with ⚙ badge; manual rows editable; suggestion chips
- `WorkProgramme.tsx`: Gantt tab + Monthly Plan tab + Plan vs Actual tab
  - Gantt bar tooltip includes: bottleneck equipment name + haul distance (from chainage mid to HMP/WMM/quarry anchor)
  - Haul distance uses `item.layerConfig` type to pick the right project anchor field
- `WorkDemand.tsx`: Materials / Equipment / Labour demand tabs with monthly breakdown

## Pending
- **T005**: Equipment Master UI — "Planning Output" section in the equipment edit dialog (standardOutputs field, outputUnit, outputTheoretical, outputEfficiency). Storage/routes already exist for planningEquipmentTypes; UI form needs the output fields wired up.

## Structure bar auto-sequencing (separate from road auto-sequence)

`shared/structureSequencing.ts` is a purpose-built sequencer for imported per-location structure bars (culverts, bridges, etc.) — it is NOT an extension of the existing road/linear auto-sequence system (`autoSequenceMutation` / `/api/boq/projects/:id/auto-sequence`), which explicitly excludes structure items via `disableStructureFronts`.

**Why a separate engine:** structure quantities are imported as source of truth and must never be recomputed from BOQ/chainage the way road bars are; sequencing only needs to place bars in time (group by structureId, order by construction-stage sequence, stagger fronts by structure type), not recompute quantities.

**Why missing dates no longer silently default to Month 1:** doing so is what caused ~200 structure bars to stack at startMonth=1 in production. The import route now returns HTTP 409 with `{requiresDecision, missingDateRows, totalRows}` when rows lack a valid date, and the client shows a 3-way choice (import as unscheduled / auto-sequence now / cancel) instead of silently placing bars.

**How to apply:** `workProgramBars` has `stage`, `sequenceOrder`, `durationSource`, `needsReview`, `scheduled` columns for this system. Bars with `scheduled=false` are surfaced via an "Auto-sequence imported structure bars" toolbar button in `WorkProgramme.tsx` that calls `POST /api/boq/projects/:id/auto-sequence-structures`.

**Trap: `storage.getWorkProgramBars()` uses an explicit column select, not `select()`** — any new column added to `workProgramBars` (e.g. `stage`/`scheduled`/`needsReview`) must also be added to that explicit select list, or every consumer silently sees `undefined` for it (the auto-sequence "unscheduled" scope filter matched zero rows for this exact reason even though the DB columns and UI were all correct).

## Key design decisions

**Why layerConfig is jsonb on boq_items (not a separate table):**
- Config is item-scoped; queried/written as a unit; schema evolves without migrations.

**Why haul distance is computed per-bar (not per-project):**
- Different bars cover different chainage ranges → different mid-points → different haul distances to the same source.

**Why deriveMaterialsFromLayerConfig returns isAuto: true rows:**
- They're tagged so the Materials tab can render them read-only and the user knows they came from the layer config, not manual entry.

**Why progress_entries.boq_item_id is the Plan vs Actual link:**
- The field already existed on the schema. No new join table needed.
