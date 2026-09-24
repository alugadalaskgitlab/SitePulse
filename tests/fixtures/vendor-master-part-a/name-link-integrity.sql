-- Execute ONLY on the isolated development database. All records are temporary
-- synthetic fixtures in a rolled-back transaction; production tables untouched.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'sitelog_dev' THEN
    RAISE EXCEPTION 'This test requires the isolated sitelog_dev target';
  END IF;
END;
$$;

CREATE TEMP TABLE vendor_bills (id integer, vendor_name text, vendor_id integer) ON COMMIT DROP;
CREATE TEMP TABLE vendor_rate_cards (id integer, vendor_name text, vendor_id integer) ON COMMIT DROP;
CREATE TEMP TABLE purchase_indent_items (id integer, vendor text, vendor_id integer) ON COMMIT DROP;
CREATE TEMP TABLE site_material_trips (
  id integer, supplier text, supplier_vendor_id integer,
  material_source_supplier text, material_source_vendor_id integer
) ON COMMIT DROP;
CREATE TRIGGER vendor_bills_name_fk_guard BEFORE UPDATE OF vendor_name ON vendor_bills
FOR EACH ROW EXECUTE FUNCTION public.clear_vendor_link_on_name_change();
CREATE TRIGGER vendor_rate_cards_name_fk_guard BEFORE UPDATE OF vendor_name ON vendor_rate_cards
FOR EACH ROW EXECUTE FUNCTION public.clear_vendor_link_on_name_change();
CREATE TRIGGER purchase_indent_items_name_fk_guard BEFORE UPDATE OF vendor ON purchase_indent_items
FOR EACH ROW EXECUTE FUNCTION public.clear_vendor_link_on_name_change();
CREATE TRIGGER site_material_trips_names_fk_guard BEFORE UPDATE OF supplier, material_source_supplier ON site_material_trips
FOR EACH ROW EXECUTE FUNCTION public.clear_vendor_link_on_name_change();

INSERT INTO vendor_bills VALUES (1, 'SYNTHETIC BILL A', 41);
INSERT INTO vendor_rate_cards VALUES (1, 'SYNTHETIC RATE A', 42);
INSERT INTO purchase_indent_items VALUES (1, 'SYNTHETIC PI A', 43);
INSERT INTO site_material_trips VALUES (1, 'SYNTHETIC TRANSPORT A', 44, 'SYNTHETIC MATERIAL A', 45);

-- Same-name edits must retain links. Actual name changes clear only their role.
UPDATE vendor_bills SET vendor_name = vendor_name WHERE id = 1;
UPDATE vendor_rate_cards SET vendor_name = vendor_name WHERE id = 1;
UPDATE purchase_indent_items SET vendor = vendor WHERE id = 1;
UPDATE site_material_trips SET supplier = supplier, material_source_supplier = material_source_supplier WHERE id = 1;
DO $$
BEGIN
  IF (SELECT vendor_id FROM vendor_bills) <> 41
    OR (SELECT vendor_id FROM vendor_rate_cards) <> 42
    OR (SELECT vendor_id FROM purchase_indent_items) <> 43
    OR (SELECT supplier_vendor_id FROM site_material_trips) <> 44
    OR (SELECT material_source_vendor_id FROM site_material_trips) <> 45 THEN
    RAISE EXCEPTION 'Same-name update incorrectly cleared vendor identity';
  END IF;
END;
$$;
UPDATE vendor_bills SET vendor_name = 'SYNTHETIC BILL B' WHERE id = 1;
UPDATE vendor_rate_cards SET vendor_name = 'SYNTHETIC RATE B' WHERE id = 1;
UPDATE purchase_indent_items SET vendor = NULL WHERE id = 1;
UPDATE site_material_trips SET supplier = 'SYNTHETIC TRANSPORT B' WHERE id = 1;
DO $$
BEGIN
  IF (SELECT vendor_id FROM vendor_bills) IS NOT NULL
    OR (SELECT vendor_id FROM vendor_rate_cards) IS NOT NULL
    OR (SELECT vendor_id FROM purchase_indent_items) IS NOT NULL
    OR (SELECT supplier_vendor_id FROM site_material_trips) IS NOT NULL
    OR (SELECT material_source_vendor_id FROM site_material_trips) <> 45 THEN
    RAISE EXCEPTION 'Transport edit did not clear only the transport role';
  END IF;
END;
$$;
UPDATE site_material_trips SET supplier_vendor_id = 46, material_source_supplier = NULL WHERE id = 1;
DO $$
BEGIN
  IF (SELECT supplier_vendor_id FROM site_material_trips) <> 46
    OR (SELECT material_source_vendor_id FROM site_material_trips) IS NOT NULL THEN
    RAISE EXCEPTION 'Material-source edit did not clear only the material role';
  END IF;
END;
$$;
ROLLBACK;