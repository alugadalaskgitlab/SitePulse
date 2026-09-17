-- VB18: allow independent bill-level deduction/credit lines.
-- Additive and nullable so historical vendor bills remain readable.
ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS additional_adjustments jsonb DEFAULT '[]'::jsonb;