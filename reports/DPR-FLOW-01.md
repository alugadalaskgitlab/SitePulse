# DPR-FLOW-01 — Part A findings

## Scope and safety

- All record checks used the development database `sitelog_dev`, inside read-only transactions.
- No production database or replica was queried.
- No DPR, user, session, or other operational record was changed. No application code was changed.
- The screen behavior below is traced from the current routes and components; I could not verify it in a signed-in browser session.
- This is Part A only. No Part B implementation was started.

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
- The derived `length` and `quantity` fields require Administrator approval under the current correction rules. The dialog would therefore be expected to show `This correction will await Administrator approval. The recorded DPR remains unchanged until approval; your entered edits stay in the editor.` Its action would be `Submit for approval`, not direct save. A different Administrator must review it; the requester cannot approve their own correction.
- The dialog also requires a correction reason and explicit impact confirmation. The correction remains unsaved until the final action, which was not taken.

This requested Owner-only check remains unverified until a temporary development Owner can be accessed through normal authentication. No existing account was changed.

## 4. Progress Report eligibility

The Progress Report source filters to submitted DPRs that are not deleted, cancelled, or superseded, and excludes progress rows with a pending chainage review. A read-only check against the same eligibility criteria returned **0 eligible rows for draft DPR #405**. Its overlap cannot appear in Progress Report as submitted progress until the DPR is submitted.

## Part A outcome

The current behavior is confirmed from the development records and code paths. The dashboard and Sections page can present #405 as ready even though final Submit will reject it for an unexplained overlap; the detailed warning exists in the activity editor, but the Sections Submit error hides its mandatory detail. The requested correction-dialog observation is blocked because no temporary development Owner login is available. No changes were applied.
