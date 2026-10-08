# Bulk source regression and role-action labels

## Confirmed cause

Reproduced the failing integration test before editing. PostgreSQL reported:
`column site_material_trips.material_source_type does not exist` (42703).

The isolated test creates its own trip table by hand. It did not include the
two columns introduced by migration 0043. The production bulk query's correct
own-source exclusion therefore errored before reaching the zero-match guard.
This was a schema-fixture mismatch, not false success in the handler.

Added the two nullable columns to that test table. No test assertion was removed,
relaxed or skipped. No operational database rows or production SQL were changed.

## Verification

- Original zero-match / audit-failure test now passes unchanged: zero matches
  return HTTP 409; forced audit failure returns HTTP 500 and rolls back the
  material-source update and audit records.
- Added a real PostgreSQL integration test: 701 eligible trips commit with
  exactly 701 audit rows; an own-source trip remains untouched; repeating the
  unassigned-only request returns 409, not success.
- Full suite: **4,588 passed, 48 failed, 3 skipped**. Exact failure names match
  the 48-failure baseline; no additional failures. See `bulk-fix-tests.json`.
- All role UI component tests pass, including new checks for button text and
  styling. Existing click/open/save coverage remains intact.
- Signed-in visual verification was not repeated; the preview capture is
  unauthenticated. Button states are verified by the component tests.

## UI change

Uses the existing `classifyTripRoles` directly: unresolved rows retain a
prominent **Set roles** button; confirmed rows show muted outline **Change
roles**. Both use the same existing edit permission and dialog handler.

Earlier REPORT.md records the preceding verification run, not these results.
