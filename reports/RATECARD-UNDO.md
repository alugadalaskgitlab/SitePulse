# RATECARD-UNDO

## Scope

Reverted the RATECARD-01 code changes from commits `c9393d5`, `bf4ea41`, and
`8df36b8`, newest first, as one new revert commit. This did not use a checkpoint,
restore database data, change schema, or publish the app. The existing
`reports/RATECARD-01.md` history report was retained.

The Rate Card tidy workflow and its dedicated tests were removed. Existing tests
were restored to their pre-RATECARD-01 versions.

## File comparison

Compared the requested files with commit `d48d589`:

- `client/src/pages/RateCards.tsx`
- `client/src/pages/VendorBills.tsx`
- `client/src/pages/VendorMaster.tsx`
- `client/src/lib/vendorBillRateSelection.ts`
- `server/routes.ts`
- `server/storage.ts`
- `shared/vendorRateCardIdentity.ts`

All seven files have an empty diff against `d48d589`, including `server/routes.ts`
and `server/storage.ts`; there are no remaining differences in those files.
`server/vendorRateCardTidy.ts`, `shared/vendorRateCardTidy.ts`,
`tests/rateCardTidyUi.test.tsx`, and `tests/vendorRateCardTidy.test.ts` are absent
again, matching the pre-RATECARD-01 state. No RATECARD-01 report was removed.

## DPR readiness fix

`client/src/pages/SiteDashboard.tsx` and
`tests/dpr19B1SiteDashboard.test.tsx` still match commit `9b5b12a`. The dashboard
test passed in the focused run.

## Tests and build

Ran the 119 Rate Card, vendor-bill, and DPR test files present at `d48d589`:

- 118 files passed; 1 file failed.
- 1,299 tests passed; 1 test failed.
- Failure: `tests/vendorBillVb15Server.test.ts` — “suppresses the linked mirror
  on both equipment and All auto-item pulls”.
- Error: `TypeError: Cannot read properties of undefined (reading 'isCancelled')`
  at `shared/vendorBillTripRoles.ts:16`, reached from
  `tests/vendorBillVb15Server.test.ts:152`.
- The failing test and its related implementation file match `d48d589`; the
  failure is outside the reverted Rate Card code.

`npm run build` passed. It reported the existing stale Browserslist-data and
large-chunk warnings.

## Git

The combined revert and this report were committed and pushed to `origin/main`.
