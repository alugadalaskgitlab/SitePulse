-- DPR-01 Parts 8/9: classify a site material trip's transport source and,
-- when available, link in-house transport to the existing equipment master.
-- Both columns are deliberately nullable for historical-trip compatibility.
ALTER TABLE site_material_trips
  ADD COLUMN IF NOT EXISTS transport_type text,
  ADD COLUMN IF NOT EXISTS internal_equipment_id integer;