-- Batch 06V: incidental progress tracking fields on progress_entries.
-- isIncidental: boolean NOT NULL default false — entry does not earn BOQ credit.
-- incidentalDescription: text nullable — reason/description for incidental work.
ALTER TABLE progress_entries ADD COLUMN IF NOT EXISTS is_incidental boolean NOT NULL DEFAULT false;
ALTER TABLE progress_entries ADD COLUMN IF NOT EXISTS incidental_description text;
