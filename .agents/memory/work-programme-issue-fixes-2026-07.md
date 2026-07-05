---
name: Work Programme layout, classifier, and clean-bars fixes
description: Decisions from fixing Gantt left-panel overlap, bridge-context classification, and Clean Structure Bars confirmation flow.
---

## Gantt left-panel overlap
Rows previously used a fixed pixel `height` (ROW_H/ITEM_H) for the sticky left panel, which clipped/overlapped long descriptions, structure tags, badges, and qty/date lines at narrow widths.

**Fix:** switch fixed `height` to `minHeight` on the row container, and add `flex-wrap` to the left-panel content so it wraps onto additional lines instead of clipping. Because the row container is a flex row with `alignItems: "stretch"` (default), the right-side month/bar cells automatically match whatever height the wrapped left content grows to — no manual height sync needed.

**Why:** simplest fix that doesn't require JS-measured row heights or ResizeObservers; pure CSS flex stretch handles it.

**How to apply:** any new row type added to the Gantt (StretchRow, StructureLocationRow, item header row) must follow the same pattern: `minHeight` (not `height`) on the row, `flex-wrap` + `min-w-0`/`truncate`+`title` tooltip on any panel with variable-length text (structure tags, item codes, coverage badges).

## Bridge/structure-context classification order matters
`classifyWorkType` in `shared/workTypeRecipes.ts` is a sequence of `if` checks; earlier checks win. Context-specific structure items (bridge bearings, bridge numbering/painting, drainage spouts, expansion joints, approach slabs, bridge crash barriers, filter media) must be checked **before** the generic RCC/PCC concrete and excavation_structure checks, or generic keyword overlap (e.g. "RCC approach slab" matching the `rcc` regex, or "filter media behind abutment" matching `excavation_structure` via "abutment") steals the classification.

**Why:** discovered via failing tests — "RCC approach slab" was classified `rcc` and "Filter media behind abutment" was classified `excavation_structure` until the bridge-context block was moved above the concrete/excavation checks (same position as the pre-existing `retaining_wall_structure` check).

**How to apply:** when adding a new structure-context WorkType keyed off a keyword that could overlap with a broader existing regex (rcc/pcc/excavation_structure/earthwork/backfill), place the new check immediately after `retaining_wall_structure` (before the "Concrete" section), not in the later "Protective / miscellaneous" block.

## Clean Structure Bars confirmation flow
`POST /api/boq/projects/:id/programme/clean-structure-bars` no longer silently deletes all non-structure_import bars on structure items. Genuine manual bars (source="manual", not matching auto-generated label patterns) are returned as `needsConfirmation` and only deleted on a follow-up POST that includes their ids in `confirmBarIds`.

**Why:** the original route could delete legitimate hand-entered bars on structure items with no way to recover them; users need a chance to review before deletion.

**How to apply:** if this route's matching logic (STRUCTURE_CATEGORY_RE / STRUCTURE_KEYWORD_RE) needs new keywords, keep them in sync with the classifier's bridge-context keywords in `workTypeRecipes.ts` so the two stay consistent.

## Known pre-existing tsc noise
The project's `tsc --noEmit` run reports many pre-existing errors unrelated to any single change: `Set`/`Map` spread requiring `--downlevelIteration` (TS2802), `Request` type mismatches in `server/routes.ts`, and various loosely-typed pages. These are longstanding and not blocking (tsx/esbuild build fine); don't treat them as regressions unless the specific edited lines are new.
