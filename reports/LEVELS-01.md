# LEVELS-01

## Part 1 — Daily work log

- A login without a Personnel link but with “See everyone’s day” now opens directly in Team view. “My day” and the Visits tab are hidden for that login.
- Team view still shows the existing Personnel-attributed visits. The unlinked login cannot add, edit or delete visits; the API also rejects those actions. Visit recording continues to require a Personnel link, as in DAY-01.
- No migration remains for Part 1. The temporary unlinked-visit table and migration were removed before being applied. Neither development database was changed.
- No production database was accessed. No data, permissions or existing visits were changed.

### Part 1 checks

- Focused tests: **13 passed** across the daily-work-log API and page tests, including Team entry, visit visibility, and blocked write actions.
- `npm run build`: **passed**.
- No screenshot was requested.

Before the clarification to skip it, I briefly ran `npm run check`. Its first run exhausted Node’s memory; a larger-heap retry reported project-wide TypeScript diagnostics. I fixed the one new nullable-personnel diagnostic in the daily-log page. As requested, I did not rerun that check and will use focused tests and builds for the remaining parts.

**Part 1 is complete. Parts 2 and 3 are not started. The full test suite has not run.**

## Part 2 — Level sheets

- Added the Level sheets page and Site Operations tile. The feature has its own permission key; it is off for normal roles and people unless explicitly granted. Owner access is preserved.
- Added design levels by site and layer, editable Excel column mapping with a preview, typed/imported source tags, and deriving another layer from FRL minus depth.
- Added sheet capture with saved site chainage settings, ours/consultant conversions, site staff links, RL or staff readings, HI/shift handling, interpolated design levels, crossfall-based section cut/fill areas, and trapezoidal volume totals. Left/right distances must be positive; centre-line distance is zero.
- Added four tables: `level_sheet_site_settings`, `level_sheet_design_rows`, `level_sheets`, and `level_sheet_staff`. The migration also adds five named indexes. It is additive only.
- Applied migration `0071_level_sheets.sql` to both development databases: `sitelog_dev` and `heliumdb` (the Publish-facing development database). No production database was accessed.
- Restarted the app on `sitelog_dev`; read-only startup readiness passed (`ready: true`, 2,530 checked columns). The two development databases each show all four tables and five expected indexes.

### Part 2 checks

- Focused calculator, API integration, and screen tests: **13 passed** across 3 files.
- `npm run build`: **passed**.
- The screen test covers tab navigation, chainage display, point entry, and RL-to-staff conversion requiring TBM and back sight.
- No real level sheet or other project data was created or changed. The full suite remains deferred until Part 3.

**Part 1 and Part 2 are complete. Part 3 remains.**
