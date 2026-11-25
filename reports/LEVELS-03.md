# LEVELS-03

## Part 1 — Typing and plain-language entry

- Numeric inputs in Levels, TBMs, design rows, checked levels and Tests keep their own focused text buffer. Decimal points, commas and incomplete minus signs survive typing; calculations receive numeric values and leaving the field normalises the value.
- Levels of is now an unfiltered dropdown containing configured, site-design and standard layers, plus Other.
- Staff mode runs from Start from TBM and its reading, through the grid and selected-chainage instrument movement, to Finish on TBM and a plain closing result. Active TBMs show name, chainage and level; selected levels are read-only. Manual entry remains available. Finish defaults to start.
- No migration or stored-record changes in Part 1. Development only; not published.
- Focused tests: 41 passed in 4 files, including sequential `3` → `3.` → `3.5` entry in reading, distance and TBM level fields, comma/minus input and staff steps. Build passed.
