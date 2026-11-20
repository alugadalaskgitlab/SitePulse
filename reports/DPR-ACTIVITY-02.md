# DPR-ACTIVITY-02 — Guided Site activities

Added the shared Site activities editor to Guided DPR, between Details and Labour. Existing site-activity entries load from the same saved data as Detailed DPR; guided edits preserve saved row IDs, staff, and attachments. If activities have not loaded, saves omit the field rather than replacing saved entries. The step is optional.

The work hub now shows a Site activities card and count. The Review step shows saved activities after work done and before Labour/Equipment. Field Home lists the activity count as informational only; it does not affect readiness or the pending count. Older autosaved step numbers 4–7 still restore to Labour, Equipment, Photos, and Review.

No database changes, migrations, real DPR edits, or production access.

## Files changed

- Guided DPR and work hub: `client/src/pages/GuidedDpr.tsx`, `client/src/lib/guidedWizard.ts`, `client/src/lib/guidedSiteActivities.ts`, `client/src/pages/DprWorkHub.tsx`, `client/src/lib/dprWorkHub.ts`
- Field checklist: `shared/dprFieldChecklist.ts`, `client/src/pages/FieldHome.tsx`
- Tests and synthetic fixture: `tests/guidedDprActivity02.test.ts`, `tests/guidedWizard1409.test.ts`, `tests/dprLifecycle06d.test.ts`, `tests/guidedDpr06cP.test.ts`, `tests/dprWorkHub.test.ts`, `tests/fixtures/dpr-site-entry/main.tsx`, `tests/fixtures/dpr-site-entry/verify-activity02.mjs`
- Screenshots: `reports/evidence/dpr-activity-02-*.png`

## Checks

- Synthetic browser fixture: all five activity types and staff survived save, reload, review, and submit. An existing detailed-DPR test activity was opened and edited in Guided; its saved ID remained, and the other four entries were retained.
- Focused tests: 6 files passed, 78 tests passed.
- `npm run build`: passed.

## Phone screenshots

- [Work hub](evidence/dpr-activity-02-work-hub-phone.png)
- [Guided step indicator](evidence/dpr-activity-02-step-indicator-phone.png)
- [Site activities editor](evidence/dpr-activity-02-site-activities-phone.png)
- [Review](evidence/dpr-activity-02-review-phone.png)
- [Field Home checklist](evidence/dpr-activity-02-field-home-phone.png)
- [Site activities after reload](evidence/dpr-activity-02-site-activities-reloaded-phone.png)
