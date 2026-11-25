# LEVELS-02

## Part 1 — TBMs and readings tidy-ups

- Moved +L / +R into the CL heading. Staff mode now has one shift button below the grid, enabled after selecting a chainage; only rows with a shift show its fields.
- Added site TBMs with add/edit/deactivate, audit history, mapped Excel preview, title-row detection, slash chainages and editable duplicate names. Import is blocked while a name is repeated (including names already at the site).
- Staff sheets can select or type starting and closing TBMs. Closing error uses the closing RL, falling back to the starting RL on old sheets.
- Additive migration `0074_level_sheet_tbms.sql`: one TBM table and unique index, two nullable closing-TBM columns. Applied to **sitelog_dev and heliumdb** only. Startup readiness passed and the development server is serving.
- Focused tests: **21 passed in 3 files**. Build passed. No existing records changed, no production access, no publish. No screenshots, as requested.
- Full suite reserved for the end of Part 3. Nothing skipped in Part 1.

## Part 2 — Consultant-layout design import

- The Excel importer now detects grouped layer headings with offset columns, plus single OGL/FRL columns. Preview lists each detected layer, editable name, offsets, row count and sample levels; layers can be unticked.
- Bare chainages are read as book metres and converted through the site's settings. Cross-falls and widths come from the outer offsets and centre RL. Helper/spacer columns are ignored. The original simple-header mapping remains available.
- Selected layers import in one transaction as EXCEL rows. Matching Excel rows update, typed rows stay unless Replace is selected; all writes are audited.
- Fixture: 750 m, centre 536.247, outer RLs 536.072 at ±7 m gives 2.5% both sides and 7 m widths. BC at ±3.5 m gives 3.5 m widths.
- Focused tests: **23 passed in 3 files**. Build passed. No migration, existing data edits, production access or publish. Nothing skipped.

## Part 3 — Quantities between sheets

- Added Basis: Own levels, Consultant or Assumed or agreed. Department/consultant checks automatically display Joint. Legacy sheets display Own levels without updating stored records.
- Added read-only comparison of two saved sheets at the same site, optional BOQ item, overlap-defaulted chainage range, common measured width, separate fill/cut integration, skipped chainages and gap warnings over 50 m. Levels are joined by straight lines, split at crossings; consecutive common sections use average end areas. No quantities are written anywhere.
- The table shows our/consultant chainages, width (2 decimals), areas (2 decimals) and total volumes (1 decimal). Black-and-white print includes sheet dates/layers/basis and HLC/department signatures.
- Additive migration `0075_level_sheet_basis.sql`: one nullable `level_sheets.basis` column. Applied to **sitelog_dev and heliumdb** only. Both databases have the new basis and closing-TBM columns; development startup passed after restart.
- Focused tests: **29 passed in 4 files**. Includes 30.000 cum flat fill, crossing fill/cut, narrower upper sheet, skipped chainage, gap warnings, legacy basis, site authorization, read-only route snapshots and comparison/print rendering. Build passed.
- Full suite run **once** after Part 3: **6,097 passed, 0 failed, 3 skipped**; **513 test files passed, 2 skipped**. This includes TESTS-02 and the new level-sheet tests. No old expectations needed changing. Build passed on the final code.
- No screenshot files delivered and no whole-project TypeScript check. Signed-in screens were checked with component tests, not a logged-in browser session. No existing level sheets/design rows or other business records changed. No permissions changes, production access or publish.
- Nothing skipped from the three requested parts. Code and this report committed and pushed; stopped before publishing.
