CREATE TABLE IF NOT EXISTS programme_bar_outcome_events (
  id serial PRIMARY KEY,
  programme_bar_id integer NOT NULL REFERENCES work_program_bars(id) ON DELETE RESTRICT,
  event_date date NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  reason_other text,
  rescheduled_date date,
  actual_quantity real,
  actual_uom text,
  remarks text,
  created_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS programme_bar_outcome_events_bar_date_idx
  ON programme_bar_outcome_events (programme_bar_id, event_date, id);