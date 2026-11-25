# DAY-01 — Daily work log and office/plant visits

## Delivered

- Added the permission-gated **Daily work log** page for personal daily work and plant/head-office visits.
- Added a separate **See everyone’s day** permission action. New role templates leave the feature off; Owners can view the team.
- Team view groups each person’s work entries, DPR Site Activities, visits, and total recorded hours. Linked DPR activities are read-only and include an Open DPR link where the user can view DPRs.
- Staff/site/visitor names display in capitals. Site visits remain in the DPR.
- No export or print was added.

## Schema and development databases

Migration `0069_daily_work_log_and_visits.sql` adds only:

- `daily_work_entries` with links to personnel, author and optional site; date, place, work type, duration, details and timestamps.
- `office_visits` with links to recorded-by personnel and author; date, permitted place, visitor, purpose, points discussed, optional attachment metadata and timestamps.
- Four indexes: two for each new table. No existing tables or records were changed.

The migration was applied to both development databases: `sitelog_dev` and the Publish-facing `heliumdb`.

- `sitelog_dev`: startup readiness passes (`ready: true`, 2,473 columns checked).
- `heliumdb`: the new tables are applied, but its startup readiness probe stops on the existing `STARTUP_ACCESS_MIGRATION_REQUIRED` permission-preservation marker. I did not change permissions or bypass the check. This is separate from the DAY-01 schema migration and must be resolved before relying on readiness there.

No production database or replica was accessed. No user, session, existing DPR/site activity, personnel record, permission data, stock, bill, or other application data was changed. No temporary account was created.

## Verification

- Focused tests: **60 passed** across 6 files, covering permissions, own and Owner edits/deletes, audit events, yesterday/older dates, attachment metadata, site-visit exclusion, site scoping, read-only DPR activities, and the grouped team view.
- `npm run build`: passed.
- Full test suite: **6,043 passed, 3 skipped, 0 failed** across 509 files.
- Screenshot: [phone-width Team view with fixture work and DPR activity](DAY-01-team-view.jpg). It uses isolated synthetic UI data, not a real account or existing DPR.

