BEGIN;
ALTER TABLE diesel_requirements ADD COLUMN filled_directly boolean DEFAULT false;
ALTER TABLE diesel_requirements ADD COLUMN filled_on date;
ALTER TABLE diesel_requirement_items ADD COLUMN direct_fill_qty real;
CREATE UNIQUE INDEX stock_ledger_diesel_direct_fill_item_idx
  ON stock_ledger (reference_id) WHERE transaction_type = 'diesel_direct_fill';
COMMIT;
