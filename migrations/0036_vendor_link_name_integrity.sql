-- Identity is subordinate to the legacy free-text name. Every writer, including
-- older clients and background jobs, must lose an obsolete FK when that role's
-- actual name changes. Same-name updates and changes to the other trip role
-- preserve their respective links. This does not rewrite matching logic.
CREATE OR REPLACE FUNCTION clear_vendor_link_on_name_change() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'vendor_bills' THEN
    IF NEW.vendor_name IS DISTINCT FROM OLD.vendor_name THEN
      NEW.vendor_id := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'vendor_rate_cards' THEN
    IF NEW.vendor_name IS DISTINCT FROM OLD.vendor_name THEN
      NEW.vendor_id := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'purchase_indent_items' THEN
    IF NEW.vendor IS DISTINCT FROM OLD.vendor THEN
      NEW.vendor_id := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'site_material_trips' THEN
    IF NEW.supplier IS DISTINCT FROM OLD.supplier THEN
      NEW.supplier_vendor_id := NULL;
    END IF;
    IF NEW.material_source_supplier IS DISTINCT FROM OLD.material_source_supplier THEN
      NEW.material_source_vendor_id := NULL;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unexpected vendor link guard table: %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_bills_name_fk_guard BEFORE UPDATE OF vendor_name ON vendor_bills
FOR EACH ROW EXECUTE FUNCTION clear_vendor_link_on_name_change();
CREATE TRIGGER vendor_rate_cards_name_fk_guard BEFORE UPDATE OF vendor_name ON vendor_rate_cards
FOR EACH ROW EXECUTE FUNCTION clear_vendor_link_on_name_change();
CREATE TRIGGER purchase_indent_items_name_fk_guard BEFORE UPDATE OF vendor ON purchase_indent_items
FOR EACH ROW EXECUTE FUNCTION clear_vendor_link_on_name_change();
CREATE TRIGGER site_material_trips_names_fk_guard BEFORE UPDATE OF supplier, material_source_supplier ON site_material_trips
FOR EACH ROW EXECUTE FUNCTION clear_vendor_link_on_name_change();