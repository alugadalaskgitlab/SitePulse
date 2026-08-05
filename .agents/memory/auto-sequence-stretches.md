---
name: Auto-Sequence Real Stretches (029/029B)
description: Stretch table, execution Stage/Front model via sequenceOrder+executionFront, side-aware overlap validation, arrangement-safe regeneration in the auto-sequence flow.
---

# Auto-Sequence Real Stretches — Instruction 029

**Rules:**
- `validateStretches()` in `shared/programmeSequencer.ts` is the single source of truth for stretch overlap (blocking) vs gap (warning) validation — client dialog and server routes both use it. Touching boundaries are NOT overlaps (0.5 m epsilon).
- 029B: overlap validation is SIDE-AWARE via `areSidesDistinctCorridors()` in `shared/barSide.ts` — distinct non-full_width/non-both_sides sides (LHS vs RHS etc.) may share chainage; same side / full_width / both_sides still conflict; a NULL side on either party with chainage overlap → blocking "side must be confirmed" error (never silent accept, never a false duplicate). The single-bar POST/PATCH guard `findChainageOverlapConflict` in routes.ts shares this policy and returns `kind: "overlap" | "side_confirm"` → errors `CHAINAGE_OVERLAP` vs `SIDE_CONFIRM_REQUIRED`. PATCH re-checks when side changes, not just chainage.
- 029B: `sequenceOrder` is the execution STAGE — duplicates are ALLOWED (parallel stretches). Stagger offset = distinct-stage rank × stagger, so same-stage stretches start together. Bars also carry `executionFront` (free-text crew/front label) and `executionOrder` (display-only tiebreaker derived from row position within a stage in the dialog). Same stage + same front (case-insensitive) → non-blocking warning in `validation.warnings`. Old "priority used more than once" blocking rule is GONE. Structure/bridge group bars never get sequenceOrder.
- Legacy bars with null executionFront/executionOrder schedule unchanged — no backfill. `execution_front`/`execution_order` (plus all 030A geometry columns) are ensured idempotently at startup via `ensureStructureBarColumns()` in storage.ts.
- Legacy path (no `stretches` in payload) still equal-splits by fronts but now stamps default sequenceOrder = chainage order.
- Regeneration NEVER deletes a bar with `earthwork_arrangement_programme_allocations` rows (cascade would destroy them): it reconciles in place by max chainage overlap (id preserved) or blocks the bar and reports it in `regenSummary.blocked`. DPR/progress entries link via boqItemId/arrangementId, never bar id — allocations are the only bar-level linkage to protect.
- Client flow is two-phase: dry-run returns `regenSummary` → user confirms → real run. Any input change clears the cached summary (useEffect) so confirm always matches submitted inputs. `openSeqDialog` always re-hydrates the stretch table from saved `sequenceOptions.stretches` (empty when none) — stale in-memory rows must not leak.
- `created`/`bars` accounting: inserts only in `regenSummary.inserted`; response `bars` = inserts + in-place reconciles.

**Why:** an architect review failed the first pass on exactly these: stale dry-run summary, in-memory stretch leakage into legacy mode, and counting in-place updates as inserts.

**How to apply:** any future change to auto-sequence payloads, bar deletion, or the dialog must keep the shared validator, the reconcile-before-delete order, and summary invalidation intact. Tests: `tests/autoSequence029.test.ts` (route harness pattern reused from 028B).
