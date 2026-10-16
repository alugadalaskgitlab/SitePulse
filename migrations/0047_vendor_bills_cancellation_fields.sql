-- AUDIT-01: additive, nullable cancellation metadata for vendor bills.
-- No defaults, updates, or backfill; existing bills remain live (NULL is not cancelled).
ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS is_deleted boolean,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp,
  ADD COLUMN IF NOT EXISTS deleted_by integer,
  ADD COLUMN IF NOT EXISTS is_cancelled boolean,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp,
  ADD COLUMN IF NOT EXISTS cancelled_by integer,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
