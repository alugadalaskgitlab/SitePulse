CREATE TABLE level_sheet_layer_defaults (
  id serial PRIMARY KEY,
  site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  layer_name text NOT NULL,
  crossfall_left_pct real NOT NULL DEFAULT 0,
  crossfall_right_pct real NOT NULL DEFAULT 0,
  top_width_left_m real NOT NULL DEFAULT 0,
  top_width_right_m real NOT NULL DEFAULT 0,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX level_sheet_layer_defaults_site_layer_uq
  ON level_sheet_layer_defaults (site_id, layer_name);
