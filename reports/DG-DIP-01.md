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
- `tests/dgDip01Master.test.tsx`, `dgDip01Input.test.tsx`, `dgDip01Persistence.test.ts`, `dgDip01Forms.test.tsx` and `dgDip01Filling.test.tsx`: focused master, input, real-database, form-save and Owner checks.
- `.agents/memory/equipment-opening-continuity.md`: retain the Owner's historical-reading safety rule for future work.

Generator logs now also offer the existing Generator Master choices, so a configured machine can be selected rather than only the two old hard-coded names. No existing generator name is renamed.

## Part 3 — Filling check

A zero-runtime filling entry, or a ticked “Filling check”, shows issued litres ÷ dip rise alongside the current master figure. Only the Owner sees “Use this figure”; the server also enforces Owner access. The master update and before/after audit are one transaction. It does not update entries, diesel issued, stock or ledgers.

Final focused verification: 122 tests passed across 11 files, combining the initial run with focused reruns of two corrected test fixtures. The new tests exercise all four entry forms, 100 L ÷ 8 cm = 12.5 L/cm, Owner/non-Owner controls, real database audit persistence and unchanged old entries. `npm run build` passed after each part.

Development startup passed the unchanged read-only readiness check: `ready: true`, 2,581 columns checked. Both development databases were independently checked for all 11 nullable `real` columns, with no defaults.

Signed-in UI was verified through render tests, not a signed-in browser. No real equipment entries or temporary users were created. No production database access, backfills, data repairs, startup writes, stock/ledger changes or publishing.

## Full suite — run once

The single full run accounted for all **542 files**: **6,317 passed, 14 failed, 3 existing skips**. The failures were:
- `dpr314Correction.test.ts`: 10; empty new dip fields changed legacy hydration payloads.
- `dprCorrections.integration.test.ts`: 2; the same hydration issue.
- `equipmentUsageCombinedUpdate06XHF4.test.ts`: 2; merging converted fields overwrote normalized timestamps.

Fixed the application, not these tests: legacy hydration omits absent dip fields, and save normalization merges only converted diesel values, retaining timestamp normalization. Focused rerun: **104 passed across nine files**, including every failed test and the new dip tests. Final build passed. **Combined verified result: 6,331 passed, 0 remaining failures, 3 unchanged skips.** The full suite was not run a second time. The skips remain the two opt-in labour PostgreSQL checks and the opt-in VB23B HTTP fixture.
