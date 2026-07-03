---
name: SiteEntry showPreview early-return trap
description: A confirm/warning dialog triggered from handleSubmit in SiteEntry.tsx must be rendered in both the showPreview and main JSX return branches.
---

`SiteEntry.tsx` has an early `if (showPreview) return <SitePreview ... />` before the component's main JSX tree. `handleSubmit` (passed as `onSubmit` to both `SitePreview` and the main form) can set state intending to show a confirmation dialog (e.g. an over-balance warning) — but if that dialog's JSX only lives in the main return branch, it never renders when the user submits from the Preview screen, making the warning state unreachable from that path.

**Why:** Discovered while adding a non-blocking over-balance confirmation dialog for DPR programme-linked entry (Phase 2) — the dialog was appended near the end of the main render tree, invisible whenever `showPreview` was true.

**How to apply:** Any new confirm/warning dialog wired through `handleSubmit` (or similar shared submit handlers) in `SiteEntry.tsx` must be extracted into a shared JSX variable/component and rendered in *both* the `showPreview` early-return branch and the main return branch.

## Structure-level Plan vs Actual granularity

`/api/boq/projects/:id/plan-vs-actual` aggregates actuals per BOQ item **project-wide**, not per structure. When a BOQ item is planned at multiple structures (e.g. "RCC M25" at Culvert-1 and Culvert-2 via `work_program_bars.structureId`), a per-structure previous-actual/balance needs its own aggregation — done client-side in `SiteEntry.tsx` by reusing the existing (already unfiltered) `/api/dprs/with-details` endpoint and summing `dprStructureItems` rows client-side by `${boqItemId}::${structureId}`, scoped to `boqProjectId` and `date < header.date`. This required adding a persisted `structureId` column on `dpr_structure_items` (set from the client's `programmeStructureId` selection) — without it, saved rows can't be attributed back to a specific structure for future aggregation. No new backend routes were added; only an existing read endpoint was reused plus a passthrough column.
