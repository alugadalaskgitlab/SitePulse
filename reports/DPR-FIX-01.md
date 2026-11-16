# DPR-FIX-01

## Changes

- Edit drafts are now saved per DPR and user. Only a non-empty, well-formed draft DPR can restore local edits. Submitted reports always load the server copy and discard stale local drafts; saving or submitting clears local copies.
- The edit-screen error could come from the same unsafe restore path: an empty stale draft could replace server data, and malformed row data could throw while the screen hydrated. Available logs contain no browser-side exception or local-storage contents, so they cannot confirm which payload caused the reported first-load error. The path is now status- and user-scoped and validates row data before restore. Existing one-time recovery for a missing lazy-loaded file remains covered by its regression test.
- Map to Norm results show the full description in a hover tooltip and can expand in place on touch screens. Search already matches words in the stored full description, so mapping/search logic was not changed.
- Mix templates now list both Aggregate and Filler materials. WMM and GSB are hidden for bituminous mixes based on bitumen percentage or mix type, without removing saved proportions.
- After an edit that changes proportions, the server checks current dispatch usage. The rebuild notice appears only when at least one dispatch uses the template; the rebuild action is unchanged.

No schema or business-data changes were made. Production was not accessed and the app was not published.

## Verification

- Focused tests: **15 passed** across the DPR draft, Map to Norm, and app-recovery tests.
- Full suite: **5,810 passed, 6 failed, 3 skipped** (475 files: 469 passed, 4 failed, 2 skipped). The six failures are the known existing failures in `arrangementProcurementCorrection.test.ts`, `materialReceiptReversal06mD.test.ts`, `purchase-indent-pi01.test.ts`, and three assertions in `unscheduledReportCredit.test.ts`; no new failure came from DPR-FIX-01.
- `npm run build`: passed.
- Extra check: `npm run check` reports 490 TypeScript diagnostics across 66 files. The new helper files and the changed sections did not add diagnostics; the required production build passes.
- The development app restarted with read-only startup readiness. The preview showed the login screen; the signed-in edit screen was not interactively opened.
