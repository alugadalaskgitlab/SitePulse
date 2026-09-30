CREATE TABLE labour_log_workers (
  id serial PRIMARY KEY,
  labour_log_id integer NOT NULL REFERENCES labour_logs(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX labour_log_workers_labour_log_id_idx ON labour_log_workers (labour_log_id);