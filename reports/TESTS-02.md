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
