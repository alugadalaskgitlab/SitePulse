BEGIN;
ALTER TABLE diesel_requirement_items ADD COLUMN direct_fill_choices jsonb;
COMMIT;
