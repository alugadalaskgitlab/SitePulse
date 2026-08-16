---
name: Multi-layer / lift tracking
description: layerNo on progress_entries — overlap exemption semantics and display-only report grouping
---

# Multi-layer / Lift tracking (Batch 06P)

- `progress_entries.layerNo` (nullable integer) is the ONLY layer field. No layerLabel, no BOQ layer config, structures untouched.
- **Overlap rule**: `layersDistinct(a,b)` in shared/chainageOverlap.ts — exempt only when BOTH layers are non-null finite AND different. Null is never coerced to 1; null vs anything falls back to today's overlap rule. Pre-check runs in BOTH the same-DPR and prior-DPR loops, after boqItemId equality, before side/range comparison.
- **Reports**: layer is display grouping only. `layerBreakdown()` in shared/progressReport.ts returns [] unless ≥2 distinct non-null layers; null-layer entries get their own "No layer recorded" row so the split always sums to the existing total. Credit/cumulative formulas untouched.
- **Wording**: shared/layerDisplay.ts — "Lift" only when activity contains "embank"; client-side words, never stored.
- **Why:** embankment lifts / repeated pavement layers at the same chainage were false-flagging as overlaps; the fix must not create a second quantity dimension.
- **How to apply:** any new insert/clone path for progress entries must carry layerNo (cloneDpr uses an explicit column list — add it there); any new overlap consumer must pass layerNo into candidate/prior rows or the exemption silently disappears.
- Startup ensure: `ensureProgressLayerNoColumn()` in routes.ts (idempotent ADD COLUMN); also applied by direct ALTER to dev + prod DBs.
