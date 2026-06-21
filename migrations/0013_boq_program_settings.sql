-- Program settings table per BOQ project (schedule, tipper fleet, source chainages, productivity mode)
CREATE TABLE IF NOT EXISTS boq_program_settings (
  id serial PRIMARY KEY,
  project_id integer NOT NULL UNIQUE REFERENCES boq_projects(id) ON DELETE CASCADE,
  working_days_per_month integer NOT NULL DEFAULT 25,
  shift_hours real NOT NULL DEFAULT 8,
  double_shift boolean NOT NULL DEFAULT false,
  tipper_capacity_t real NOT NULL DEFAULT 8,
  avg_tipper_speed_km_hr real NOT NULL DEFAULT 30,
  load_time_min real NOT NULL DEFAULT 5,
  unload_time_min real NOT NULL DEFAULT 5,
  hmp_chainage_km real,
  wmm_plant_chainage_km real,
  quarry_chainage_km real,
  borrow_chainage_km real,
  disposal_chainage_km real,
  rmc_chainage_km real,
  productivity_mode text NOT NULL DEFAULT 'snl',
  productivity_overrides jsonb,
  updated_at timestamp with time zone DEFAULT now()
);

-- Mix template links keyed by project + standard mix type (BC/DBM/WMM/SDBC/GSB/M20/M25/M30/M35/RMC)
-- The planning engine uses these to resolve which plant mix template supplies a given layer type.
CREATE TABLE IF NOT EXISTS boq_mix_template_links (
  id serial PRIMARY KEY,
  boq_project_id integer NOT NULL REFERENCES boq_projects(id) ON DELETE CASCADE,
  mix_type text NOT NULL,
  mix_template_id integer NOT NULL,
  mix_template_name text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (boq_project_id, mix_type)
);
