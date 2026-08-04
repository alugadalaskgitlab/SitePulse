---
name: Gantt true calendar axis (027A)
description: Date/index/pixel conventions for the Work Programme Gantt — boundary-exclusive endMonth, inclusive displayed/persisted finish, calendar-month columns.
---

## Rules
- `shared/calendarAxis.ts` is the ONLY converter the Gantt UI may use for month-index ↔ date ↔ pixel. In WorkProgramme.tsx the legacy names `monthIndexToDate`/`dateToMonthIndex` are aliased imports of the calendar versions — do not re-import the avg-month ones from planningEngine there.
- Server-side avg-month conversions (`dateToMonthIndex`/`monthIndexToDate`/`dateToMonthBucket` in planningEngine/routes demand bucketing) stay avg-month on purpose — demand bucketing depends on them. Exception: the program-settings backfill route derives bar startDate/endDate with the calendar converters.
- Conventions: M1 = project start date exactly (engine invariant preserved). Stored `endMonth` index = EXCLUSIVE boundary. Displayed AND persisted `endDate` = boundary − 1 day, clamped ≥ start (sub-day bars). Calendar duration = days(start → boundary), min 1. Finish-date input stores `finishDateInputToIdx(typed + 1 day)`.
- Axis = full calendar-month columns anchored at the 1st of the start month; a mid-month project start adds one extra column (`axisMonthCount`) and M1 begins partway into column 1. Bar geometry via `monthIndexToAxisX` when project.startDate exists; legacy `(idx−1)*colW` fallback otherwise.

**Why:** bars used to be placed with avg-month (365.25/12) math under real calendar-month headers, drifting days off; and a boundary endDate persisted while showing an inclusive finish makes consumers like SiteEntry (`date <= endDate`) treat bars as active one extra day (architect-review catch).

**How to apply:** any new code that reads/writes bar `startDate`/`endDate` or positions anything on the Gantt must go through calendarAxis helpers and honor the inclusive-endDate contract. Tests: `tests/ganttCalendarAxis027A.test.ts`.
