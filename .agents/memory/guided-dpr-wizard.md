---
name: Guided DPR wizard & per-activity photos
description: Wizard step model, No Work semantics in Guided, and the entryKey photo-linking pattern
---

## Wizard
- Guided DPR is a 5-step wizard (Report → Activities → Details → Photos & crew → Review). Step model lives in `client/src/lib/guidedWizard.ts` (pure, tested). Steps 1–2 gate Next; 3–4 stay draft-lenient; Submit only on step 5. `step` is persisted in the autosave blob (clamped on restore).

## No Site Work in Guided
- Guided rows carry `noSiteWork` mirroring Detailed semantics: ticking clears geometry/quantity; payload emits a stripped row; readiness/overlap/validate skip them (server already skipped them everywhere). Draft hydration must NOT filter out no-work rows.

## Per-activity photos — entryKey pattern
- **Rule:** never link attachments to progress-row serial ids — draft PATCH wholesale deletes+reinserts progress rows. Instead `progress_entries.entry_key` (client-generated uuid, round-tripped through payload/hydration) + `attachments.progress_entry_key`.
- **Why:** serial ids change on every draft save; entryKey is stable across saves/clones.
- **How to apply:** cloneDpr's manual progress field list must copy `entryKey` (it enumerates fields — new columns don't flow automatically there, unlike the spread paths). Grouped display goes through `shared/dprPhotos.ts` groupDprPhotos + `DprPhotoGroups` component (one fetch, shared query key with AttachmentGallery). Staged Files live in a separate map keyed by entryKey (never in the JSON-autosaved entries).
- Startup DDL `ensureDprEntryKeyColumns()` in routes.ts keeps per-customer deployments in sync (both columns also ALTERed directly on dev+prod DBs Aug 2026).

## Batch 06C additions (Aug 2026)
- Photo cap: `shared/dprPhotos.ts` (MAX_ACTIVITY_PHOTOS=3, activityPhotoCapacity, countEntryAttachments) is the ONE seam — client staging guards in GuidedDpr/SiteEntry/SiteEdit AND the server reject in POST /api/attachments all use it. Never enforce the cap in only one place.
- entryKey now lives in Detailed too: SiteEntry + SiteEdit ProgressEntry carry entryKey (generated on new rows, preserved on edit hydration). Any new progress-row creation path MUST set entryKey or photos orphan.
- Attachment survival: `createVersionDpr` RE-POINTS dpr_progress attachments to the new version; `cloneDpr` COPIES attachment rows (same objectPath). Both are required — clone without copy leaves entryKeys pointing at photos on the superseded DPR.
- Upload-gate trap: SiteEntry photo upload was gated on `stagedPhotos.length > 0` only — per-activity queues must also be checked or activity photos silently vanish. Gate on BOTH buckets.
- Guided equipment master query must NOT be gated on open usages; master select + work-item link ride the passthrough bag (equipmentId/boqItemId; changing item clears structureId, changing machine resets plantUsageId).
- Guided labour rows now carry gender/task/boqItemId/structureId end-to-end; legacy autosave blobs are normalised with a newLabourRow() spread on restore.

## Batch 06C-P (Aug 2026)
- Wizard is now 7 steps (Report/Activities/Details/Labour/Equipment/Photos/Review) — guidedWizard.ts is the only step model; steps 3–6 stay draft-lenient.
- Length is display-only, derived via shared/dprGeometry calculateLengthFromChainage; never re-implement chainage arithmetic in a page.
- SiteEntry's legacy internal step-wizard (guidedMode/showStep/GUIDED_STEPS) is fully removed — Detailed is a continuous Classic form; /site/guided is the SOLE guided experience. Do not reintroduce an internal wizard toggle.
- SiteEntry's Remarks & general-photos card is now an always-visible Classic section (it was previously reachable only through the removed wizard).

## Batch 06C-Q (Aug 2026)
- Guided Equipment now has full Detailed parity: entry/deployment type (hired only, plus fallback when a stored non-default type exists but master isn't loaded), trip/water/fuel conditional sections, diesel + source + purchase details — all via the passthrough bag.
- shared/guidedEquipment.ts also owns computeTotalDiesel / computeTripTotalKm / isWaterTankerName — both screens must use these, never inline the math.
- Deleting a passthrough key is save-safe: DPR child rows are replaced wholesale on save (_replaceDprChildRecords), so a missing key stores NULL, same as Detailed's explicit null.
- Guided sticky footer must carry md:left-56 — the app shell has a fixed 224px sidebar on md+, so a viewport-fixed bar drifts left of the content grid without it.
- Detailed DPR add buttons are named Add Activity / Add Equipment / Add Labour (structure "Add Item" intentionally kept).
