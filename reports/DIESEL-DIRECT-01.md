# DIESEL-DIRECT-01

## Part 1

Added the pump-fill tick, date and own-vehicle litres. Totals must match the purchased litres. Saving, adjusting, unticking and cancelling update the automatic received-and-issued ledger entries transactionally, with an actor/time audit and no store balance movement. Direct fills do not prompt for a store receipt; existing linked store receipts prevent switching the same purchase to a direct fill.

Migration `0078_diesel_direct_fill.sql` applied to **sitelog_dev and heliumdb**. Neither has a CHECK blocking this entry type. Existing purchase, item and ledger row counts/content were unchanged (sitelog_dev: 86/209/848; heliumdb: 4/7/354). No production access.

```sql
BEGIN;
ALTER TABLE diesel_requirements ADD COLUMN filled_directly boolean DEFAULT false;
ALTER TABLE diesel_requirements ADD COLUMN filled_on date;
ALTER TABLE diesel_requirement_items ADD COLUMN direct_fill_qty real;
CREATE UNIQUE INDEX stock_ledger_diesel_direct_fill_item_idx
  ON stock_ledger (reference_id) WHERE transaction_type = 'diesel_direct_fill';
COMMIT;
```

Focused tests: **32 passed, 4 files**. Build passed. The PostgreSQL receipt-concurrency fixture gained the new header column; its checks were not weakened. New real-schema tests verify totals, own equipment, balanced ledger entries, changes, untick, cancellation and unchanged normal purchases.

## Part 2

Vehicle entries show the purchase fill read-only and include it once in tank, consumption/mileage and diesel comparison calculations. Later entries on the same vehicle/day do not count it again. Saving a vehicle entry never posts the purchase litres a second time.

Existing store-stock or direct-purchase diesel produces “Needs your choice” on the purchase and vehicle entry. No existing usage or stock is altered before a deliberate choice. Keeping the purchase reverses the actual usage ledger/bucket; keeping the usage suppresses that vehicle's automatic entry; different fills retain both. Choices and reversals are audited in the same transaction, and a stale review is refused. Existing bill evidence on the usage is retained.

Migration `0079_diesel_direct_fill_choices.sql` applied to **both development databases**. The extra nullable JSON column retains explicit decisions against the particular usage quantity/source, so a changed entry cannot silently reuse an old decision. Existing item rows were unchanged apart from the new NULL field.

```sql
BEGIN;
ALTER TABLE diesel_requirement_items ADD COLUMN direct_fill_choices jsonb;
COMMIT;
```

Focused tests: **303 passed, 17 files**. Includes real PGlite transactions for all three choices, unchanged stock while waiting, reversal rollback, stale decisions, contractor diesel, one-time report attribution and ordinary purchase/source behaviour; UI tests check all three buttons and read-only labels. Build passed.

Development restart passed the read-only startup readiness check: `ready: true`, 2,562 columns checked. No startup migration or repair was added. No screenshots, browser checks or whole-project TypeScript check were run.

## Final check

Full suite ran **once**: **6,164 passed, 12 failed, 3 skipped** (518 files passed, 2 failed, 2 skipped). All failures were test setup/expectation updates:
- `dieselEntryPlant01.test.tsx` (11): its React Query mock omitted `useQueryClient`, now used by the review component. Added that mock; existing behaviour assertions remain unchanged.
- `perm01SupportingReads.test.ts` (1): expected two save arguments, not the new authenticated audit actor. Now verifies the actor too.

After those test-only fixes, **330 tests passed, 0 failed across 19 focused files**, including both failed files and a new full vehicle-form test proving purchase litres are read-only, included in measured consumption, and not submitted as another issue. The full suite was not rerun, respecting the once-only limit. Build and startup checks remain valid because only tests/report changed afterwards.

Two part commits; no production query, real-record repair, payment/bill change or publishing was performed.
