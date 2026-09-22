ALTER TABLE equipment_logs
  ADD COLUMN IF NOT EXISTS usage_status text,
  ADD COLUMN IF NOT EXISTS usage_status_reason text;

ALTER TABLE equipment_usage
  ADD COLUMN IF NOT EXISTS usage_status text,
  ADD COLUMN IF NOT EXISTS usage_status_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_logs_usage_status_check'
  ) THEN
    ALTER TABLE equipment_logs
      ADD CONSTRAINT equipment_logs_usage_status_check
      CHECK (usage_status IS NULL OR usage_status IN (
        'working', 'idle_no_work', 'idle_no_operator', 'breakdown'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_usage_usage_status_check'
  ) THEN
    ALTER TABLE equipment_usage
      ADD CONSTRAINT equipment_usage_usage_status_check
      CHECK (usage_status IS NULL OR usage_status IN (
        'working', 'idle_no_work', 'idle_no_operator', 'breakdown'
      ));
  END IF;
END $$;