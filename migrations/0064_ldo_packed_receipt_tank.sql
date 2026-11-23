-- Additive-only support for assigning bulk fuel received through the GRN queue
-- to a tank, and retaining the operator-entered decant time.
ALTER TABLE pending_plant_receipts
  ADD COLUMN IF NOT EXISTS tank_number integer;

ALTER TABLE plant_stock_decants
  ADD COLUMN IF NOT EXISTS time text;
