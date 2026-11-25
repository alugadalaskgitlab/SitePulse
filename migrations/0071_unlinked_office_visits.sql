CREATE TABLE IF NOT EXISTS unlinked_office_visits (
  id SERIAL PRIMARY KEY,
  recorded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  visit_date DATE NOT NULL,
  place TEXT NOT NULL CHECK (place IN ('HLC plant', 'Head office')),
  visitor_name TEXT NOT NULL,
  visitor_designation TEXT,
  organisation TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('Inspection', 'Meeting', 'Audit', 'Other')),
  points_discussed TEXT NOT NULL,
  file_name TEXT,
  object_path TEXT,
  mime_type TEXT,
  file_size INTEGER CHECK (file_size IS NULL OR file_size BETWEEN 0 AND 15728640),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unlinked_office_visits_date_user_idx
  ON unlinked_office_visits(visit_date, recorded_by_user_id);
CREATE INDEX IF NOT EXISTS unlinked_office_visits_user_date_idx
  ON unlinked_office_visits(recorded_by_user_id, visit_date);
