# TESTS-02

## Part 1 — Names, BOQ items and layers

- Test names now show the site name and engineering name together in the add-test dropdown, test list, layer register, frequency check, test details, server response, and print sheet.
- The BOQ item picker searches the complete item list returned for the selected project. Each choice shows the item number and uppercase short name; selecting one shows its full description once. The picker reports how many items match the search. In the two-item fixture, it showed 2 of 2 items when the search was empty.
- Layer choices come from the selected item's layer setup when present; otherwise the existing fallback list is used. Both lists include “Other” for a typed layer.
- Spray-rate and thickness forms are configured to hide sample-source, source-name, benchmark, and calibration information; the thickness form also hides the material selector. The new test types are named now and will be enabled with their calculations in Parts 2 and 3.
- `sample_source_kind` and the existing place, side, status, and verdict rules are unchanged.
- No migration or data change was needed. No production access or publish.
- Focused tests: 19 passed across `tests/labTests.test.ts` and `tests/labTestRoutes.integration.test.ts`.
- `npm run build`: passed.
- Full suite: not run yet; scheduled once after Part 3.

## Part 2 — Tray spray-rate test

- Added the tray test for prime or tack coats. Each tray records chainage, side, dimensions or area, and empty/after-spraying weights. The form shows each rate and the average; details and print show the same calculations in a monochrome table.
- The form also records coat, material-master selection, and optional equipment/person applied-by text. Soil-only sample-source, source-name, benchmark, calibration, and shared chainage/side fields are hidden. The server stores the existing `sample_source_kind` value `site` for this test type.
- Spray-rate limits use the BOQ item's Setup minimum/maximum when present. Otherwise the app reads a rate such as `0.60 kg/sqm` from the BOQ name/description and applies the Setup tolerance, defaulting to ±0.05 kg/sqm. The average is marked Pass/Fail and the difference is shown in kg/sqm.
- Added one nullable `boq_item_quality_specs.target_tolerance` column. Migration `0072_lab_test_target_tolerance.sql` was applied to the two development databases only: `sitelog_dev` and `heliumdb`. Both were confirmed to contain the column. No existing rows were changed.
- After restart, read-only startup readiness reported `ready: true`; no startup schema error.
- Focused tests: 21 passed across `tests/labTests.test.ts` and `tests/labTestRoutes.integration.test.ts`, including two-tray average, parsed BOQ rates, tolerance pass/fail, and server storage as `site`.
- `npm run build`: passed.
- Full suite: not run yet; scheduled once after Part 3. No production access or publish.

## Part 3 — Layer thickness test

- Added measured-point and saved-level-sheet modes. The level-sheet mode reads only saved sheets at the selected site, matches chainage, side and offset, and calculates thickness as top RL minus below-layer RL. Level sheets are not changed.
- Design thickness comes from the selected BOQ item's `layerConfig.thicknessMm` when present; otherwise the test form accepts a typed value. Setup tolerances default to 10 mm below and 15 mm above. Each point shows its thinner/thicker difference; the result includes average, minimum and out-of-tolerance points. Pass requires every point to be within tolerance.
- Added the nullable `boq_item_quality_specs.thickness_tolerance_below_mm` and `thickness_tolerance_above_mm` columns in migration `0073_lab_test_thickness_tolerance.sql`. Applied to development databases `sitelog_dev` and `heliumdb`; no existing rows were changed. Read-only startup readiness after restart reported `ready: true` with 2,533 checked columns.
- The test stores the existing `sample_source_kind` value `site`. No production access, real level-sheet edits, or publish.
- Focused tests: 23 passed across `tests/labTests.test.ts` and `tests/labTestRoutes.integration.test.ts`, covering measured-point failures, point matching, saved-sheet reads, and thickness results.
- `npm run build`: passed.
- Full suite: running once after Part 3; final result to be added here.
