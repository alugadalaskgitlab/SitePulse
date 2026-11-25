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

**Part 1 is complete. Part 2 is documented below.**

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
- No real level sheet or other project data was created or changed. The full suite was deferred to the final Part 3 check below.

**Parts 1 and 2 are complete. Part 3 follows.**

## Part 3 — Results and check/sign

- Replaced the basic results table with point-by-point results: each cross-section point shows its RL and difference in whole millimetres, tagged Within, High, Low or outside width. The summary shows points within tolerance, high/low counts, cut/fill, chainage count and length.
- Tapping a chainage opens its cross-section chart with the design profile dashed, measured levels solid, difference labels, and the left/right top width.
- Added Check & sign: multi-personnel “Taken by” selection, department/consultant check details, per-point checked boxes and optional checked RLs with difference in millimetres, plus an image/PDF attachment. Inactive previously selected staff remain visible; inactive staff cannot be newly selected.
- The check API validates names, dates, point identities and numeric checked levels; it requires the existing Level sheets approve permission and site access. No database schema change was needed.
- Added an A4 print preview for site, BOQ item, layer, date, instrument, TBM, closing error, readings/design/difference, cut/fill totals and signature lines. Print output uses black text and borders without filled table cells.
- No quantities are sent to Work value. No Level sheets means the permission-gated page is not available, and the API rejects users without the permission.

### Part 3 checks

- Focused calculator, API and screen tests: **17 passed** across 3 files.
- Focused permission inventory test after updating its expected section count: **15 passed**. The full-suite run found its old hard-coded count of 101 was stale; Level sheets adds the 102nd permission entry.
- `npm run build`: **passed**.
- Full suite was run once: **514 files — 511 passed, 2 skipped, 1 failed; 6,076 tests passed, 3 skipped, 1 failed**. The sole failure was that stale 101-permission expectation in `client/src/components/permissions/model.test.ts`; I updated it to 102 and verified that file separately. I did not rerun the full suite, per the one-run instruction.
- No migration or data changes were made for Part 3. No production database was accessed. No real level sheet was created or changed.

**Parts 1–3 are complete. Publishing was not performed.**
