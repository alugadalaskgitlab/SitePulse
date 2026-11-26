# LEVELS-04

## Part 1
- RL mode now has an optional active-site TBM picker/manual entry, with no BS, FS or closing check. Existing saved metadata is not rewritten.
- Design levels appear under empty and filled boxes in both modes, with differences when a reading exists and a short reason outside the design/width.
- New sheets generate From–To rows (10 m default interval), CL and chosen left/right points in the site's book chainages. Individual rows remain removable; replacing entered readings asks first.
- Filled RL-to-staff conversion requests the missing TBM setup instead of reinterpreting existing numbers.
- Focused tests: **32 passed in 4 files**. Build passed. No schema change, production access, real-record changes or publish.

## Part 2
- Results filter by From–To in the site's book chainages and recompute stretch-only totals without losing instrument shifts before the stretch. The existing between-sheets range calculation is retained and tested.
- Saved layer defaults can be applied to all rows after an on-page count/value confirmation. Only that site's layer changes, with one old/new/count audit; a changed row count refuses the action.
- Design levels can create a saved RL sheet, marked **Assumed or agreed**, with server-derived readings and optional flat edge carry. Generated point remarks say “Made from design levels”; the sheet and print show that remark. No new remark column was needed.
- The fixture proves a 0.300 m difference across 10 m over a 10 m length gives **30.0 cum**. Assumed labels remain in lists, comparisons and print.
- Focused tests: **48 passed in 6 files**. Build passed. No migration or automatic changes to real records; no production access or publish.

## Part 3
- Check & sign now uses the sheet's grid and an offered From–To stretch. Empty entries are not checked; entered values show design, ours, theirs and **theirs minus ours**. The staff-reading mode includes TBMs, instrument shifts and closing results.
- The summary and status include the offered stretch, checked points/chainages and largest absolute difference.
- Both signature blocks support finger/mouse signing, Clear and Sign again. Names, designations, dates, PNG images and server-recorded user/time are saved. Print includes both images or blank signature lines, prominent properly capitalised names, the comparison grid and summary without solid fills. The signed-sheet attachment remains available.
- **No migration is needed in either sitelog_dev or heliumdb.** New check saves use a versioned object inside the existing `checked_points` JSON field. The API still returns the points array plus the new checking details. Old stored arrays are converted for display only; the real-schema test confirms reading them does not rewrite them.
- Also covered: PostgreSQL `real` precision at the last design chainage, RL-to-staff conversion, locked checking geometry and signatures whose recorder/time cannot be supplied by the client.
- Focused tests: **54 passed in 6 files**. Build passed. Existing tests were adjusted only for the requested removal of the “checked” checkbox, the new reading label/status, and the additional signature fields.
- No real sheets, design rows or TBMs were changed. No production access, screenshots, whole-project TypeScript check or publish.

## Final checks
- Final display adjustments keep staff-mode TBM selection explicit and restrict the checked print grid/totals to the offered stretch. These adjustments passed **20 targeted tests in 2 files** and a final build. They were made while the single full-suite run was running; the targeted checks cover those final edits.
- Development restarted successfully. Read-only startup readiness passed: **ready: true; 2,558 columns checked**. Nothing was added to either development database.
- Full suite ran **once**: **6,122 passed, 0 failed, 3 skipped**; **515 files passed, 2 skipped**. Duration: 390.64 seconds. Expected error-boundary fixture logs were not test failures.
- Signed-in screens were checked through rendered component tests and real-schema API fixtures, not a logged-in browser session. No screenshots were taken.
- All three parts are finished. No publish was performed.
