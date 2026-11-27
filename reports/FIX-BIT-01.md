# FIX-BIT-01

## Part 1 — bitumen tracker crash

The page treated `{ rows, canDecant }` as an array. It now reads `rows`, defaulting to an empty list. Ledger positions use the returned MT fields; screen/PDF/print/Excel show `—` for missing or non-numeric values. The existing route was not changed.

Focused tests: **29 passed (2 files)**, including rendered real-shape, missing/empty rows, malformed values and Excel output. Build passed. No migration or real data changes.

## Safety check

Read-only catalog checks found **no CHECK constraints on stock_ledger** in either `sitelog_dev` or development `heliumdb`. No production access.

## Part 2 — Owner move to tank

Both trackers now show **Move to tank** for the Owner on non-zero unassigned rows. The confirmation shows party, material, the full amount and unit, date (today by default), Tank 1/Tank 2, and the four before/after figures. Cancel writes nothing.

The Owner-only route locks the ledger while checking the current amount. It writes two `tank_assignment` rows and the before/after audit in one transaction. Stale amounts are refused; an audit failure rolls back both rows. Notes are `Old unassigned stock moved to Tank <n>`. Stock balances are not written.

Assignments affect tank/unassigned positions only. Stock receipt/issue summaries and party statements exclude them. Physical receipt, consumption, reconciliation and norm-vs-actual sources are unchanged.

Fixture results:
- LDO: Tank 1 **−6,988.401 L → 0**, unassigned **6,988.401 L → 0**, total **0 → 0**.
- Tank 2 selection and bitumen in MT passed.
- Non-Owner (including Administrator) gets 403. Stale/repeated confirmation is refused.
- Receipt/issue totals, party statement, LDO consumption/reconciliation and norm-vs-actual totals stayed unchanged. Physical records and stock balances matched before/after.
- Both tracker pages render the Owner action. Confirmation, Cancel, default tank/date, Tank 2 and stale-error rendering passed.

## Final checks

- Part 2 focused checks: **94 passed across 10 files**. The additional audit-rollback test passed in the full run.
- **Full suite run once: 6,235 passed, 0 failed, 3 existing skips**. All **528 files** matched the test inventory: 526 executed, 2 wholly skipped (`labour01WorkersPostgres` and the `vb23b` server fixture).
- `npm run build` passed after each part.
- Dev restart passed read-only startup readiness: **ready=true, 2,562 columns checked**.
- Signed-in screens were verified with fixture render tests, not a signed-in browser session.
- **No migration, real data changes, stock repairs, production database access or publishing.** No real stock was moved. No receipt, dispatch, dip/flow reading, bill or payment was changed.
