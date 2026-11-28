# DG-DIP-01

## Part 1 — Equipment master

Added three optional diesel tank settings to the master create/edit forms, with positive calibration/capacity and nonnegative outlet-height validation. Existing equipment stays unset; no historical entries were changed.

Focused tests: 12 passed (new master settings plus existing equipment master tests). `npm run build` passed.

Migration `0081_equipment_tank_dip.sql` applied to **sitelog_dev** and **heliumdb**, with target names checked before applying. Only these 11 nullable columns were added; no defaults, backfill, startup writes or record updates:

```sql
ALTER TABLE equipment_master ADD COLUMN dip_liters_per_cm real;
ALTER TABLE equipment_master ADD COLUMN dead_stock_depth_cm real;
ALTER TABLE equipment_master ADD COLUMN tank_capacity_liters real;
ALTER TABLE equipment_usage ADD COLUMN opening_dip_cm real;
ALTER TABLE equipment_usage ADD COLUMN closing_dip_cm real;
ALTER TABLE generator_logs ADD COLUMN opening_dip_cm real;
ALTER TABLE generator_logs ADD COLUMN closing_dip_cm real;
ALTER TABLE equipment_logs ADD COLUMN opening_dip_cm real;
ALTER TABLE equipment_logs ADD COLUMN closing_dip_cm real;
ALTER TABLE bitumen_heating_sessions ADD COLUMN dg_opening_dip_cm real;
ALTER TABLE bitumen_heating_sessions ADD COLUMN dg_closing_dip_cm real;
```
