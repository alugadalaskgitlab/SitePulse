CREATE TABLE level_sheet_tbms (
  id serial PRIMARY KEY,
  site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  chainage_ours_km real NOT NULL,
  rl real NOT NULL,
  easting real,
  northing real,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX level_sheet_tbms_site_name_uq ON level_sheet_tbms(site_id, lower(trim(name)));
ALTER TABLE level_sheets ADD COLUMN closing_tbm_name text, ADD COLUMN closing_tbm_rl real;
