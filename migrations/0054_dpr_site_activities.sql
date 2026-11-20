CREATE TABLE IF NOT EXISTS dpr_site_activities (
  id SERIAL PRIMARY KEY,
  dpr_id INTEGER NOT NULL REFERENCES dprs(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('levels', 'test', 'office', 'visit', 'other')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  chainage_from REAL,
  chainage_to REAL,
  side TEXT CHECK (side IS NULL OR side IN ('Centre', 'LHS', 'RHS')),
  layer TEXT,
  levels_kind TEXT CHECK (levels_kind IS NULL OR levels_kind IN ('Own check', 'Joint levels with department', 'Initial ground levels (OGL)', 'Setting out / centre line')),
  dept_person TEXT,
  test_name TEXT,
  test_place TEXT CHECK (test_place IS NULL OR test_place IN ('On site (field test)', 'Site lab', 'Outside lab')),
  result_value TEXT,
  required_value TEXT,
  result_pass BOOLEAN,
  office_work TEXT CHECK (office_work IS NULL OR office_work IN ('MB entry', 'RA bill preparation', 'Drawings / cross sections', 'Reports', 'Letters / correspondence', 'Stores / records')),
  visitor_name TEXT,
  visitor_designation TEXT,
  note TEXT,
  file_name TEXT,
  object_path TEXT,
  mime_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dpr_site_activities_dpr_sort_idx
  ON dpr_site_activities(dpr_id, sort_order, id);

CREATE TABLE IF NOT EXISTS dpr_site_activity_staff (
  id SERIAL PRIMARY KEY,
  site_activity_id INTEGER NOT NULL REFERENCES dpr_site_activities(id) ON DELETE CASCADE,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id)
);
CREATE INDEX IF NOT EXISTS dpr_site_activity_staff_activity_idx
  ON dpr_site_activity_staff(site_activity_id);
CREATE INDEX IF NOT EXISTS dpr_site_activity_staff_personnel_idx
  ON dpr_site_activity_staff(personnel_id);
