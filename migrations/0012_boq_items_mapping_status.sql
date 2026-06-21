-- Add SNL mapping status to BOQ items
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS mapping_status text NOT NULL DEFAULT 'unmapped';
