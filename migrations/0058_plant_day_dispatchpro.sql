ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS dispatchpro_site_id text;

ALTER TABLE truck_dispatches
  ADD COLUMN IF NOT EXISTS dispatchpro_id text,
  ADD COLUMN IF NOT EXISTS dispatchpro_challan_no text,
  ADD COLUMN IF NOT EXISTS dispatchpro_status text,
  ADD COLUMN IF NOT EXISTS dispatchpro_sync_status text,
  ADD COLUMN IF NOT EXISTS dispatchpro_arrived_at timestamp,
  ADD COLUMN IF NOT EXISTS dispatchpro_arrived_by_name text,
  ADD COLUMN IF NOT EXISTS dispatchpro_left_at timestamp,
  ADD COLUMN IF NOT EXISTS dispatchpro_left_by_name text,
  ADD COLUMN IF NOT EXISTS dispatchpro_last_error text,
  ADD COLUMN IF NOT EXISTS driver_mobile text;

ALTER TABLE plant_shift_logs
  ADD COLUMN IF NOT EXISTS close_reason text;

CREATE TABLE IF NOT EXISTS dispatchpro_outbox (
  id serial PRIMARY KEY,
  dispatch_id integer NOT NULL,
  external_ref text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'patch', 'cancel')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  last_attempt_at timestamp,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS dispatchpro_outbox_due_idx
  ON dispatchpro_outbox (status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS dispatchpro_outbox_dispatch_idx
  ON dispatchpro_outbox (dispatch_id, id);
CREATE INDEX IF NOT EXISTS dispatchpro_outbox_external_ref_idx
  ON dispatchpro_outbox (external_ref);
