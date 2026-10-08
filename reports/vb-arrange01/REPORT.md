# VB-ARRANGE-01 — development evidence

Implemented explicit own-source facts, entry/edit controls, list descriptions,
two role filters, and exclusion from material bill candidates. Transport pricing
was not changed. No production database access or publishing was performed.

## Changed application files

- `shared/schema.ts`, `migrations/0043_trip_own_source.sql`: two nullable text
  columns, no defaults or data updates.
- `shared/tripTransportRoles.ts`, `shared/vendorBillTripRoles.ts`: own-source
  roles and no material liability; legacy role rules retained.
- `server/routes.ts`, `server/storage.ts`: create validation, NULL seller
  enforcement, response fields, own-source exclusion from bulk seller assignment.
- `client/src/components/{TripTransportRoleFields,TripRoleEditDialog}.tsx`,
  `client/src/components/trip-role-utils.ts`,
  `client/src/pages/{SiteMaterialTrips,SiteMaterialsReceived}.tsx`.
- `tests/tripOwnSource.test.ts`: nine tests for classification, label validation,
  payloads, absence of seller liability and unchanged transport candidate shape.
- Development migration/verification scripts and evidence in this directory.

## Signed-in evidence

Ordinary login as the dedicated Agent Verification account returned **200**;
`/api/auth/me` returned **200**. No real person's account was used or granted access.
Six new trips were created through authenticated HTTP requests, not inserted
directly. These are API save proofs, **not complete browser form-save proofs**.

| Requirement | Result and evidence |
|---|---|
| 1. Own source + agency | POST **201**, trip 17. Both material vendor columns NULL, `own_source`, label stored, fake transporter B stored. `case-own-agency.json`, `stored-rows.json`. |
| 2. List wording | Real signed-in list renders “SOIL 600 CFT · from our own borrow area · brought by ZZ TEST VENDOR B — VB-ARRANGE-01”. `own-agency-filter.jpg`. |
| 3. Own source + fleet | POST **201**, trip 18; NULL source vendor fields and transporter, existing owned equipment ID 1. `case-own-fleet.json`, `own-fleet-filter.jpg`. The available selected owned equipment was a generator, not a tipper. |
| 4. Missing label | POST **400**, “Enter the borrow area / source description.” Actual browser submission also blocked with that message: `missing-label-browser.jpg`. |
| 5. Four legacy cases | Trips 19–22 each POST **201**, classifying `same_party`, `different_parties`, `in_house`, `unresolved` respectively. `case-*.json`. |
| 6. Own-source filters | Both real dropdown filters return exactly one matching own-source trip. `own-agency-filter.jpg`, `own-fleet-filter.jpg`. |
| 7. Bill pull | Four authenticated GETs **200**, both fake vendors × all/material. Own-source agency trip 17 appears only as transport; no material row for either own-source trip under either vendor. `bill-pulls.json`. No bill saved or rate changed. |

The verification account's existing `/api/vendor-master` access returns **403**
(`master_parties.view`). Only trip Create access was authorized, so that separate
grant was not added. Thus vendor/agency browser form saves and a browser bill
pull were not fully verified. No mocked vendor endpoint or auth bypass was used.
API agency fixtures deliberately omit vehicle numbers to avoid creating standing
vehicle/supplier associations. Consequently the parenthesized vehicle-number
portion of the agency list wording is not proven by this live fixture.

## Cleanup and integrity

`cleanup-proof.json` contains full SHA-256 before/after checksums:

| Data | Before → after | Identical SHA-256 |
|---|---|---|
| Original trips | 10 → 10 | `39b4ecd718e8687ec992d5b4f82d3c8eeceaccdbf19190162951230480555733` |
| Vendor master | 0 → 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Entire permission table | 366 → 366 | `81fbe6650b9de4460e9b01892b613ce93bbfdd52509c65e00da8c0fedeb4f7fb` |

Both new fields remain NULL for every original trip. Original-column content
is identical. Entire permission-table equality includes the verification
account's restored grant and all real people's unchanged grants.

Created and removed: **six trips (17–22), two obviously fake vendors (1–2),
one verification session (370), one verification device (116)**.
Created **zero accounts and zero permission rows**. Temporarily changed only
the existing verification account's trip Create bit, then restored it exactly.
The private cookie/state file was removed.

## Tests and build

- Full suite: **4,586 passed, 49 failed, 3 skipped**, 333 files.
- Compared with saved baseline: **4,578 passed, 48 failed, 3 skipped**, 332 files.
- All 48 baseline failures remain. One additional failure:
  `vehicleSupplierAssociationPostgres.integration.test.ts` /
  `VB24: zero matches is not HTTP success; audit failure is HTTP 500 and rolls back`.
  Expected 409, received 500. Its hand-built temporary trip table lacks the
  newly added source columns; the new own-source exclusion references one.
  The existing test fixture was left unchanged. **The suite is not clean.**
- All original role tests unchanged and passing: 15 classifier + 12 bill-role +
  21 browser-component tests; all nine added own-source tests pass.
- `npm run build`: **exit 0**.

## Decisions and limitations

- Bulk seller assignment skips own-source rows so tagging cannot violate the
  required NULL seller invariant.
- Existing role edits do not require a new own-source label; new trip validation
  does. Explicit null source-type updates use field presence, not null coalescing.
- GitHub push attempted; rejected with **Invalid username or token**. Local
  commit is possible, but remote delivery is blocked until Git authentication
  is repaired. No credentials are included in these reports.
- A genuine Publish preview could not be generated with the available controls.
  Publishing settings can be opened for review; that is not a Publish preview.
  Nothing was published. VB-ARRANGE-02 was not started.
