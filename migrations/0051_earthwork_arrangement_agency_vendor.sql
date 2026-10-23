-- VENDOR-NAME-02: additive nullable link only. Existing agency names are not
-- backfilled or rewritten; deleting a Vendor Master row clears only this link.
ALTER TABLE earthwork_arrangements
  ADD COLUMN IF NOT EXISTS agency_vendor_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'earthwork_arrangements_agency_vendor_id_vendors_id_fk'
  ) THEN
    ALTER TABLE earthwork_arrangements
      ADD CONSTRAINT earthwork_arrangements_agency_vendor_id_vendors_id_fk
      FOREIGN KEY (agency_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END $$;
