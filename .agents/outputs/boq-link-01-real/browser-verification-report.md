# BOQ-LINK-01 real development browser verification

## Environment and safety

- Used the already-running development app through its real proxied origin, authenticated Chromium CDP session on port 9223, and real API/database. Database helper asserted `current_database() = sitelog_dev`.
- No application code edits, mocks, authentication bypasses, production writes, publication, workflow starts/restarts, or historical DPR saves.
- Created only new development DPRs: **249**, edit-as-copy **250**, No Site Work **251**, and second edit-as-copy **252**. These records remain for the main agent's assertion/rollback decision.
- Test administrator **id 9** was deactivated using the real user-management API. HTTP 200 and database `is_active=false` verified; see `test-account-deactivation.json`. No existing users were deleted.

## Results

| Test | Result | Real UI exercise and database evidence |
| --- | --- | --- |
| B | PASS | Guided DPR, THAKADPALLY - SIRUR, project 2, one Clearing and grubbing activity, BOQ item 13/programme bar 26617, date 2026-05-25. Added a NEW Skilled/Male labour row: item preselected and exact Suggested note visible. Added JCB-PLANT with 08:00–10:00: automatically created one full 2-hour segment with Suggested note, linked to item/bar. Added JCB-SITE using meter 100–102 and explicitly empty start/end: no suggestion or segment. Saved DPR 249, reopened through Guided UI, and verified persisted data. All equipment parent `boq_item_id` values are NULL. |
| E | PASS | Added 40-30 KVA GENERATOR through Guided, checked General, entered meter 200–201, saved draft 249. Reopened draft through real Guided route and progressed to equipment step: checkbox `aria-checked=true`, no assignment editor for General DG. Database and detail API show `resource_scope='general'`, NULL parent BOQ link, no segments/allocations. Same state remained after submission and both copies. |
| G | PASS | Submitted draft 249 from Guided review: dialog said “Nothing blocks submission” and showed precisely JCB-SITE unlinked advisory. Clicking Jump to row switched to equipment and applied `ring-2 ring-destructive ring-offset-2` to equipment row index 1, not rows 0/2. Returned to review, clicked Submit anyway, reached real success page `/site/success/249`; database status submitted. Created No Site Work DPR 251 with meaningful unlinked labour (count 1, scope NULL, BOQ NULL). Submit went directly to success, with no unlinked advisory dialog. |
| H | PASS | Correct route `/site/report/246` rendered submitted DPR-246, two activities and existing JCB readings/times/fuel/segments. Never saved or edited it. Re-read all tables represented in the original baseline and asserted exact equality; all existing resource scopes remain NULL. A second read-only opening compared the complete detail API response AND segment-to-BOQ junction rows before/after, both exactly equal. See the completed H evidence below. The initial 404 screenshot is excluded from delivery. |
| I | PASS | Draft 249 → actual UI Submit anyway preserved General DG. Opened only newly created DPR 249 in Detailed edit and saved as copy 250, retaining DG General while adding General labour/material through UI. Reopened copy 250: DG checked and labour/material selects both General. Saved a second UI edit-as-copy 250→252, with existing General equipment/labour/material unchanged. Reopened 252 and verified all three UI controls. DB version rows 13/14 connect 249→250 and 250→252; all scopes round-trip and equipment parent links remain NULL. |

## Evidence files

Paths below are relative to `.agents/outputs/boq-link-01-real/`:

- **B:** `B-labour-single-suggestion.png`, `B-machine-full-clock-suggestion.png` (clock inputs), `B-meter-only-unassigned.png`, `B-full-clock-segment-saved-reopened.png` (saved linked segment).
- **E:** `E-general-DG-before-save.png`, `E-general-DG-reopened.png` (reopened readings; checked toggle was above viewport), `I-DG-General-copy-reopened-checkbox.png` (persisted checked toggle clearly visible).
- **G:** `G-unlinked-advisory.png`, `G-unlinked-row-highlight.png`, `G-submit-anyway-success.png`, `G-no-work-unlinked-labour.png`, `G-no-work-review.png`, `G-no-work-submit-direct-success.png`.
- **H:** `H-old-readonly-actual.png`, `H-old-readonly-equipment-segments.png`, `old-dpr-after-browser.json`.
- **I:** `I-general-labour-material-copy-input.png`, `I-edit-as-copy-success-250.png`, `I-general-scopes-copy-reopened.png`, `I-second-copy-success-252.png`, `I-second-copy-general-scopes-reopened.png`.
- **DB/API:** `browser-db-evidence.json`, `new-dpr-249-submitted-before-copy.json`, `new-dpr-250-copy.json`, `new-dpr-{249,250,251,252}-final-api.json`, `test-account-deactivation.json`.
- **Reproducible readonly assertions:** `capture-db-evidence.mjs`; syntax check and all assertions passed before account deactivation.

## Observations and limitations

- A newly selected equipment row initially had a current start time from the existing entry UI. For the meter-only test, I explicitly cleared it before entering meter readings. BOQ suggestion logic did not invent any segment times; persisted meter-only start/end stayed empty. This test does not assert that selecting a machine itself never defaults a start time.
- Issued material switched from Received/empty BOQ to the single-activity suggestion before I deliberately changed it to General. This was incidental real UI coverage, not a substitute for the separately assigned complete Test F.
- Wizard future-step clicks did not advance while disabled; I used real Next/Back controls instead. Several exploratory scripts stopped at absent selectors or incorrect guessed SELECT column names; they caused no writes. The completed flow and assertions above subsequently succeeded.
- No application blocker was encountered. Unit suite, mandatory-list parity, production baseline, migration/publish diff, and tests outside B/E/G/H/I remain the main agent's responsibility.

## Completed H comparison

The main agent briefly reactivated the same development-only test account, authenticated normally, and took complete API and junction-table snapshots before and after another read-only opening of `/site/report/246`. No DPR write occurred. The account was deactivated again in a finally block.

- `H-complete-before.json` equals `H-complete-after.json`.
- `H-junction-before.json` equals `H-junction-after.json`.
- Result: `H-complete-result.json`; both equality assertions passed.
- SHA-256 of the serialized complete detail response: `dead7d2c0abbe5d456dab4d9a8b07bc3c0707ee3caa54a91c641f4d7aade3ce6`.
- Screenshot: `H-complete-detail-reread.png`, supplemented by the earlier full report/equipment screenshots.

## Single stale assertion

Only one assertion line changed in `tests/focusedDprRestoration1449.test.ts`. It now checks the actual shared dropdown's `No work item` option, rather than searching SiteEdit for markup that was extracted into that component. The requested assertion passes. The file reports **3 passed / 1 failed**; the remaining pre-existing failure is a separate compact-equipment `<details>` source-string assertion at line 40. It was not changed. This is not a full-suite rerun.

## Publish diff and recovery

The read-only Publish schema comparison returned exactly the statements in `publish-diff.sql`: three nullable text-column additions, no defaults. No removals, truncations, warnings, or backwards-compatibility flags. This is the current non-interactive preview; review the actual Publish dialog again if schema changes occur before publishing. No publish was performed.

See `rollback-plan.md` for the documented production recovery procedure. Prefer an application rollback that retains the additive columns; a database point-in-time restore is a separate, explicitly confirmed action and requires reconciliation of subsequent entries.