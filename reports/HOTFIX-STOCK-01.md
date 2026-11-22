# HOTFIX-STOCK-01

## Fix

Restored the missing `useEffect` import in `PlantStock.tsx`. No page behavior was changed. Added render coverage for the stock and ledger tabs, return navigation from Stores and HMP Operations, and routes with or without `context` and `returnTo` parameters. The tests check that the page renders, the back link is correct, and context is added at most once.

The missing-name diagnostics across the PROC-FIX-01 and PLANT-03 files found one missing import: `useEffect` in `client/src/pages/PlantStock.tsx`. No other TS2304 or TS2552 errors were found. The broader typecheck still reports unrelated existing diagnostics; they were not changed.

## Checks

- Plant Stock focused render test: 8 passed.
- Focused plant tests: 6 files, 18 passed.
- Full suite: 491 test files passed, 2 skipped; 5,926 tests passed, 3 skipped, 0 failed. The suite used a disposable database with the development schema only.
- `npm run build`: passed.
- No database, stock, or ledger data was changed for this hotfix.
