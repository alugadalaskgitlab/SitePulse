-- ORDERS-01 add-on: order-specific work metadata, quantity unit and mix snapshot.
-- Existing orders/dispatches/templates are not rewritten by this migration.
ALTER TABLE plant_supply_orders
  ADD COLUMN work_name text,
  ADD COLUMN division text,
  ADD COLUMN mandal text,
  ADD COLUMN district text,
  ADD COLUMN agreement_estimate_ref text,
  ADD COLUMN estimate_sor_year text,
  ADD COLUMN mt_per_cum_factor numeric(12,6);

ALTER TABLE plant_supply_order_lines
  ADD COLUMN entered_quantity numeric(20,6),
  ADD COLUMN entered_unit text;

CREATE TABLE plant_supply_order_mix_specs (
  id serial PRIMARY KEY,
  order_line_id integer NOT NULL UNIQUE
    REFERENCES plant_supply_order_lines(id) ON DELETE CASCADE,
  mix_name text NOT NULL,
  source_bitumen_percent real NOT NULL,
  bitumen_percent real NOT NULL,
  ldo_norm real,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plant_supply_order_mix_components (
  id serial PRIMARY KEY,
  order_mix_id integer NOT NULL
    REFERENCES plant_supply_order_mix_specs(id) ON DELETE CASCADE,
  material_id integer NOT NULL REFERENCES plant_materials(id),
  aggregate_share_percent real NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX plant_supply_order_mix_components_sort_idx
  ON plant_supply_order_mix_components(order_mix_id, sort_order, id);
