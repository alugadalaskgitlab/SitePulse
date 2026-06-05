CREATE TABLE IF NOT EXISTS "irn_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "irn_id" integer NOT NULL REFERENCES "internal_requisitions"("id") ON DELETE cascade,
  "event" text NOT NULL,
  "actor_name" text NOT NULL,
  "notes" text,
  "timestamp" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "irn_audit_logs_irn_id_timestamp_idx"
  ON "irn_audit_logs" ("irn_id", "timestamp");
