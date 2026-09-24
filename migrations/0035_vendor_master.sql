-- Additive identity layer; existing free-text matching remains untouched.
CREATE TABLE IF NOT EXISTS vendors (
  id serial PRIMARY KEY,
  name text NOT NULL,
  business_name text,
  gst_number text,
  pan_number text,
  address text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  contact_person_name text,
  contact_phone text,
  contact_email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE vendor_rate_cards ADD COLUMN IF NOT EXISTS vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE purchase_indent_items ADD COLUMN IF NOT EXISTS vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE site_material_trips ADD COLUMN IF NOT EXISTS supplier_vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE site_material_trips ADD COLUMN IF NOT EXISTS material_source_vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;