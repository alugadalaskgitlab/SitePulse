ALTER TABLE boq_item_materials
  ADD COLUMN water_added_per_part real DEFAULT 0;

CREATE TABLE fund_plans (
  id serial PRIMARY KEY,
  boq_project_id integer NOT NULL REFERENCES boq_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX fund_plans_project_idx ON fund_plans (boq_project_id);
CREATE INDEX fund_plans_updated_idx ON fund_plans (boq_project_id, updated_at);
