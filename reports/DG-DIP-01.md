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

## Part 2 — Entry forms

One shared input shows centimetres, total litres and usable litres. It keeps the original litres controls for machines without calibration. New openings use the last recorded closing dip, with date/site/plant and current-entry exclusions; manual input is not overwritten. Capacity, outlet and negative-consumption warnings do not block new dip entries. Server saves recalculate litres from the master, retaining centimetres separately.

Focused tests: 113 passed across eight files (including seven new input/render checks and three real PGlite migration/persistence/continuity checks). An initial test-fixture sequence collision was corrected; no application rule was weakened. `npm run build` passed.

Approved supporting files outside the named pages:
- `shared/equipmentTankDip.ts`: shared validation and conversion.
- `server/equipmentTankDip.ts`: read-only, scoped closing-dip lookup.
- `server/storage.ts`: retain centimetres in save/clone/link flows and recalculate litres; only new dip-based generator/heating entries retain negative consumption rather than blocking/clamping. Existing litres-only behavior stays unchanged.
- `client/src/components/EquipmentTankDipInput.tsx`: the requested reusable input.
- `client/src/components/HeatingSessionDialog.tsx`: the actual live heating-session DG editor.
- `client/src/components/DprEquipmentCompact.tsx` and `EquipmentTankBalanceInputs.tsx`: the two existing DPR equipment editors.
- `client/src/pages/SiteEntry.tsx` and `SiteEdit.tsx`: pass master settings and restore centimetres; clear hidden dip evidence with contractor tank fields.
- Part 1's `DieselTankDipSettings.tsx` and `EquipmentMasterCreateDialog.tsx`: shared master fields and the existing create dialog.

Generator logs now also offer the existing Generator Master choices, so a configured machine can be selected rather than only the two old hard-coded names. No existing generator name is renamed.
