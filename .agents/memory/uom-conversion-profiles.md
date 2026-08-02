---
name: UOM Conversion Profiles (Instruction 021)
description: Per-material explicit UOM conversion profiles — how the 4-tier check works, direction convention, and where data flows.
---

## Rule
`material_uom_conversions` is the highest-precedence tier in `checkMappingUomCompatibility` (Step 0, before direct match and bulk density). Factor meaning: `qty(fromUom) × factor = qty(toUom)` (e.g. 1 Cum × 2.20 = 2.20 MT).

**Why:** BOQ items are specified in planning UOM (e.g. Cum) but materials are stocked in canonical UOM (e.g. MT). Without explicit profiles the engine wrongly blocks material identity resolution when UOM differs.

## Direction convention
Stock is divided by convFactor (`invFactor = 1/convFactor`) to express coverage in planning UOM. Demand is NOT scaled. Shortfall is shown in BOQ/planning UOM. `procurementEquivalentQty = shortfall × convFactor` (in stock UOM) is shown separately for raising PIs/IRNs.

**How to apply:** Any code comparing stock to demand (shortage check, §12-13 in routes.ts) must scale stock down, not scale demand up.

## 4-tier precedence in checkMappingUomCompatibility
1. Explicit active profiles (Step 0) — `material_uom_conversions` table — **matches BOTH fromUom AND toUom (021A)**
2. Legacy `conversionFactor`/`conversionFromUom` on `plant_materials`
3. Bulk density conversion (uses `allowedUoms` to detect mass/volume eligibility)
4. Direct UOM match — **only `areSameUomGroup(srcCanonical, defaultCanonical)`; allowedUoms does NOT grant factor-1 (021A)**

## 021A safety rules (critical)
- `allowedUoms` means "can transact in" — it does NOT imply numerical equivalence between dimensionally different UOMs.
- Factor-1 is valid ONLY when canonical forms match OR they are a known standard-equivalent pair (`areSameUomGroup`).
- The only pair `areSameUomGroup()` handles beyond plain equality: `"L"` ↔ `"Ltr"` (bare "L" excluded from CANONICAL_UNIT_MAP to avoid BOQ parsing ambiguity, but valid in material master entries).
- Profile matching (Step 0) requires BOTH `fromUom → srcCanonical` AND `toUom → defaultCanonical`. A CUM→CFT profile must NOT be selected when material's defaultUom is MT.
- `clientCheckUomCompat` in WorkDemand.tsx mirrors these rules; `profileForBomUom` filter also matches both from and to.
- Blocked pairs (MT↔CUM, MT↔CFT, etc.) with allowedUoms containing both units are explicitly tested in `tests/boqNormalise.test.ts` (021A block).

## Critical: material identity never suppressed for UOM
021 removed the `aliasOrNameMatchId = null` suppression. UOM incompatibility now only sets `uomIncompatible = true` which drives `procurementStatus = "uom_resolution_required"`. The material ID is still resolved; stock comparison is zeroed when `uomBlocked` (incompatible AND no factor found).

## Key tables / columns added
- `material_uom_conversions` (ensured via `ensureMaterialUomConversionsTable()`)
- `boq_material_mappings.conversion_profile_id` (INTEGER, nullable)
- `boq_material_mappings.conversion_basis` (TEXT, nullable)

## API endpoints
- `GET /api/plant-materials/:id/uom-conversions`
- `POST /api/plant-materials/:id/uom-conversions`
- `PATCH /api/plant-materials/:id/uom-conversions/:convId`

## UI surfaces
- Plant.tsx: "UOM Conversion Profiles" section in the material edit dialog (edit mode only)
- WorkDemand.tsx ResolveMappingDialog: fetches profiles for selected material; shows violet "Will map via UOM conversion profile" banner; enables Save when profile covers BOQ UOM
- WorkDemand.tsx shortage row: "Configure UOM Conversion" teal link button when `uom_resolution_required`; `procurementEquivalentQty` note in blue below action buttons
