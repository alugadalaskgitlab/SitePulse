-- Additive facts only: no UPDATE, inferred values, default or historical rewrite.
ALTER TABLE site_material_trips
  ADD COLUMN IF NOT EXISTS material_source_type text,
  ADD COLUMN IF NOT EXISTS material_source_label text;
