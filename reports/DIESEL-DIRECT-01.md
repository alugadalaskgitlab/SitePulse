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
