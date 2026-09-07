ALTER TABLE dprs ADD COLUMN IF NOT EXISTS last_edited_by_user_id integer;
ALTER TABLE dprs ADD COLUMN IF NOT EXISTS last_edited_at timestamp;
ALTER TABLE dprs ADD COLUMN IF NOT EXISTS submitted_by_user_id integer;