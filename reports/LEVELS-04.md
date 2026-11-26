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
