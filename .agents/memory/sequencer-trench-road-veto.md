---
name: Sequencer road-way earthwork veto
description: "trench" in road-earthwork descriptions (MoRTH 301) triggers excavation_structure false-positive; three-layer fix required.
---

## The rule
"Earthwork excavation in road way…for trench cutting (MoRTH Spec 301)" is road
earthwork, NOT structure excavation, even though the word "trench" appears.

## Why this matters
`excavation_structure` Tier-1 regex fires on "trench" before any workCategory
context is consulted. This sends the item to track="structure", which produces
zero bars when `disableStructureFronts=true`.

## Three-layer fix (all three are required for defence-in-depth)
1. **Tier-1 regex** (`classifyWorkType` in workTypeRecipes.ts): added
   `!/road[\s-]*way\b|road\s+level|\bSDR\b/i` exclusion to `excavation_structure`.
2. **Tier-2 EARTHWORK** (`resolveWorkType` in workTypeRecipes.ts): added
   `hasRoadCtx` guard so "trench" alone does not return `excavation_structure`
   when "road way" is present in the description.
3. **effectivePWT override** (`classifyItem` in programmeSequencer.ts): only
   flips `planningWorkType: road → structure` when `stageByWorkCategory(workCategory)`
   does NOT map to the pavement track. workCategory=EARTHWORK → pavement → no flip.
4. **Road-branch fallthrough** (`classifyItem`): when `effectivePWT=road` but `wt`
   is not in PAVEMENT_STAGE, fall through to `stageByWorkCategory` before stage 99.

## How to apply
Any future description-pattern change to `excavation_structure` must keep the
road-context exclusion. Never test the trench/excavation pattern without also
verifying road-way items still classify correctly (test 20).
