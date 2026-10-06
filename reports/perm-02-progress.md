# PERM-02 — pre-change evidence

## Part A1, development only

Before any application or permission changes, a read-only transaction against
`DEV_DATABASE_URL` verified `current_database() = sitelog_dev`.

Query predicate: `can_view = false` and any of `can_create`, `can_edit`,
`can_delete`, `can_view_reports`, `can_export`, `can_approve` true.

**Count: 0. Full lockout list: empty. Production was not queried.**

Therefore A2 requires no updates for the current development users.

## Test authorization

The owner explicitly approved creating and removing temporary development
accounts for permission tests. Test-only grant changes and exact device
approvals are permitted. Existing-user changes remain limited to the additive
access-preservation grants required by the instruction.

## Baseline

Original audit reports and non-credential database comparison evidence are
retained under `/tmp/perm02/`. The users snapshot contains only IDs and whole-row
hashes, not credential fields. The permission snapshot retains all ordinary
matrix fields so the final comparison can verify every bit.

The full baseline suite is running with two workers and JSON output at
`/tmp/perm02/baseline-tests.json`. This is preliminary evidence, not a completion
report.
