ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS tally_ledger_name text;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS tally_cost_centre_name text;

ALTER TABLE equipment_master
  ADD COLUMN IF NOT EXISTS tally_cost_centre_name text;

INSERT INTO app_settings (key, value)
VALUES (
  'tally_export_config',
  '{"companyName":"High Lane Constructions Pvt Ltd - SK 2025-26","cutoverDate":"2026-01-31","projectCategory":"Projects","resourceCategory":"Resources"}'
)
ON CONFLICT (key) DO NOTHING;
