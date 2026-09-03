---
name: Multi-layer / lift tracking
description: layerNo on progress_entries — overlap exemption semantics and display-only report grouping
---

# Multi-layer / Lift tracking (Batch 06P)

- `progress_entries.layerNo` (nullable integer) is the ONLY layer field. No layerLabel, no BOQ layer config, structures untouched.
- **Overlap rule**: `layersDistinct(a,b)` in shared/chainageOverlap.ts — exempt only when BOTH layers are non-null finite AND different. Null is never coerced to 1; null vs anything falls back to today's overlap rule. Pre-check runs in BOTH the same-DPR and prior-DPR loops, after boqItemId equality, before side/range comparison.
- **Reports**: layer is display grouping only. `layerBreakdown()` in shared/progressReport.ts returns [] unless ≥2 distinct non-null layers; null-layer entries get their own "No layer recorded" row so the split always sums to the existing total. Credit/cumulative formulas untouched.
- **Coverage**: there is no planned/required layer-count concept. Once any explicit layer evidence exists, programme-bar chainage coverage must be shown per recorded layer and must suppress the unqualified aggregate “fully covered” claim. All-null legacy entries retain the old coverage shape and behavior.
  **Why:** Completing one recorded layer across a reach does not prove that every physical lift required for the work is complete.
  **How to apply:** Thread layerNo through coverage inputs, keep quantity drawdown shared/additive, and qualify full-range coverage as applying to that recorded layer only.
- **Wording**: shared/layerDisplay.ts — "Lift" only when activity contains "embank"; client-side words, never stored.
- **Why:** embankment lifts / repeated pavement layers at the same chainage were false-flagging as overlaps; the fix must not create a second quantity dimension.
- **How to apply:** any new insert/clone path for progress entries must carry layerNo (cloneDpr uses an explicit column list — add it there); any new overlap consumer must pass layerNo into candidate/prior rows or the exemption silently disappears.
- Startup ensure: `ensureProgressLayerNoColumn()` in routes.ts (idempotent ADD COLUMN); also applied by direct ALTER to dev + prod DBs.
