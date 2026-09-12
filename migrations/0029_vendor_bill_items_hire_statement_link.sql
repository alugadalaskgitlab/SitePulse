-- Preserve the explicit relationship used by the vendor-bill JSON bundle.
-- This is additive and nullable: historic/manual bill lines remain untouched.
ALTER TABLE vendor_bill_items
  ADD COLUMN IF NOT EXISTS hire_statement_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendor_bill_items_hire_statement_id_hire_statements_id_fk'
      AND conrelid = 'public.vendor_bill_items'::regclass
  ) THEN
    ALTER TABLE vendor_bill_items
      ADD CONSTRAINT vendor_bill_items_hire_statement_id_hire_statements_id_fk
      FOREIGN KEY (hire_statement_id) REFERENCES hire_statements(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_bill_items_hire_statement_uq
  ON vendor_bill_items (hire_statement_id);