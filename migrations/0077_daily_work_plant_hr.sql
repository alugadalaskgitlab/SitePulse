BEGIN;
ALTER TABLE daily_work_entries DROP CONSTRAINT daily_work_entries_work_type_check;
ALTER TABLE daily_work_entries ADD CONSTRAINT daily_work_entries_work_type_check
  CHECK (work_type IN ('MB entry', 'RA bill preparation', 'Drawings / cross sections', 'Reports', 'Letters / correspondence', 'Stores / records', 'Accounts', 'Purchase', 'Plant cleaning', 'Wear and tear check', 'P&M maintenance', 'Breakdown repair', 'Calibration', 'Stock check', 'Plant idle (no work)', 'Attendance', 'Payroll', 'Recruitment / joining', 'Labour compliance', 'Meetings', 'Other'));
ALTER TABLE daily_work_entries DROP CONSTRAINT daily_work_entries_place_check;
ALTER TABLE daily_work_entries ADD CONSTRAINT daily_work_entries_place_check
  CHECK (place IN ('Site office', 'Plant office', 'Head office', 'Plant'));
COMMIT;
