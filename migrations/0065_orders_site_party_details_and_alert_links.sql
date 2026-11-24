-- ORDERS-03: optional master details and order-aware supply alert navigation.
-- All added fields are nullable; existing records and snapshots are untouched.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS work_name text,
  ADD COLUMN IF NOT EXISTS client_department text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS mandal text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS agreement_estimate_ref text,
  ADD COLUMN IF NOT EXISTS estimate_sor_year text,
  ADD COLUMN IF NOT EXISTS mt_per_cum_factor numeric(12, 6);

ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS gst_no text,
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE plant_supply_alert_deliveries
  ADD COLUMN IF NOT EXISTS order_id integer REFERENCES plant_supply_orders(id) ON DELETE SET NULL;
