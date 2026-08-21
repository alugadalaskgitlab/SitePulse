ALTER TABLE work_program_bars
  ADD COLUMN IF NOT EXISTS baseline_start_date DATE NULL;

ALTER TABLE work_program_bars
  ADD COLUMN IF NOT EXISTS baseline_end_date DATE NULL;

ALTER TABLE work_program_bars
  ADD COLUMN IF NOT EXISTS revision_history JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE work_program_bars
SET baseline_start_date = start_date
WHERE baseline_start_date IS NULL
  AND start_date IS NOT NULL;

UPDATE work_program_bars
SET baseline_end_date = end_date
WHERE baseline_end_date IS NULL
  AND end_date IS NOT NULL;

UPDATE work_program_bars
SET revision_history = '[]'::jsonb
WHERE revision_history IS NULL
   OR jsonb_typeof(revision_history) <> 'array';

ALTER TABLE work_program_bars
  ALTER COLUMN revision_history SET DEFAULT '[]'::jsonb,
  ALTER COLUMN revision_history SET NOT NULL;