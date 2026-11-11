# DPR-FLOW-01 — Part A findings and Part B implementation

## Scope and safety

- All record checks used the development database `sitelog_dev`, inside read-only transactions.
- No production database or replica was queried.
- Part A was read-only: no DPR, user, session, other operational record, or application code changed during that investigation. Part B implementation is documented below.
- The screen behavior below is traced from the current routes and components; I could not verify it in a signed-in browser session.
- Part A findings are preserved here before the Part B implementation record.

## 1. Current draft-to-submit paths

For DPR #405, the Site Dashboard card currently has the `Draft` badge and, because its saved sections pass the ordinary draft-readiness check, the `No readiness blockers` badge. The card has no Submit button. It offers `View`; the `Fix` button appears only when ordinary readiness is blocked.

The requested path works as follows:

1. Dashboard `View` opens `/site/report/405`.
2. The report screen shows the draft status and an `Edit` action.
3. `Edit` opens `/site/edit/405`; the route detects a draft and loads the `DprSections` page.
4. The page offers `Review & Submit`. Its local readiness is based on saved-section readiness, not chainage overlap.
5. After opening review, `Submit DPR` is enabled when that local readiness passes. The server then checks the saved sections and chainage overlap.

This is not the only route to the draft submission flow:

- When a draft is not ready, Dashboard `Fix` opens `/site/edit/:id`, which also routes the draft to `DprSections`.
- Field Home’s `Continue draft` route opens `/site/work/:id`; that route also renders `DprSections`.
- From `DprSections`, the optional combined Detailed and Guided editors are additional draft-editing paths.

`/dpr/:id` is a separate legacy detail route. The code search found no current list or report link that sends a draft there; the Progress Report links to `/site/report/:id`. A draft can still be opened by entering `/dpr/405` directly, where it shows `Draft — not submitted` and an `Edit Report` action. That action tries to clone the DPR, but the server rejects draft cloning with HTTP 409 and:

> A draft DPR cannot be cloned. Edit, save, or submit the draft instead.

So this route is not another working draft-submit path.

## 2. DPR #405 against DPR #402

Read-only development data:

| DPR | Date | Status | BOQ item / activity | Side | Chainage | Quantity |
|---|---|---|---|---|---|---:|
| #402 | 2026-09-28 | Submitted, active | Item 17, WET MIX MACADAM | Full Width | 0+380–0+700 | 180 CUM |
| #405 | 2026-09-29 | Draft, active | Item 17, WET MIX MACADAM | Full Width | 0+280–0+400 | 67.5 CUM |

These ranges intersect from 0+380 to 0+400: 20 m. #402 qualifies as prior submitted work. #405 is a draft and is excluded from prior-submission overlap checks.

### What each screen currently shows

- **Dashboard list:** #405 has one progress row, four equipment rows, two labour rows, and no material, purchase, or structure rows. The saved equipment and labour evidence passes ordinary readiness, so the card is labelled `No readiness blockers`. That check does not include chainage overlap.
- **DPR Sections page:** the saved sections pass its local readiness check. The page has `Review & Submit`; its review says `Only saved sections are included. Submission rechecks every section version on the server.` It does not show the overlap warning, and its local Submit button is enabled.
- **Activity row editor:** this is where the current overlap warning appears. It says `Part of this chainage overlaps previously recorded progress.` The detail identifies DPR-402, its date, Full Width chainage 0+380–0+700, quantity 180 CUM, and the overlapping segment 0+380–0+400. It says `A reason is required before Final Submit (draft save is not blocked).` and provides `Give reason`.
- **Submit from DPR Sections:** the server finds the overlap and returns a mandatory issue labelled `WET MIX MACADAM`, with the message `Possible chainage overlap requires a reason before submission.` The top-level error is `DPR is not ready to submit`. The current sections-page client displays that generic top-level message, not the detailed mandatory issue.

The distinction is that dashboard and Sections readiness check completeness, while the final server submit also checks overlap. The warning is available in the activity editor but is not surfaced in the Sections review before Submit.

## 3. Requested correction preview for DPR #402

**Not performed in the UI.** The development database has no temporary test/temporary Owner account. I did not use or change either existing Owner account, create a privileged account directly in the database, or bypass normal authentication. Therefore I did not open the Owner correction editor, press Save, or observe an actual correction dialog. No correction or review request was saved.

