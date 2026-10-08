# TRIPS-FILTER-01

## Changes

`server/routes.ts`: GET now passes vehicleNumber, supplier and onlyUnassigned.
`server/storage.ts`: interface and SQL implementation now apply those filters.
`client/src/pages/SiteMaterialTrips.tsx`: approved eligible count and explicit
own-source exclusion count in the bulk action and confirmation. Existing
transporter summary retained; unassigned-only state is now explicit both ways.

No bulk-handler change, trip mutation, schema change, permissions change,
production access or publishing. No pagination, sorting or role-filter change.

## Matching rules copied from the unchanged bulk path

References are in `server/storage.ts`, `bulkAssignSiteMaterialTripMaterialSource`:

- Vehicle, lines 12771–12774: uppercase comparison after removing whitespace
  and hyphens. Input uses the same `normalizeVehicleSupplierVehicle`.
- Transporter, line 12775: `UPPER(TRIM(supplier))`, comparing the same normalized
  input. This is **supplier, the transporter**, never materialSourceSupplier.
- Unassigned, lines 12765 and 12776–12777: source supplier NULL or SQL-trimmed
  empty, **and source type distinct from own_source**. Ordinary lists still
  include own-source trips.
- Whitespace-only incoming vehicle/transporter values mean no filter.
- Existing permitted-site intersection, cancelled/deleted exclusion, ordering
  and BOQ enrichment are unchanged.

**Existing site/material case semantics still differ (list exact equality,
bulk uppercase/trim); left unchanged under A5, so case-variant rows can still
cause differences outside the three filters fixed here.**

## Signed-in development proof

Used ordinary login as verification user 16. Login and `/api/auth/me`: **200**.
All list requests below returned **200**. Exact URLs and row bodies are in
`requests.json`; assertions against the unfiltered authorized set are in
`assertions.json`. No trip fixtures were inserted or updated.

All URLs start with `/api/site-material-trips`.

| Case | Query | Result | Screenshot |
|---|---|---|---|
| Before | no filters | 10 rows | all.jpg |
| P1 | `?supplier=NARSIMULU` | 2 rows; both that transporter | transporter.jpg |
| P2 | `?vehicleNumber=TG15UF3072` | 1 row; that vehicle only | vehicle.jpg |
| P3 | `?onlyUnassigned=true` | 7 rows; every source blank/NULL; 3 assigned excluded | unassigned.jpg |
| P4 | `?supplier=NARSIMULU&site=THAKADPALLY+-+SIRUR&material=Soil&dateFrom=2026-08-11&dateTo=2026-08-11` | 2 rows matching every filter | combined.jpg |
| P5 | `?supplier=ZZ+NO+MATCH+TRIPS+FILTER+01` | 0 rows; “No trips match these filters.” | no-match.jpg |

P6: Development contains no saved own-source trips. A read-only PostgreSQL
VALUES query proves that own-source NULL supplier is excluded while legacy
NULL and vendor blank supplier remain included. SQL-contract tests verify
the same predicate used by the actual list and bulk implementations. No
synthetic trip was saved merely to produce a screenshot.

P7: Read-only dry comparison returned **[11,12]** from both the filtered list's
eligible set and the bulk SQL matching predicate (`dry-comparison.json`).
The verification account cannot edit trips, so its bulk panel is absent.
**A live confirmation-dialog screenshot was not obtainable without changing
parked permissions.** Component tests instead prove six displayed rows with
one own-source row produce five in both bulk button and confirmation, with
the exclusion clearly shown. The bulk write was never invoked.

## Integrity

`site_material_trips`: **10 before, 10 after**, identical full-row SHA-256:

`90445fec9cebf345e88be82e09dcf92faef46a2fa8ff213310c9ef05b82f01a7`

`integrity.json` records both hashes. Normal-login disposable sessions/devices
were removed after each verification run. No grants, accounts or trips were
created. No existing trip was changed.

## Automated coverage

- Added `tripListFilterAgreement.test.ts`: identical complete SQL predicates
  for the three filters plus scope; blank input; deny-all scope.
- Added GET-route test: query forwarding, trimming, boolean parsing, site scope.
- Added component count-agreement test including visible own-source exclusion.
- Updated the old source-text assertion to the user-approved eligible count.
- Final full suite: **4,593 passed, 48 failed, 3 skipped**, with exactly the
  baseline failure identities and no new failures (`tests.json`).
- Build completed with exit 0.

## Limits

The actual Publish preview cannot be generated with the available controls;
publishing settings are not represented as a preview. Nothing was published.
GitHub push must succeed separately; the preceding attempts were rejected by
GitHub for invalid configured credentials.
