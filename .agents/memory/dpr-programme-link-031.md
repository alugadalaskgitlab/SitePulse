---
name: DPR Programme-Link Reliability (Instruction 031)
description: Shared DPR↔programme-bar mechanics used by SiteEntry, GuidedDpr, SiteEdit and the server — where the logic lives and traps.
---

**Rule:** All DPR↔programme-bar mechanics (auto-matching, chainage-range checks, draft-lenient vs strict validation, bar-scoped balance, review-status derivation, quantity-source suggestion) live in `shared/dprProgrammeLink.ts` and the shared `ProgrammeBarPicker`/`BarLinkFeedback` components. Never re-implement per screen.

**Why:** Two DPR screens (Detailed = SiteEntry, Guided = GuidedDpr) plus SiteEdit plus server validation had drifted copies; 031 consolidated them. Any new rule added in one place must flow to all four.

**How to apply:**
- Server `validateProgressProgrammeLinks(input, {draft})` — draft-lenient on create-draft and PATCH /draft; strict on submit and version edit. Drafts KEEP programmeBarId with incomplete chainage (the old "drop bar link on incomplete draft rows" hack in GuidedDpr was removed).
- Out-of-range rows get `chainageReviewStatus='review_required'` (stamped server-side); `getReportedQtyByBar` excludes them from bar done-qty. `getSubmittedProgressLinkCounts` deliberately still counts them (deletion protection).
- **cloneDpr trap:** any new progress_entries column must be added to the explicit field list in `storage.cloneDpr`, or edits/supersede silently drop it (bit us with chainageReviewStatus/executedBy).
- Picker auto-select suppression key must include dprDate (date changes alter which bar is active).
- Guided draft dedup: `draftId` state → PATCH /api/dprs/:id/draft on re-save, POST /:id/submit to promote; local autosave key "guided-dpr-new".
- "Same as yesterday" structure-only copy is shared via `client/src/lib/sameAsYesterday.ts` (both screens).
- Partly-outsourced arrangements (mode matches /part/i) require `executedBy` (hlc/agency) on submit.

**BOQ eligibility is independent of scheduling.** Engineers may execute BOQ work ahead of programme dates or before any bar is scheduled. A programme link is optional; explicit DPR-excluded items remain excluded.

**Why:** resource availability can legitimately advance actual execution. Missing programme context must not imply that BOQ work is unavailable or incidental.

**How to apply:** retain BOQ credit for null-bar progress, keep full eligible item selectors available, respect deliberate unlinking, and never create/reschedule bars as a side effect of DPR entry. A retained unavailable bar ID is still a link until explicitly cleared.
