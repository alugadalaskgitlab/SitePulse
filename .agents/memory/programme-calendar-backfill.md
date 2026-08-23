---
name: Programme Calendar-Date Backfill
description: Legacy work_program_bars with NULL start/end dates — why they exist, the startup backfill seam, and one-off script traps.
---

# Programme Calendar-Date Backfill

## The gap
The calendar-date columns on work_program_bars landed well before `upsertWorkProgramBar` started deriving dates at write time. Every bar auto-sequenced in that window has valid month indexes but NULL start_date/end_date. The Gantt renders from month indexes so the UI looks scheduled, while `buildScheduleRevisionPlan` (revision preview/commit) sees NULLs and correctly 409s with CALENDAR_SCHEDULE_REQUIRED. The only other backfill (`upsertBoqProgramSettingsWithCalendarRealignment`) runs only when the project start date *changes*, so re-saving the same date never healed them.

## The fix seams (keep using these — never a second formula)
- `deriveMissingBarCalendarDates()` in shared/programmeRevision.ts is the only normalisation brain: uses monthIndexToDateCal/displayFinishDateCal, never overwrites non-null dates, skips (with reason) instead of guessing on invalid project start / month indexes / inverted ranges. Strict Gregorian validation (`2026-02-31` must skip, toYmd returns a Ymd *object*, not a string).
- `storage.backfillWorkProgramBarCalendarDates()` runs at startup; SQL writes use `COALESCE(col, derived)` per column so a concurrent commit between read and update is never clobbered.
- The revision guard itself must stay untouched — genuinely unscheduled bars still 409.

## One-off script traps
- node-postgres returns `date` columns as JS Date objects; `String(d).slice(0,10)` yields "Wed Jul 01" garbage. Always `to_char(col,'YYYY-MM-DD')` in raw SQL scripts feeding shared date helpers (script kept at scripts/backfill-calendar-dates-heliumdb.ts).

**Why:** reproduced in production (users blocked from revising visibly-scheduled bars); the skip-don't-guess contract is what made the buggy first script run harmless (24 skips, 0 wrong writes).
**How to apply:** any future "column added, derivation added later" gap gets the same treatment — shared pure helper + idempotent startup backfill with per-column COALESCE.
