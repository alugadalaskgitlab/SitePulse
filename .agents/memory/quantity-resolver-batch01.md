---
name: Central quantity resolver (Batch 01)
description: shared/quantityResolver.ts is the single seam for BOQ eligible-quantity resolution; documented consumer disagreements that must NOT be silently unified.
---

**Rule:** All BOQ scope-quantity math flows through `shared/quantityResolver.ts` (`allocateStretchQuantity`, `aggregateStretchCoverages`, `getItemScopeQuantity`, `allocationRuleForItem`). Never re-implement eligible/applicable quantity in a module; extend the resolver instead. Future bases (geometry, manually-confirmed) plug in here.

**Why:** Batch 01 of a phased Quantity Engine plan (Aug 2026) centralised the sequencer's Instruction 032 math behaviour-identically (fixture snapshot byte-identical). Silently "cleaning up" the disagreements below is explicitly forbidden until a business-rule decision.

**Key facts:**
- Allocation rules (pavement / earthwork-estimate / mt-proportional) are LABELS only — all use the same length-proportional formulas.
- Auto Sequence denominator = Σ per-stretch CONTRACTUAL coverage (eligible + temp-blocked; excludes no_scope + withdrawn). Stretches may leave gaps, so pass `stretchDomain` to `getItemScopeQuantity` for the exact sequencer basis; omitting it gives the whole-scope basis (`denominatorBasis` field says which).
- Batch 02 (Aug 2026): Execution Arrangement dialog migrated to the resolver via `shared/arrangementApplicableQty.ts` (thin wrapper, ALWAYS whole-scope basis — arrangement figures must never depend on programme-bar coverage). Old eligible-denominator suggestedQty retired; arrangement now matches Auto Sequence's contractual denominator. Selected reaches may OVERLAP — always union per side (normaliseReachSelection) before summing resolver results.
- Only pass `contractQty` to the arrangement dialog when it truly is the contract BOQ qty; BarArrangementPanel's boqQty is bar planned/remaining, so it deliberately omits contractQty (panel hidden, not mislabelled).
- REMAINING DISAGREEMENT (documented, not fixed): Gantt Under/Over badge (WorkProgramme CoverageBadge) compares programmed vs RAW contract qty, never eligible qty. Locked by tests.
- Batch 03+ not started; no schema changes made or needed.