Code- and data-derived preview, not a browser-observed result:

- Changing only the start chainage to 0+400 leaves the end at 0+700.
- The saved row is calculated from length 320 m × width 3.75 m × thickness 0.15 m = 180 CUM. The correction review recalculates length to 300 m and quantity to 168.75 CUM, retaining the calculated quantity source.
- The project has a confirmed working reach from 0.0 to 1.6 km applying to item 17; the proposed range is inside it. Programme bar 924 also covers 0.0–1.6 km. The adjacent submitted interval ending at 0+400 only touches the proposed range; the overlap rule treats touching intervals as non-overlap. The draft #405 is not an eligible prior. These checks indicate no expected scope, programme-range, or overlap block from the proposed range, but the correction preview itself was not run, so no actual blocked-item/error list can be certified.
- Under the pre-Part-B rules, the derived `length` and `quantity` fields required Administrator approval. The correction review recalculates length to 300 m and quantity to 168.75 CUM, retaining the calculated quantity source. The dialog would therefore have shown `This correction will await Administrator approval. The recorded DPR remains unchanged until approval; your entered edits stay in the editor.` Its action would have been `Submit for approval`, not direct save. A different Administrator had to review it; the requester could not approve their own correction.
- The dialog also requires a correction reason and explicit impact confirmation. The correction remains unsaved until the final action, which was not taken.

This requested Owner-only check remains unverified until a temporary development Owner can be accessed through normal authentication. No existing account was changed.

## 4. Progress Report eligibility

The Progress Report source filters to submitted DPRs that are not deleted, cancelled, or superseded, and excludes progress rows with a pending chainage review. A read-only check against the same eligibility criteria returned **0 eligible rows for draft DPR #405**. Its overlap cannot appear in Progress Report as submitted progress until the DPR is submitted.

## Part A outcome

The behavior at the time of Part A was confirmed from the development records and code paths. The dashboard and Sections page could present #405 as ready even though final Submit would reject it for an unexplained overlap; the detailed warning existed in the activity editor, but the Sections Submit error hid its mandatory detail. The requested correction-dialog observation was blocked because no temporary development Owner login was available. No changes were applied during Part A.

## Part B — implementation and verification

### A. Owner correction of derived geometry

- An Owner can save a submitted-DPR correction directly only when the approval-required changes are limited to derived progress `length` and `quantity` fields. The normal correction review, mandatory reason, and explicit impact confirmation remain required.
- The saved audit record identifies the Owner and records the old/new values and reason. Correction history labels this result **Corrected by Owner** and shows the old/new values.
- Other users still enter the existing approval flow. Owner status does not bypass approval for unrelated changes such as equipment corrections.
- An isolated PGlite copy of the #402 geometry fixture previews 0+400–0+700 as 300 m / 168.75 CUM, saves with a reason, and verifies history. A separate non-Owner test confirms the same geometry correction stays pending and leaves the saved report unchanged.

### B. Section-submit overlap feedback

- Server submit errors now include the conflicting submitted DPR and exact overlap segment.
- The Sections page shows each conflict in plain language, including the BOQ activity, chainage span, length, prior DPR number and date; it offers **Correct chainage** and **Give reason**.
- Correct-chainage opens the matching activity row. Give-reason opens its existing reason dialog. The submission error is cleared while the user works on the selected issue.

### C. Immediate refresh paths

Before Part B, these live paths did not consistently invalidate all DPR-derived screens; they relied on the five-minute stale period or a manual Refresh:

- Sections-page save and submit.
- New and draft saves from Site Entry and Guided DPR.
- Draft saves and submits from Site Edit.
- Owner correction saves and non-Owner approval requests/decisions.
- DPR cancellation and deletion, plus legacy detail-page delete/clone.
- Today’s draft creation from Field Home and overlap-resolution changes from Progress Report.

They now use one shared invalidation helper to refetch DPR list/detail and related dashboard counts, Progress Report, Plan vs Actual, site stock/purchases, and plant stock balances/ledgers. Single-section saves remain on the Sections page. Approval requests stay on the current page and retain **Sent for approval**.

### D. Submit/correction return navigation

