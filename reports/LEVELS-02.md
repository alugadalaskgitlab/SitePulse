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
