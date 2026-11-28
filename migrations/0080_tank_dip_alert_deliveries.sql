CREATE TABLE tank_dip_alert_deliveries (
  id serial PRIMARY KEY,
  dedupe_key text NOT NULL,
  recipient_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX tank_dip_alert_deliveries_dedupe_user_uq
  ON tank_dip_alert_deliveries (dedupe_key, recipient_user_id);
CREATE INDEX tank_dip_alert_deliveries_recipient_created_idx
  ON tank_dip_alert_deliveries (recipient_user_id, created_at);
