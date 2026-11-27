# DAY-02

## Part 1
- Edit person now has a viewport-height limit, an internally scrolling form and fixed Cancel/Save footer. The older create-user and password windows received the same containment; permission-loading/error windows can scroll.
- Focused tests: **36 passed in 3 files**. Rendered checks at 390/768/1366px verify that the footer is outside the scrolling form and buttons remain usable; no browser checks or screenshots were taken.
- `npm run build`: **passed**. No user records, settings or permissions changed.

## Part 2
- Work choices are grouped as Office, Plant and HR / admin, with Other retained. Added place Plant; all old spellings remain unchanged in the UI, schema and server validation.
- Applied `migrations/0077_daily_work_plant_hr.sql` to **sitelog_dev and heliumdb**. Both catalog lookups confirmed the constraint names below before replacement. No other constraints were changed.
- Both databases accepted **84 work-type/place combinations** (21 × 4) inside rolled-back transactions using explicit fixture IDs, without advancing sequences. Both had **0 existing work entries**; before/after row checksums were unchanged. Old values were included in the fixtures.
- Focused tests: **15 passed in 2 files**, including real-schema API saves for every work type. `npm run build`: **passed**.

Exact migration SQL:
```sql
BEGIN;
ALTER TABLE daily_work_entries DROP CONSTRAINT daily_work_entries_work_type_check;
ALTER TABLE daily_work_entries ADD CONSTRAINT daily_work_entries_work_type_check
  CHECK (work_type IN ('MB entry', 'RA bill preparation', 'Drawings / cross sections', 'Reports', 'Letters / correspondence', 'Stores / records', 'Accounts', 'Purchase', 'Plant cleaning', 'Wear and tear check', 'P&M maintenance', 'Breakdown repair', 'Calibration', 'Stock check', 'Plant idle (no work)', 'Attendance', 'Payroll', 'Recruitment / joining', 'Labour compliance', 'Meetings', 'Other'));
ALTER TABLE daily_work_entries DROP CONSTRAINT daily_work_entries_place_check;
ALTER TABLE daily_work_entries ADD CONSTRAINT daily_work_entries_place_check
  CHECK (place IN ('Site office', 'Plant office', 'Head office', 'Plant'));
COMMIT;
```
