CREATE TABLE IF NOT EXISTS equipment_activity_allocations (
  id serial PRIMARY KEY,
  equipment_log_id integer NOT NULL
    REFERENCES equipment_logs(id) ON DELETE CASCADE,
  boq_item_id integer NOT NULL,
  programme_bar_id integer
    REFERENCES work_program_bars(id) ON DELETE SET NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  hours_worked real NOT NULL,
  created_at timestamp DEFAULT now(),

  CONSTRAINT equipment_activity_allocations_start_time_ck
    CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  CONSTRAINT equipment_activity_allocations_end_time_ck
    CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  CONSTRAINT equipment_activity_allocations_time_order_ck
    CHECK (end_time > start_time),

  CONSTRAINT equipment_activity_allocations_hours_positive_ck
    CHECK (hours_worked > 0),

  CONSTRAINT equipment_activity_allocations_segment_uq
    UNIQUE (equipment_log_id, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS equipment_activity_allocations_boq_item_idx
  ON equipment_activity_allocations (boq_item_id);

CREATE INDEX IF NOT EXISTS equipment_activity_allocations_programme_bar_idx
  ON equipment_activity_allocations (programme_bar_id);