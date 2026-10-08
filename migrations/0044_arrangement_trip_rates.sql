-- Storage only. Nullable, implicit DEFAULT NULL; no row updates or backfill.
ALTER TABLE earthwork_arrangements ADD COLUMN IF NOT EXISTS trip_rates JSONB;
