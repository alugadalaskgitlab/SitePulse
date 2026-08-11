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
