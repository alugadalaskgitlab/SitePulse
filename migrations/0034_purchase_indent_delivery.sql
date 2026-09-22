-- PI-01: ordinary managed schema diff; no database routines or startup DDL.
ALTER TABLE purchase_indent_items ADD COLUMN IF NOT EXISTS delivered_qty real NOT NULL DEFAULT 0;