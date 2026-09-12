---
name: Project Scope & Working Reaches (032)
description: Corridor vs executable scope — shared eligible-scope service, sequencer clipping, DPR/arrangement scope guard
---

# Project Scope, Working Reaches, Exclusions & Withdrawals (Instruction 032)

## Core model
- `shared/projectScope.ts` is the ONLY scope brain: `resolveEligibleScope`, `coverageForStretch`, `computeScopeReconciliation`, `evaluateDprScope`, `segmentAppliesToItem`. Pure functions; no DB.
- Corridor algebra over 5 corridors (lhs/rhs/median/service_lhs/service_rhs, 0.5 side-km weight each); side vocab reuses shared/barSide lowercase strings.
- Segment types: working_reach / no_scope / temporary_block / withdrawn; statuses draft/confirmed/superseded. **Scope is inactive until at least one CONFIRMED working_reach exists** — zero behavior change for legacy projects.
- Applicability has one intentional Working Reach exception: legacy/default `all_linear` reaches remain universal (including discrete items), while explicit `items` / `categories` selections filter each reach. Exclusion segments keep the old rule that `all_linear` never applies to discrete items.
- `evaluateDprScope` precedence: withdrawn > no_scope > temporary_block > **outside-any-reach gap ⇒ no_scope** (gaps between discontinuous reaches block even without an explicit no_scope record) > ok. Withdrawals date-gated by DPR date (history preserved).

## Date semantics — two deliberately different rules
- **DPR validation**: onDate = DPR date (withdrawal effectiveFrom respected; released temp blocks pass).
- **Auto-sequence planning**: onDate = null — ALL withdrawals apply (even future-dated) and all unreleased temp blocks stay blocked. Blocked qty stays UNPROGRAMMED, never forced into the last reach; regenerate after release.

## Integration points
- Sequencer: optional `SeqOptions.scopeCoverage(boqItemId, stretch)` callback; when present, pav items emit one bar per executable sub-range, qty ∝ eligible side-len / contractual total; `scopeSummary` on result. Callback absent ⇒ legacy path untouched.
- Auto Sequence resolves Working Reach applicability per BOQ item. An unchecked reach receives no bar for that item, and the item's complete applicable quantity is redistributed across the remaining enabled reaches rather than reduced.
- Ordinary confirmed edits use supersede-and-revise. Initial-entry correction is a separate audited exception, permitted only before committed downstream use and without scope revision history.
- DPR create/draft/submit + earthwork-arrangement POST share `validateProgressScope`/`evaluateDprScope`; overrides need project_scope.approve + reason, stamped into progress_entries scope_* columns; cloneDpr copies them.
- Startup: `storage.ensureProjectScopeSchema()` (pre-routes in server/index.ts) idempotently creates project_scope_segments + corridor + progress scope columns — prod gets schema at publish; do not rely on drizzle push.

## Gotchas
- esbuild rejects `a ?? b || c` without parens — vitest transform fails for EVERY test file importing routes.ts, looking like 8 unrelated suite failures.
- Reconciliation includeDraft:true by default in the API so planners see the picture before confirming.
- UI: /work-program/:id/scope (ScopeSetup.tsx), gated gatedEither(project_scope, qto_boq).

## Scope edit + Auto Sequence load (Aug 2026 batch)
- Scope form hydration lives in `client/src/lib/scopeForm.ts` (unit-tested); ScopeSetup form Card is keyed by editingId to force remount; heading/button distinguish draft edit vs confirmed revision.
- `shared/autoSequenceScope.ts` is the only bridge from confirmed scope records → Auto-Sequence stretch rows: one confirmed working reach = ONE row (never auto-split at no-scope boundaries — the eligibility engine clips during allocation); non-reach records are constraints, never rows.
- Scope-load provenance = `scopeFingerprint` stored inside sequenceOptions (persisted only on real generation, dry run never persists). **Any manual stretch mutation must clear the fingerprint** (setSeqStretchesManual wrapper in WorkProgramme) or the stale-scope warning misleads.
- Dry-run `regenSummary.stretchScope` is an item-agnostic corridor-level preview (resolveEligibleScope with null item); real allocation stays per-item. Label the UI accordingly.

## Initial-entry correction safety
An ordinary draft DPR alone need not prevent correcting original scope, but draft status does not prove all its links are harmless. Cut/fill and equipment allocations need independent inspection.

**Why:** Draft saves already persist some links even though stock posting and equipment finalization wait for submission. Historical bridge work outside the app is not itself a persisted dependency.

**How to apply:** Preserve draft contents, block unproven links with a specific reason, and show affected drafts for review. Do not silently rewrite them or relax submit validation.

Scope-dependent computation must capture a scope token before reading scope and check it under the project lock when writing; locking only the final insert leaves a stale-computation race.

**Why:** Correction can otherwise commit between generation/submit validation and persistence. Delete/restore also must not expose a temporary empty programme to eligibility checks.

**How to apply:** New planning/import/submit writers must participate in this coordination. Correction payloads must preserve omitted fields rather than materializing them as null.
