ALTER TABLE boq_projects
  ADD COLUMN client_name TEXT,
  ADD COLUMN consultant_name TEXT;

CREATE TABLE lab_tests (
  id SERIAL PRIMARY KEY,
  boq_project_id INTEGER NOT NULL REFERENCES boq_projects(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  test_type TEXT NOT NULL,
  test_no TEXT NOT NULL,
  sample_no TEXT,
  date_sampled DATE NOT NULL,
  date_tested DATE,
  place TEXT NOT NULL CHECK (place IN ('on_site', 'site_lab', 'plant_lab', 'outside_lab')),
  boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
  layer_no INTEGER,
  chainage_from REAL,
  chainage_to REAL,
  side TEXT CHECK (side IS NULL OR side IN ('Centre', 'LHS', 'RHS', 'Both')),
  sample_source_kind TEXT NOT NULL CHECK (sample_source_kind IN ('site', 'borrow_area', 'quarry', 'plant', 'stockpile', 'other')),
  sample_source_name TEXT,
  material_id INTEGER REFERENCES plant_materials(id) ON DELETE SET NULL,
  site_engineer_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  sampled_by_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  tested_by_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  header JSONB NOT NULL DEFAULT '{}'::jsonb,
  readings JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  verdict TEXT NOT NULL DEFAULT 'na' CHECK (verdict IN ('pass', 'fail', 'na')),
  retest_of_test_id INTEGER REFERENCES lab_tests(id) ON DELETE SET NULL,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMP,
  cancelled_by INTEGER,
  cancellation_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lab_tests_project_test_no_uq ON lab_tests(boq_project_id, test_no);
CREATE INDEX lab_tests_project_date_idx ON lab_tests(boq_project_id, date_sampled, id);
CREATE INDEX lab_tests_site_date_idx ON lab_tests(site_id, date_sampled, id);
CREATE INDEX lab_tests_item_layer_idx ON lab_tests(boq_item_id, layer_no, date_tested);
CREATE INDEX lab_tests_retest_idx ON lab_tests(retest_of_test_id);

CREATE TABLE lab_test_attachments (
  id SERIAL PRIMARY KEY,
  lab_test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  object_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER CHECK (file_size IS NULL OR file_size BETWEEN 0 AND 15728640),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE lab_calibrations (
  id SERIAL PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sand_pouring_cylinder', 'speedy_moisture_meter', 'proving_ring', 'core_cutter')),
  equipment_no TEXT NOT NULL,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  calibrated_on DATE NOT NULL,
  valid_until DATE,
  calibrated_by_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  file_name TEXT,
  object_path TEXT,
  mime_type TEXT,
  file_size INTEGER CHECK (file_size IS NULL OR file_size BETWEEN 0 AND 15728640),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX lab_calibrations_kind_date_idx ON lab_calibrations(kind, site_id, valid_until);

CREATE TABLE material_benchmarks (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES plant_materials(id) ON DELETE SET NULL,
  source_name TEXT,
  boq_project_id INTEGER REFERENCES boq_projects(id) ON DELETE CASCADE,
  mdd_gcc REAL NOT NULL,
  omc_percent REAL NOT NULL,
  specific_gravity REAL,
  source_test_id INTEGER REFERENCES lab_tests(id) ON DELETE SET NULL,
  effective_from DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX material_benchmarks_material_source_date_idx
  ON material_benchmarks(material_id, source_name, effective_from);
CREATE INDEX material_benchmarks_project_date_idx ON material_benchmarks(boq_project_id, effective_from);

CREATE TABLE boq_item_quality_specs (
  id SERIAL PRIMARY KEY,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL,
  min_value REAL,
  max_value REAL,
  frequency_qty REAL NOT NULL CHECK (frequency_qty > 0),
  frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('sqm', 'cum', 'MT', 'per_layer', 'as_required')),
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT boq_item_quality_specs_item_test_uq UNIQUE (boq_item_id, test_type)
);
