-- Add standard MoRTH/NHAI work category to BOQ items
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS work_category text;
