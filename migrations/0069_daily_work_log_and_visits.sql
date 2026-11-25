-- DAY-01: separate daily work notes and HLC plant/head-office visitor records.
-- This migration is additive; it does not change or backfill existing records.
CREATE TABLE daily_work_entries (
  id SERIAL PRIMARY KEY,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  work_date DATE NOT NULL,
  place TEXT NOT NULL CHECK (place IN ('Site office', 'Plant office', 'Head office')),
  work_type TEXT NOT NULL CHECK (work_type IN (
    'MB entry', 'RA bill preparation', 'Drawings / cross sections', 'Reports',
    'Letters / correspondence', 'Stores / records', 'Accounts', 'Purchase', 'Other'
  )),
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  duration_minutes INTEGER,
  details TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_work_entries_duration_range CHECK (
    duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440
  )
);

CREATE INDEX daily_work_entries_date_personnel_idx
  ON daily_work_entries(work_date, personnel_id);
CREATE INDEX daily_work_entries_creator_date_idx
  ON daily_work_entries(created_by_user_id, work_date);

CREATE TABLE office_visits (
  id SERIAL PRIMARY KEY,
  recorded_by_personnel_id INTEGER NOT NULL REFERENCES personnel(id),
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
  file_size INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT office_visits_attachment_size CHECK (
    file_size IS NULL OR file_size BETWEEN 0 AND 15728640
  )
);

CREATE INDEX office_visits_date_recorder_idx
  ON office_visits(visit_date, recorded_by_personnel_id);
CREATE INDEX office_visits_user_date_idx
  ON office_visits(recorded_by_user_id, visit_date);
