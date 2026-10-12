# Vendor Bills recovery compatibility gate

## Outcome

Stopped before application-code restoration. Task remains incomplete.
No schema, index, data, workflow or deployment changes were performed.
Queries were SELECT-only through the supported managed database interfaces.

## Reference

`75fd8e337d27` is the direct parent of `4d4fba9b54fb`.
The current tree contains later changes across the Vendor Bills page,
calendars/exports, request validation, calculation engine and shared route/storage
files. Restoring only the page would not restore a compatible workflow.
Shared route/storage files also contain unrelated operational changes and must
not be restored wholesale.

## Verified database findings

The managed production database has the original unconditional unique index on
hire statements' equipment, period start and period end. The managed development
database used for publication has a partial version of the same index that
excludes daily statements linked to Vendor Bills. Current schema source agrees
with that partial version.

The production aggregate inspection returned:

- 56 Vendor Bills: 38 Paid, 1 Approved, 1 Verified, 16 Draft.
- 8 hire statements, all Monthly/Draft; 7 linked to bills.
- All 8 have object-shaped calculation snapshots; 7 have working-sheet arrays.
- No orphan statement-to-bill references.
- No daily hire statements; no snapshots matching the checked
  confirmedForDailyHire=true pattern. This pattern check is not a complete
  classification of all historical source evidence.

Managed development has no duplicate equipment/period groups at query time.
The separate application development database has not been checked.
No private bill contents were copied into this report.

## Scope blocker

The accepted recovery plan explicitly excludes schema/index rollback and
migrations while requiring current schema/index retention. That leaves a
pre-existing production/development index mismatch unresolved. Code restoration
alone cannot establish a no-schema-change publication outcome.

This is not proof of corrupt bills or a runtime incompatibility with either
index. It is an unresolved publication/schema-compatibility gate. Do not
silently choose to relax the production constraint, restore the development
constraint or introduce migration/startup DDL.

The narrow potential resolution is separately authorized development-only
alignment with production's existing index, after checking both development
targets for conflicting saved statements and preserving every record. This
would require updating the schema declaration consistently, checking post-merge
behavior, and confirming the resulting publish schema comparison; it has NOT
been performed or approved by this report.

## Verification status

- Historical database integrity checks above: performed, read-only.
- Historical bills opening in a restored UI: not tested; restoration not started.
- Focused recovery regression tests: not run.
- Production build: not run; reserved for completed recovery changes.
- Publish safety: not established. Do not publish this as the completed recovery.

All application modules remain unchanged, including Vendor Bills, DPR, Masters,
Material Trips, procurement, inventory and permissions. No production data or
database rollback was performed. No follow-up tasks were created.
