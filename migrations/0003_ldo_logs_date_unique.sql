-- Add unique constraint on ldo_logs.date to prevent duplicate entries per date
-- First, identify and remove any existing duplicates (keeping the earliest id)
DELETE FROM ldo_logs
WHERE id NOT IN (
  SELECT MIN(id)
  FROM ldo_logs
  GROUP BY date
);

-- Now add the unique index
CREATE UNIQUE INDEX IF NOT EXISTS "ldo_logs_date_uq" ON "ldo_logs" ("date");
