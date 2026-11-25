# LEVELS-03

## Part 1 — Typing and plain-language entry

- Numeric inputs in Levels, TBMs, design rows, checked levels and Tests keep their own focused text buffer. Decimal points, commas and incomplete minus signs survive typing; calculations receive numeric values and leaving the field normalises the value.
- Levels of is now an unfiltered dropdown containing configured, site-design and standard layers, plus Other.
- Staff mode runs from Start from TBM and its reading, through the grid and selected-chainage instrument movement, to Finish on TBM and a plain closing result. Active TBMs show name, chainage and level; selected levels are read-only. Manual entry remains available. Finish defaults to start.
- No migration or stored-record changes in Part 1. Development only; not published.
- Focused tests: 41 passed in 4 files, including sequential `3` → `3.` → `3.5` entry in reading, distance and TBM level fields, comma/minus input and staff steps. Build passed.

## Part 2 — Site design levels and faster imports

- Site tabs are Level sheets, TBMs, Design levels, Quantities between sheets. The design picker lists layer row counts and ranges; a sheet’s design tab is read-only with an Edit in Design levels link.
- Saved per-site/layer cross-falls and widths fill new typed rows unless overridden. Changing defaults does not change saved rows. Imports retain their own values.
- Imports use 500-row batches in one transaction, with one audit event per layer recording count, range and file name. Same-site imports are guarded both in the server and by a database advisory lock. The button shows progress and rejects double-clicks.
- Repeated chainages show both rows’ values. Keep neither is the default; the user can choose one row. Skipped duplicate chainages leave existing rows untouched even with Replace.
- Success closes the preview, opens the first imported layer and lists each layer’s imported count and range.
- Migration `0076_level_sheet_layer_defaults.sql` creates only `level_sheet_layer_defaults` and its unique site/layer index. Applied to **sitelog_dev and heliumdb**; both new tables remained empty. No existing records changed.
- Focused tests: **61 passed in 7 files**, including a real-schema 6,000-row import in one request under 20 seconds, one audit per layer, concurrent-import refusal, duplicate resolution, default/override preservation, UI progress/double-click protection and active TBM selection.
- Full suite run **once**: **6,106 passed, 0 failed, 3 skipped**; 514 files passed and 2 skipped.
- A final chainage-focus check found that changing a chainage remounted its input. The row now keeps a stable key; a new regression checks `3` → `3.` → `3.5` without remounting. Focused tests/build were repeated after this one-line fix, not the full suite.
- Final focused result: **62 passed in 7 files**. Final `npm run build` passed. The earlier audit assertion was updated from a per-row event to the deliberately requested per-layer event; no assertions were removed.
- Development restarted; read-only startup readiness passed (`ready: true`, 2,558 columns checked).
- No production access, screenshots delivered, whole-project TypeScript check or publish.
- Signed-in UI was verified by component and real-schema API tests, not a logged-in browser session. Both requested parts are finished.
