-- VB-SITE-01: distinguish a deliberate ALL SITES choice from legacy null scope.
-- Nullable, with no default or backfill; existing rows remain unknown.
ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS site_scope_confirmed boolean;
