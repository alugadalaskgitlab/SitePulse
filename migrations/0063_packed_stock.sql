-- STOCK-02: packed units for barrels/drums and audited decant events.
-- Additive only. Existing receipt, stock and ledger rows are not rewritten.
BEGIN;

ALTER TABLE plant_materials
  ADD COLUMN IF NOT EXISTS packed_unit_name text,
  ADD COLUMN IF NOT EXISTS packed_unit_net_weight_kg real,
  ADD COLUMN IF NOT EXISTS packed_unit_volume_liters real;

ALTER TABLE material_receipts
  ADD COLUMN IF NOT EXISTS packed_count real,
  ADD COLUMN IF NOT EXISTS packed_unit_name text,
  ADD COLUMN IF NOT EXISTS packed_stock_quantity real,
  ADD COLUMN IF NOT EXISTS actual_net_weight_kg real;

ALTER TABLE pending_plant_receipts
  ADD COLUMN IF NOT EXISTS packed_count real,
  ADD COLUMN IF NOT EXISTS packed_unit_name text,
  ADD COLUMN IF NOT EXISTS actual_net_weight_kg real;

ALTER TABLE stock_ledger
  ADD COLUMN IF NOT EXISTS stock_position text,
  ADD COLUMN IF NOT EXISTS packed_count_in real,
  ADD COLUMN IF NOT EXISTS packed_count_out real;

CREATE TABLE IF NOT EXISTS plant_stock_decants (
  id serial PRIMARY KEY,
  date date NOT NULL,
  party_id integer REFERENCES parties(id) ON DELETE SET NULL,
  material_id integer NOT NULL REFERENCES plant_materials(id),
  packed_count real NOT NULL,
  stock_quantity real NOT NULL,
  stock_uom text NOT NULL,
  tank_number integer NOT NULL,
  created_by_user_id integer,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plant_stock_decants_date_idx
  ON plant_stock_decants (date);
CREATE INDEX IF NOT EXISTS plant_stock_decants_material_party_idx
  ON plant_stock_decants (material_id, party_id, date);

COMMIT;
