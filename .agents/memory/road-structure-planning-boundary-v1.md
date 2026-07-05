---
name: Road + Structures V1 planning boundary
description: Which items may be auto-spread across road reaches vs. structure-only planned from the frozen 4-sheet Structure Schedule Import.
---

Road items plan by chainage/reach via Auto-generate/Auto-sequence. Structure and
protective/misc items (culverts, drains/retaining walls, minor/major bridges, chute
drains, dissipation chambers, turfing, weep holes, filter media, pitching, retaining
walls) may ONLY be planned from the frozen 4-sheet Structure Schedule Import
(Culverts, Drains_Retaining_Walls, Minor_Bridges, Major_Bridges) — never
auto-spread across road reaches. Unscheduled structure items show "Not
programmed — schedule/location required." instead of silently defaulting into a
road-planning flow.

**Why:** protective/misc BOQ items previously fell through `classifyWorkType()`
to `null` → defaulted to `planningWorkType: "road"` → got wrongly auto-spread
across chainage reaches by Auto-generate, even though they only make sense at a
specific scheduled structure/location.

**How to apply:**
- New work types must be classified into `WORK_TYPE_PLAN_CATEGORY` in
  `shared/workTypeRecipes.ts` as `"structure"` if they can only be located via
  the Structure Schedule Import, not spread by chainage — otherwise they
  silently leak into road auto-generation as `null` → `"road"`.
- `classifyWorkType()` check order matters: put a specific check (e.g.
  "retaining wall") BEFORE broader material checks (e.g. RCC/PCC concrete)
  so a retaining wall built in RCC isn't swept into the generic "rcc" type.
- The matrix-sheet parser (`parseMatrixSheet` in `server/routes.ts`) never
  defaults missing chainage to 0 — a column with no resolvable "Chainage From"
  row is left `null` and every row for it is flagged `chainageMissing: true` →
  `needsReview: true` on write. "Chainage To" may be omitted for point items
  (falls back to Chainage From). Header matching is normalized (lowercased,
  non-alphanumeric stripped) via `shared/structureImportLabels.ts` so variants
  like "Chainage (Km)" or "Chainage in Km" are still recognized.
