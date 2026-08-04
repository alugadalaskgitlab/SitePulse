---
name: Auto-Sequence Real Stretches (029)
description: Stretch table, execution priority via sequenceOrder, overlap/gap validation, arrangement-safe regeneration in the auto-sequence flow.
---

# Auto-Sequence Real Stretches — Instruction 029

**Rules:**
- `validateStretches()` in `shared/programmeSequencer.ts` is the single source of truth for stretch overlap (blocking) vs gap (warning) validation — client dialog and server routes both use it. Touching boundaries are NOT overlaps (0.5 m epsilon).
- Road-reach bars carry `sequenceOrder` = execution priority (1 mobilises first). Priority rank drives the stagger offset — independent of chainage order. Structure/bridge group bars never get sequenceOrder.
- Legacy path (no `stretches` in payload) still equal-splits by fronts but now stamps default sequenceOrder = chainage order.
- Regeneration NEVER deletes a bar with `earthwork_arrangement_programme_allocations` rows (cascade would destroy them): it reconciles in place by max chainage overlap (id preserved) or blocks the bar and reports it in `regenSummary.blocked`. DPR/progress entries link via boqItemId/arrangementId, never bar id — allocations are the only bar-level linkage to protect.
- Client flow is two-phase: dry-run returns `regenSummary` → user confirms → real run. Any input change clears the cached summary (useEffect) so confirm always matches submitted inputs. `openSeqDialog` always re-hydrates the stretch table from saved `sequenceOptions.stretches` (empty when none) — stale in-memory rows must not leak.
- `created`/`bars` accounting: inserts only in `regenSummary.inserted`; response `bars` = inserts + in-place reconciles.

**Why:** an architect review failed the first pass on exactly these: stale dry-run summary, in-memory stretch leakage into legacy mode, and counting in-place updates as inserts.

**How to apply:** any future change to auto-sequence payloads, bar deletion, or the dialog must keep the shared validator, the reconcile-before-delete order, and summary invalidation intact. Tests: `tests/autoSequence029.test.ts` (route harness pattern reused from 028B).
