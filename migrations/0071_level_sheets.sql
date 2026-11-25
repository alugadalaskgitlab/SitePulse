-- LEVELS-01 Part 2: level sheet settings, reusable design levels, sheets and
-- staff links. Additive only; no existing rows or tables are changed.
CREATE TABLE IF NOT EXISTS level_sheet_site_settings (
  site_id integer PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  book_chainage_system text NOT NULL DEFAULT 'ours'
    CONSTRAINT level_sheet_site_settings_system_check
    CHECK (book_chainage_system IN ('ours', 'consultant')),
  consultant_offset_m real NOT NULL DEFAULT 0,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS level_sheet_design_rows (
  id serial PRIMARY KEY,
  site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  layer_name text NOT NULL,
  chainage_ours_km real NOT NULL,
  centre_level real NOT NULL,
  crossfall_left_pct real NOT NULL,
  crossfall_right_pct real NOT NULL,
  top_width_left_m real NOT NULL,
  top_width_right_m real NOT NULL,
  source text NOT NULL CONSTRAINT level_sheet_design_source_check
    CHECK (source IN ('EXCEL', 'TYPED')),
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT level_sheet_design_width_check
    CHECK (top_width_left_m >= 0 AND top_width_right_m >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS level_sheet_design_site_layer_chainage_uq
  ON level_sheet_design_rows(site_id, layer_name, chainage_ours_km);

CREATE TABLE IF NOT EXISTS level_sheets (
  id serial PRIMARY KEY,
  site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  boq_project_id integer REFERENCES boq_projects(id) ON DELETE SET NULL,
  boq_item_id integer REFERENCES boq_items(id) ON DELETE SET NULL,
  layer_name text NOT NULL,
  sheet_date date NOT NULL,
  instrument text,
  tolerance_above_mm real NOT NULL DEFAULT 20,
  tolerance_below_mm real NOT NULL DEFAULT 25,
  allowed_closing_error_mm real NOT NULL DEFAULT 10,
  reading_mode text NOT NULL DEFAULT 'rl' CONSTRAINT level_sheets_reading_mode_check
    CHECK (reading_mode IN ('rl', 'staff')),
  tbm_name text,
  tbm_rl real,
  initial_back_sight real,
  closing_fore_sight real,
  readings jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_by_type text NOT NULL DEFAULT 'not_checked' CONSTRAINT level_sheets_checked_by_check
    CHECK (checked_by_type IN ('not_checked', 'department', 'consultant')),
  checked_by_name text,
  checked_by_designation text,
  checked_date date,
  checked_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_name text,
  object_path text,
  mime_type text,
  file_size integer CONSTRAINT level_sheets_attachment_size_check
    CHECK (file_size IS NULL OR file_size BETWEEN 0 AND 15728640),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'saved')),
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT level_sheets_tolerance_check CHECK (
    tolerance_above_mm >= 0 AND tolerance_below_mm >= 0 AND allowed_closing_error_mm >= 0
  )
);
CREATE INDEX IF NOT EXISTS level_sheets_site_date_idx
  ON level_sheets(site_id, sheet_date, id);
CREATE INDEX IF NOT EXISTS level_sheets_project_item_idx
  ON level_sheets(boq_project_id, boq_item_id);

CREATE TABLE IF NOT EXISTS level_sheet_staff (
  id serial PRIMARY KEY,
  level_sheet_id integer NOT NULL REFERENCES level_sheets(id) ON DELETE CASCADE,
  personnel_id integer NOT NULL REFERENCES personnel(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS level_sheet_staff_sheet_personnel_uq
  ON level_sheet_staff(level_sheet_id, personnel_id);
CREATE INDEX IF NOT EXISTS level_sheet_staff_personnel_idx
  ON level_sheet_staff(personnel_id);
