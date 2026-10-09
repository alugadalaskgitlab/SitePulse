-- Informational designation; existing accounts remain undesignated.
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_role text;
