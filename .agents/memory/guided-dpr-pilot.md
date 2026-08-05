---
name: Guided DPR pilot
description: Programme-driven Guided DPR screen — routing, entry-mode preference, draft-lenient programme links, and the staged-photo retry rule.
---

# Guided DPR pilot (built Aug 2026; reliability batch completed Aug 2026)

- `client/src/pages/GuidedDpr.tsx` at `/site/guided` (gated `site_dprs`) is the guided road-DPR screen; SiteEntry (`/site/new`) is "Detailed DPR" and untouched behaviourally.
- `client/src/lib/dprEntryMode.ts` holds the localStorage guided/detailed preference; all four road-DPR entry points route through `roadDprHref()`.

**Rule (superseded → now draft-lenient):** `validateProgressProgrammeLinks` accepts `{ draft: true }` — draft saves keep `programmeBarId` on rows with incomplete chainage or missing out-of-range reason; structural errors (wrong project/item, incompatible side) still fail even for drafts. Final submit is strict (400 `PROGRAMME_LINK_INVALID`). Server never silently drops a link — it rejects instead.
**Why:** the old strict-always rule forced clients to drop the bar link on incomplete draft rows, which is exactly the "link lost through submit" bug the reliability batch closed.
**How to apply:** any new client saving programme-linked drafts should pass rows unchanged and rely on draft-lenient mode; never strip `programmeBarId` client-side.

**Rule:** after uploading staged photos on save, prune the staged list to only the FAILED files (keep for retry).
**Why:** clearing nothing re-uploads duplicates on every draft save; clearing everything loses failed photos with no retry.

- Shared reliability plumbing (both DPR screens): `ProgrammeBarPicker` (auto-match single candidate + "Linked automatically" note), `BarLinkFeedback` (bar-scoped Planned/Done/Balance + optional BOQ-item totals, out-of-range modal via `OutOfRangeChainageModal`, executedBy select for partly-outsourced arrangements — mode matched by `/part/i`). Out-of-range submitted rows get `chainageReviewStatus="review_required"` and are excluded from bar actuals until approved.
- Local autosave (`use-autosave`, key `guided-dpr-new`) restores the whole form incl. draftId via a banner; server draft lifecycle is POST → PATCH `/api/dprs/:id/draft` → POST `/api/dprs/:id/submit` (one record, never duplicates).
- Tests: `tests/guidedDprReliability.test.ts` (route-level lifecycle, real handlers + mocked storage, 030A scaffolding pattern).
- Filter DPR lists with `!isSuperseded` when computing "already reported".
- Live-proof tip: API login needs an approved device row (`user_devices`); a fresh curl login is `device_pending` until approved (dev DB update works).
