-- DPR-01 Parts 4/5. Additive and nullable for existing maintenance history.
-- A source is always an explicit operational-row reference; no equipment/date
-- matching is used because a row may have more than one breakdown.
ALTER TABLE equipment_maintenance_logs
  ADD COLUMN IF NOT EXISTS from_time text,
  ADD COLUMN IF NOT EXISTS to_time text,
  ADD COLUMN IF NOT EXISTS responsibility text,
  ADD COLUMN IF NOT EXISTS repair_scope text,
  ADD COLUMN IF NOT EXISTS debitable_to_vendor boolean,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_record_id integer;

CREATE INDEX IF NOT EXISTS eml_source_lookup_idx
  ON equipment_maintenance_logs (source_type, source_record_id);