-- Add real calendar date columns to work_program_bars
ALTER TABLE work_program_bars ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE work_program_bars ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE work_program_bars ADD COLUMN IF NOT EXISTS duration_mode text DEFAULT 'auto';

-- Add project start date to boq_program_settings
ALTER TABLE boq_program_settings ADD COLUMN IF NOT EXISTS project_start_date date;
