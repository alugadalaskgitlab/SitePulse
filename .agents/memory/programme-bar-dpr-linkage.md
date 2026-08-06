---
name: Programme Bar ↔ DPR Linkage (030A)
description: Side/width-aware programme bars and direct DPR-to-bar linkage — invariants, side compatibility matrix, deletion protection pattern.
---

# Programme Bar ↔ DPR Linkage (Instruction 030A)

- `shared/barSide.ts` is the single source of truth for bar sides, side labels, DPR↔bar side compatibility (`isDprSideCompatible`), chainage parsing (`parseChainageKm` handles "1.900" / "1+900" / "Km 1+900"), quantity sources, and `geometryApplicability(layerType)`.
- Side compatibility matrix: side-specific bar accepts only that side; `full_width` accepts FW/LHS/RHS; `both_sides` requires an explicit side; bar side `null` is unrestricted (legacy — shows "Side Review Required" badge, never silently Full Width).
- **Deletion protection pattern**: FK `progress_entries.programme_bar_id` is ON DELETE SET NULL, but the delete route blocks with 409 `DPR_PROGRESS_LINKED` when submitted DPR links exist; exceptional `?force=true` path needs delete/cancel authority + reason, marks entries `linkReviewRequired`, and audits. App-level guard + SET NULL together — never rely on FK alone.
- Split-by-side transforms the **original bar in place** (it becomes one side, keeping all DPR/arrangement links); the other side is a new bar. Never divide quantity by 2 silently — split shares are explicit or equal-with-confirm.
- The 3 thickness concepts (layer config thickness, bar plannedThicknessMm, DPR actual thickness) are never auto-synced.
- `client/src/components/ProgrammeBarPicker.tsx` is the shared DPR-form picker (SiteEntry + SiteEdit): date-active bars as chips + "Other bars" dropdown for out-of-sequence work; also exports `BarLinkFeedback` (side/chainage warnings + override reason).
- **Why:** DPR progress is the ground truth for execution; bars are plans. Links must survive plan edits, and plan deletions must never silently orphan reported progress.
- **How to apply:** any new route that mutates bars must re-run `validateProgressProgrammeLinks`-style checks or protect linked bars (see clean-structure-bars / auto-sequence regen). `cloneDpr` must copy all linkage fields — check it whenever progress_entries gains columns.

## Batch 1 (Aug 2026): planned vs actual execution side
- Settled matrix in shared/barSide.ts: planned both_sides/full_width accept actual lhs/rhs/both_sides/full_width; lhs↔lhs only, rhs↔rhs only, corridors self-only. "Both Sides" is a valid ACTUAL value.
- `dprSideOptionsForBar(plannedSide)` is the single UI source of side dropdown options; prefill actual side ONLY when the matrix allows exactly one value — Both-Sides/Full-Width bars never prefill.
- Quantity balance stays SHARED per bar (getReportedQtyByBar has no side dimension); chainage coverage is per-side via `barSideCoverage()` in shared/dprProgrammeLink.ts — LHS entries never cover RHS; fullyCovered on both/full bars requires both tracks. Exposed as `sideCoverage` on /api/dpr/programme-bars.
- Server hard rules on FINAL submit (drafts lenient): actual side mandatory for any chainage-based progress row, linked or not, even on null-planned-side bars; incompatible planned↔actual always PROGRAMME_LINK_INVALID.
- **Why:** planned side is the programme's intent, actual side is what happened — inferring/defaulting one from the other corrupts coverage tracking.
- Gotcha: GuidedDpr linked-bar display must use the reactive programme query, not queryClient.getQueryData (cache peek doesn't rerender when the picker's query resolves on draft restore).