- Successful final submit shows `DPR #<id> submitted`; a saved correction shows `DPR #<id> corrected`.
- Both return to the validated `returnTo`, defaulting to `/site/dashboard`. When returning to the DPR register, the changed DPR is fetched even outside the current date filter, scrolled into view, and briefly highlighted.
- A single-section save stays on the Sections page. A correction sent for approval stays there with **Sent for approval**.

### Verification and limitations

- Focused tests: **8 files passed, 104 tests passed**. Files: `dprCorrections.integration.test.ts`, `dprSections13.integration.test.ts`, `chainageOverlap06b.test.ts`, `siteEditDpr10.test.tsx`, `DprCorrectionDialog.test.tsx`, `DprSectionsSubmitIssues.test.tsx`, `dprQueryInvalidation.test.ts`, and `progressReportNav.focus.test.ts`.
- The earlier Part B check reported **457 TypeScript diagnostics across 59 files**. The final check after the remaining workflow work reported **456 diagnostics across 58 files**; the project-wide typecheck is still not clean and includes unrelated errors.
- The Owner browser correction and live no-Refresh interaction could not be exercised because development-login approval was declined. No temporary Owner user was created; no user/session or DPR record was changed, and no cleanup was needed. The correction, overlap response, refresh matching, and navigation were verified with isolated automated tests instead.
- No production database or replica was queried. No schema or application database data was changed. Nothing was published.

## Part B continuation — draft list and submit workflow

- **Dashboard list:** active, ready drafts now show **Submit** and **Open**. Submit opens a short review of the saved date, activity names with chainage and quantity, equipment row count, labour count, and diesel. It submits the saved section tokens directly; it does not save the sections again. A successful submit refreshes DPR-derived screens and returns to the dashboard with that DPR focused. Clicking the draft card or **Open** opens its sections.
- **Not-ready drafts:** the list shows **Not ready** and the first blocking reason; overlap blockers name the prior DPR, for example **Not ready — overlap with DPR #402**. **Fix** opens the sections and focuses the affected activity/action. Unavailable readiness also stays out of the Submit path.
- **Draft routes:** `/site/report/:id` labels an active draft **Draft — not submitted** and offers **Submit** and **Open sections** instead of Edit. `/dpr/:id` hides the invalid clone-style **Edit Report** action for a draft and offers **Open sections**.
- **Overlap consistency:** the list and Sections page now receive overlap blockers from the same server-side chainage check used at final submit. The Sections review displays the prior DPR and overlap segment with **Correct chainage** / **Give reason** actions; unexplained overlap remains blocked. After saving a corrected chainage, the derived DPR queries are refreshed so the list can expose Submit when the saved draft is ready. Progress Report item rows show **Drafts are not counted. 1 draft with possible overlap: DPR #…** with a link to the draft.
- **Sections page:** when the saved sections are ready, **Review & Submit** also appears at the top. The page states: “Saved sections are kept. You do not need to save them again.”
- **Tests:** final focused run passed **41 tests in 4 files**: `dprSections13.integration.test.ts`, `DprDraftSubmitDialog.test.tsx`, `DprSectionsSubmitIssues.test.tsx`, and `dpr20B4MaterialsClarity.test.tsx`. Tests cover an overlapping fixture in list/readiness, Sections and review feedback; the corrected chainage clears the blocker without changing operational row counts; the ready review posts directly to submit without a section save and returns focused.
- **Full-suite status:** the configured full test workflow completed with **5 files failing and 442 passing** (2 skipped); **7 tests failed, 5,642 passed** (3 skipped). The failing files were `arrangementProcurementCorrection.test.ts`, `materialReceiptReversal06mD.test.ts`, `purchase-indent-pi01.test.ts`, `unscheduledReportCredit.test.ts`, and `vendorBillVb15Server.test.ts`. None is in the DPR workflow changes covered by this continuation.
- **Build:** `npm run build` passed. `npm run check` remains blocked by the project-wide TypeScript diagnostics noted above; no diagnostics were reported in the newly added submit dialog or the updated Sections, Dashboard, Site Report, legacy Details, and Progress Report client code.
- **Safety:** test data was confined to isolated test fixtures. No development operational DPR, user, or session records were changed; no production or replica access occurred; no publication was performed.
