-- SP-DP-LINK-01: retain DispatchPro links per SitePulse site and queue order sends.
-- Additive only; existing party links and truck outbox rows are unchanged.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS dispatchpro_site_id text;

ALTER TABLE dispatchpro_outbox
  ADD COLUMN IF NOT EXISTS supply_order_id integer REFERENCES plant_supply_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_site_id text,
  ADD COLUMN IF NOT EXISTS response_site_name text,
  ADD COLUMN IF NOT EXISTS link_choice text;

CREATE INDEX IF NOT EXISTS dispatchpro_outbox_supply_order_idx
  ON dispatchpro_outbox (supply_order_id, id);
