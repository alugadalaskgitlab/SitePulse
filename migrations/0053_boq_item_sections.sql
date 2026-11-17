CREATE TABLE IF NOT EXISTS boq_item_sections (
  id serial PRIMARY KEY,
  boq_item_id integer NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES boq_projects(id) ON DELETE CASCADE,
  chainage_from real NOT NULL,
  chainage_to real NOT NULL,
  top_width_m real NOT NULL,
  thickness_mm real,
  side_slope real NOT NULL DEFAULT 2,
  note text,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boq_item_sections_project_item_idx
  ON boq_item_sections(project_id, boq_item_id);
CREATE INDEX IF NOT EXISTS boq_item_sections_item_chainage_idx
  ON boq_item_sections(boq_item_id, chainage_from, chainage_to);
