-- Task #750: Add required_by date column to purchase_indent_items
-- Tracks the date by which each indent item is needed on site.
-- Shown in the indent form for normal/low priority items; hidden for urgent.
-- Column is nullable so existing rows are unaffected.

ALTER TABLE purchase_indent_items
  ADD COLUMN IF NOT EXISTS required_by date;
