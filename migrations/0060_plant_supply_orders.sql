-- ORDERS-01: forward-looking HMP supply orders, borrow approvals and alerts.
-- All changes are additive. Existing dispatches and stock records are untouched.
BEGIN;

ALTER TABLE truck_dispatches
  ADD COLUMN IF NOT EXISTS supply_order_id integer;

CREATE TABLE IF NOT EXISTS plant_supply_orders (
  id serial PRIMARY KEY,
  order_no text UNIQUE,
  party_id integer NOT NULL REFERENCES parties(id),
  site_id integer REFERENCES sites(id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  remarks text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by_user_id integer,
  created_by_name text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  closed_at timestamp,
  closed_by_user_id integer,
  closed_by_name text,
  CONSTRAINT plant_supply_orders_period_check CHECK (period_to >= period_from)
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'truck_dispatches_supply_order_id_fkey'
  ) THEN
    ALTER TABLE truck_dispatches
      ADD CONSTRAINT truck_dispatches_supply_order_id_fkey
      FOREIGN KEY (supply_order_id) REFERENCES plant_supply_orders(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS plant_supply_orders_party_period_idx
  ON plant_supply_orders (party_id, period_from, period_to);
CREATE UNIQUE INDEX IF NOT EXISTS plant_supply_orders_one_open_party_uq
  ON plant_supply_orders (party_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS truck_dispatches_supply_order_idx
  ON truck_dispatches (supply_order_id);

CREATE TABLE IF NOT EXISTS plant_supply_order_lines (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES plant_supply_orders(id) ON DELETE CASCADE,
  mix_template_id integer NOT NULL REFERENCES mix_templates(id),
  ordered_mt numeric(20,6) NOT NULL CHECK (ordered_mt > 0),
  planned_mt_per_day numeric(20,6) CHECK (planned_mt_per_day IS NULL OR planned_mt_per_day > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plant_supply_order_lines_order_idx
  ON plant_supply_order_lines (order_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS plant_supply_order_lines_order_mix_uq
  ON plant_supply_order_lines (order_id, mix_template_id);

CREATE TABLE IF NOT EXISTS plant_supply_order_material_scopes (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES plant_supply_orders(id) ON DELETE CASCADE,
  material_id integer NOT NULL REFERENCES plant_materials(id),
  scope text NOT NULL DEFAULT 'hlc' CHECK (scope IN ('hlc', 'party')),
  updated_at timestamp DEFAULT now(),
  updated_by_user_id integer,
  CONSTRAINT plant_supply_order_material_scopes_order_material_uq UNIQUE (order_id, material_id)
);

CREATE TABLE IF NOT EXISTS plant_supply_borrowings (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES plant_supply_orders(id),
  dispatch_id integer NOT NULL REFERENCES truck_dispatches(id),
  party_id integer NOT NULL REFERENCES parties(id),
  material_id integer NOT NULL REFERENCES plant_materials(id),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  uom text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'party_will_replace')),
  borrowed_by_user_id integer,
  borrowed_by_name text,
  borrowed_at timestamp DEFAULT now(),
  decision_by_user_id integer,
  decision_by_name text,
  decision_at timestamp,
  decision_note text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT plant_supply_borrowings_dispatch_material_uq UNIQUE (dispatch_id, material_id)
);
CREATE INDEX IF NOT EXISTS plant_supply_borrowings_party_material_status_idx
  ON plant_supply_borrowings (party_id, material_id, status);
CREATE INDEX IF NOT EXISTS plant_supply_borrowings_order_idx
  ON plant_supply_borrowings (order_id);

CREATE TABLE IF NOT EXISTS plant_supply_borrowing_events (
  id serial PRIMARY KEY,
  borrowing_id integer NOT NULL REFERENCES plant_supply_borrowings(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('borrowed', 'approved', 'party_will_replace', 'replaced')),
  actor_user_id integer,
  actor_name text,
  quantity numeric(20,6),
  uom text,
  note text,
  related_receipt_id integer,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plant_supply_borrowing_events_borrowing_idx
  ON plant_supply_borrowing_events (borrowing_id, created_at);

CREATE TABLE IF NOT EXISTS plant_supply_borrowing_replacements (
  id serial PRIMARY KEY,
  borrowing_id integer NOT NULL REFERENCES plant_supply_borrowings(id),
  receipt_id integer REFERENCES material_receipts(id) ON DELETE SET NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  uom text NOT NULL,
  marked_by_user_id integer,
  marked_by_name text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plant_supply_borrowing_replacements_borrowing_idx
  ON plant_supply_borrowing_replacements (borrowing_id);
CREATE INDEX IF NOT EXISTS plant_supply_borrowing_replacements_receipt_idx
  ON plant_supply_borrowing_replacements (receipt_id);

CREATE TABLE IF NOT EXISTS plant_supply_alert_deliveries (
  id serial PRIMARY KEY,
  dedupe_key text NOT NULL,
  recipient_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('running_low', 'exhausted', 'borrowed', 'morning_summary')),
  party_id integer REFERENCES parties(id) ON DELETE SET NULL,
  material_id integer REFERENCES plant_materials(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  CONSTRAINT plant_supply_alert_deliveries_dedupe_user_uq UNIQUE (dedupe_key, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS plant_supply_alert_deliveries_recipient_created_idx
  ON plant_supply_alert_deliveries (recipient_user_id, created_at);

COMMIT;
