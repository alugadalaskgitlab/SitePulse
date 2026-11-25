# LEVELS-02

## Part 1 — TBMs and readings tidy-ups

- Moved +L / +R into the CL heading. Staff mode now has one shift button below the grid, enabled after selecting a chainage; only rows with a shift show its fields.
- Added site TBMs with add/edit/deactivate, audit history, mapped Excel preview, title-row detection, slash chainages and editable duplicate names. Import is blocked while a name is repeated (including names already at the site).
- Staff sheets can select or type starting and closing TBMs. Closing error uses the closing RL, falling back to the starting RL on old sheets.
- Additive migration `0074_level_sheet_tbms.sql`: one TBM table and unique index, two nullable closing-TBM columns. Applied to **sitelog_dev and heliumdb** only. Startup readiness passed and the development server is serving.
- Focused tests: **21 passed in 3 files**. Build passed. No existing records changed, no production access, no publish. No screenshots, as requested.
- Full suite reserved for the end of Part 3. Nothing skipped in Part 1.
