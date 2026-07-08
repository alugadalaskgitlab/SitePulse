-- Add work_type column to site_material_trips so quick-entry material trips
-- can be tagged/filtered/edited by work type (road | structure), matching
-- the work_type concept already used on dprs.
ALTER TABLE site_material_trips ADD COLUMN IF NOT EXISTS work_type text;
