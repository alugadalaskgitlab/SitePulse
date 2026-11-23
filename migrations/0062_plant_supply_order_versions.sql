-- ORDERS-02: editable supply orders and effective-dated order-mix snapshots.
-- Existing dispatches and stock/ledger records are not rewritten.
BEGIN;

CREATE TABLE plant_supply_order_mix_versions (
  id serial PRIMARY KEY,
  order_line_id integer NOT NULL
    REFERENCES plant_supply_order_lines(id) ON DELETE CASCADE,
  effective_at timestamptz NOT NULL,
  mix_name text NOT NULL,
  source_bitumen_percent real NOT NULL,
  bitumen_percent real NOT NULL,
  ldo_norm real,
  reason text NOT NULL,
  created_by_user_id integer,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plant_supply_order_mix_versions_line_effective_uq
    UNIQUE (order_line_id, effective_at)
);

CREATE INDEX plant_supply_order_mix_versions_line_effective_idx
  ON plant_supply_order_mix_versions (order_line_id, effective_at, id);

CREATE TABLE plant_supply_order_mix_version_components (
  id serial PRIMARY KEY,
  mix_version_id integer NOT NULL
    REFERENCES plant_supply_order_mix_versions(id) ON DELETE CASCADE,
  material_id integer NOT NULL REFERENCES plant_materials(id),
  aggregate_share_percent real NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX plant_supply_order_mix_version_components_sort_idx
  ON plant_supply_order_mix_version_components (mix_version_id, sort_order, id);

ALTER TABLE truck_dispatches
  ADD COLUMN supply_order_mix_version_id integer
    REFERENCES plant_supply_order_mix_versions(id) ON DELETE SET NULL;

CREATE INDEX plant_supply_order_mix_version_idx
  ON truck_dispatches (supply_order_mix_version_id);

COMMIT;
