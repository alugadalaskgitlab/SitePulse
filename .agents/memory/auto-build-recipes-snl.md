---
name: Auto-build Recipes SNL Integration
description: How auto-build-recipes wires SNL SDB norms, resolveWorkType(), and workCategory fallback together; key gotchas in the classifier.
---

## The Resolution Pipeline (auto-build-recipes)

Priority order per BOQ item:
1. **SNL mapping exists** (`snlItemId` set on item from `getBoqItems`) → `storage.applySnlMappingToRecipes(itemId, snlItemId, "MEDIUM", null, user)`. Derives `planningWorkType` from BOQ item's own `workCategory` via `WORK_CAT_PLAN_CATEGORY`.
2. **resolveWorkType() via classifier** — `classifyWorkType(desc, canonicalUnit ?? unit)` (high confidence).
3. **resolveWorkType() via workCategory** — `WORK_CAT_FALLBACK_WORK_TYPE[workCategory]` + sub-classification for EARTHWORK/SUBBASE_BASE/BITUMINOUS/CONCRETE (medium confidence).
4. **Unresolvable** → rich `unrecipied` entry with `{workCategory, canonicalUnit, snlMappingStatus, reason, suggestion}`.

## Key Classifier Gotchas

`classifyWorkType` in `shared/workTypeRecipes.ts` requires BOTH description pattern AND unit match for most earthwork/concrete/excavation rules:
- `excavation_structure` requires `^(CUM|CUB|M3|CU\.?M)$` unit — items with LS/Nos/Rmt units bypass it
- `roadway_excavation` similarly requires CUM unit
- "hume pipe" in description → `pipe_culvert` (line 401) NOT `drain_masonry` — pipe culvert is a separate work type
- Line 288: description with "removal/removing/breaking" BUT NO "excavat" → returns null early (safety guard)
- CROSS_DRAINAGE workCategory → `drain_masonry` (not `pipe_culvert`) via fallback when description doesn't have hume/RCC/HDPE pipe keywords

## workCategory Sub-Classification in resolveWorkType

Only fires when classifier returns null. Sub-classification:
- EARTHWORK + "excavat" + (foundation|footing|abutment|pier|culvert|trench|pit) → `excavation_structure`
- EARTHWORK + "excavat" (no structure) → `roadway_excavation`
- EARTHWORK (no excavat) → `earthwork`
- SUBBASE_BASE + "wmm|wet mix" → `wmm`; else → `gsb`
- BITUMINOUS: tack > prime > bc/sdbc/wearing > default `bituminous_base`
- CONCRETE: rcc > pqc > dlc > default `pcc`

## Testing Note

Test descriptions for "workCategory fallback" path MUST NOT trigger the classifier.
The classifier catches most realistic descriptions — use neutral phrasing:
- ✓ "General excavation as per instructions" (no roadway/structure pattern)
- ✗ "Roadway Excavation and disposal" (triggers classifier directly)
- ✓ "Excavation for footing and base slabs" + "LS" unit (CUM required for classifier, LS bypasses)
- ✓ "Culvert structure including inlet walls" + "Nos" (avoids hume/pipe patterns)

**Why:** The classifier unit guards are load-bearing — they prevent miscategorising lump-sum items.
