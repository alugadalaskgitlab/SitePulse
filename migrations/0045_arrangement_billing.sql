-- Additive only. No historical row is backfilled or repriced.
ALTER TABLE earthwork_arrangements ADD COLUMN IF NOT EXISTS billing_terms jsonb;
ALTER TABLE vendor_bill_items ADD COLUMN IF NOT EXISTS arrangement_pricing jsonb;
