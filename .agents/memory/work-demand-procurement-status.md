---
name: Work Demand Procurement Status (Instruction 020)
description: ProcurementStatus + ResolutionReason types; getAllPlantMaterials; pg string-number trap; procurementStatus strict precedence formula
---

## What was built

**Instruction 020** added precise material resolution diagnostics and a server-authoritative procurement status to the Work Demand / shortage-check screen.

## Key decisions

### ProcurementStatus (8 values, strict precedence)
Computed in `computeShortageRow` (planningEngine.ts) when `opts` is present. Precedence:
1. `mapping_required` — inactive_material or no_match or materialMappingUnresolved
2. `uom_resolution_required` — uom_incompatible
3. `multiple_matches` — ambiguous
4. `future_not_due` — demandUpToSelectedDate ≤ 0 but futureRequirement > 0
5. `covered_by_stock` — hlcRecordedStock alone covers horizon demand
6. `covered_by_incoming` — stock + usableCommittedCoverage covers
7. `partially_covered` — some but not full coverage
8. `action_required` — resolved material, positive demand, zero coverage

### ResolutionReason (6 values)
Set server-side in routes.ts per-row:
- `saved_mapping` — explicit saved BOQ mapping
- `alias_resolved` — auto-matched via alias/name
- `inactive_material` — name/alias matched an inactive material
- `uom_incompatible` — matched material but unit conversion path doesn't exist; resolution is suppressed
- `ambiguous` — multiple active materials match the same key
- `no_match` — no active or inactive match at all

### UOM incompatibility detection
`checkMappingUomCompatibility(bomUom, candidateMat)` from `shared/boqNormalise.ts` is called during auto-resolution. If incompatible, `resolvedId = null` (stock lookup suppressed) and `resolutionDiagnostic` carries bomUom/masterUom/materialName for UI display.

### getAllPlantMaterials
Added to `IStorage` and `DatabaseStorage` — fetches all plant materials without the `isActive = 1` filter. Used for inactive diagnostics only; active materials for resolution maps still come from the partitioned subset.

**Why:** `getPlantMaterials()` (active-only) is tested and called in many places; changing it would risk regressions. The new method is additive.

### pg numeric-as-string trap
The pg driver may return `numeric` columns as JavaScript strings. In the stock balance accumulation loop and PI quantity calculations, all DB values must be wrapped in `Number(...)` before arithmetic.

**Why:** `0 + "6845.612776"` = `"06845.612776"` — string concatenation, not addition.

### Backward compat
`suggestion` field (ShortageSuggestion) is kept on ShortageRowResult unchanged. `procurementStatus` is additive. Tests targeting `suggestion` continue to pass because v1 callers (no opts) receive sensible defaults (`procurementStatus` derived from `shortfall` only).
