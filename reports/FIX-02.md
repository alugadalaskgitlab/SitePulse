# FIX-02 — Programme bars and Work Demand status

## What changed

- Programme-bar review now treats bars outside an applicable confirmed reach as removal suggestions and clips overlapping bars to the reach. It recalculates quantities from the clipped bars, so an outside bar does not reduce the quantity assigned to the remaining bars.
- Work Demand again displays “Material mapping required” beside the existing “Link to master” action.
- The bar-review test fixture now returns an empty BOQ-sections result before its scope-segments result, matching the current storage query order. Test expectations were not changed.

## Checks

- Focused tests: **27 passed** across `programmeScopeAlignmentApply.test.ts` and `arrangementProcurementCorrection.test.ts`.
- Full suite: **481 files; 5,864 passed, 3 skipped, 0 failed** (2 files skipped). It used a disposable local PostgreSQL database initialized from the current schema; no development or production database was accessed or changed.
- `npm run build`: passed.
- No real project bars were reviewed or changed. Nothing was published.

## Screenshots

I could not capture the requested authenticated screens. The preview browser reached the Work Programme route but received **401 Unauthorized**. I did not bypass login, modify an account, or use a real project. The fixture tests verify the outside-bar removal suggestion, clipped chainages and quantities; the Work Demand test verifies the required status text.
