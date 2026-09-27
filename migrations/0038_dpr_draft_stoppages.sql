CREATE TABLE IF NOT EXISTS dpr_draft_stoppages (
  id serial PRIMARY KEY,
  equipment_log_id integer NOT NULL REFERENCES equipment_logs(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  maintenance_log_id integer,
  from_time text,
  to_time text,
  description text,
  responsibility text,
  repair_scope text,
  debitable_to_vendor boolean,
  remarks text,
  file_name text,
  object_path text,
  mime_type text,
  file_size integer
);