# Full-suite publication verification — 2026-10-13

## Verdict

No new failing tests were detected relative to the revision immediately before the latest startup/reminder fixes. All 122 current test failures reproduce in that baseline. This supports the latest fixes, but does not certify the whole application as defect-free or the full suite as passing. The baseline already contains the Vendor Bills recovery and initial startup hardening; this is not a comparison against the currently published application.

## Results

| Measure | Pre-fix baseline | Current |
|---|---:|---:|
| Tests | 5,145 | 5,152 |
| Passed | 5,015 | 5,025 |
| Failed | 125 | 122 |
| Skipped | 5 | 5 |
| Files discovered | 384 | 385 |
| Failing files | 39 | 38 |
| Unhandled errors | 13 | 13 |

Compared by relative file path and full test name: zero new failing tests, three previously failing tests now pass, seven new reminder tests all pass, and zero tests removed. The three repaired cases are the equipment recovery/identity-lock fixtures. Both runs exited 1, not success.

The five skipped cases comprise two opt-in labour PostgreSQL tests, one opt-in browser fixture, and two tests blocked by the vendorTripOnlyPull suite setup assertion. That setup failure reproduces in both revisions and is included among failing files; it is not a harmless intentional skip.

## Method and safety

Current revision: c70f27bf. Baseline: 0cae7288, extracted without changing the working branch. Both ran Vitest with maxWorkers=2, the same installed dependencies, normal server/frontend discovery and JSON evidence. Each completed in approximately five minutes. No test filtering, assertion weakening or failure suppression was used.

A separate native PostgreSQL instance on a private Unix socket was populated with schema only. Database URLs for test processes pointed to that disposable instance; real application/Production credentials were not used by test processes. Development was read solely for its schema and identity. Tests used synthetic records, temporary tables/schemas or PGlite. The disposable server was stopped afterward. Test-generated PDFs were preserved in temporary evidence storage and the tracked originals restored.

No application/test source edits, Production writes, publishing, workflow restart or new production build were performed in this verification-only pass. The prior passing production build remains applicable because application source did not change. No new signed-in browser verification was performed.

## Failure interpretation

Confirmed test-harness failures include an incomplete mock query chain (missing orderBy), missing exports in route mocks, and missing supplier_vendor_id in synthetic schemas. Other failures assert removed UI text, old route/status expectations or old permission catalogue sizes. These observations do not prove every remaining failure is obsolete: authorization, persistence, routing and financial-output mismatches still require individual contract review. Do not weaken permissions or change restored Vendor Bills calculations merely to satisfy old assertions.

## Current failing-file inventory

All files below also fail in the baseline. Counts are failed test cases; zero denotes a suite setup failure.

| File | Failed cases |
|---|---:|
| tests/dieselPurchase06m.test.ts | 1 |
| tests/dpr02Fix2EquipmentLayout.test.ts | 1 |
| tests/dpr02MaterialTripRoutes.test.ts | 1 |
| tests/dpr03EquipmentTaskFinancial.test.ts | 3 |
| tests/dpr04Fix2.test.ts | 10 |
| tests/dpr07VersionValidation.test.ts | 12 |
| tests/dpr16B1.test.ts | 1 |
| tests/dpr16B2SiteEdit.test.ts | 1 |
| tests/dpr16B3Rendered.test.tsx | 1 |
| tests/dpr18B2SiteEdit.test.ts | 1 |
| tests/dprBreakdownPersistence1430.test.ts | 1 |
| tests/equipmentUsageFormReorganisation.test.ts | 2 |
| tests/fieldHomeDprResponseGuard.test.ts | 1 |
| tests/focusedDprRestoration1449.test.ts | 1 |
| tests/guidedDprReliability.test.ts | 10 |
| tests/initialScopeCorrectionRoutes.test.ts | 2 |
| tests/mat01MaterialsReceivedQueries.test.ts | 1 |
| tests/perm01SupportingReads.test.ts | 1 |
| tests/permission-map.test.ts | 2 |
| tests/purchaseOrderPartC.test.ts | 5 |
| tests/siteDashboardActivity06X.test.ts | 1 |
| tests/siteEditDispatch06XHF6.test.ts | 17 |
| tests/siteEditDpr10.test.tsx | 2 |
| tests/siteMaterialTripsMaterialSourceUi.test.ts | 3 |
| tests/siteMaterialTripsTransport.test.ts | 1 |
| tests/tipperDailyHire.test.ts | 8 |
| tests/tipperDailyHireUi.test.tsx | 1 |
| tests/uppercaseBusinessTextMigration.test.ts | 1 |
| tests/vehicleSupplierAssociationPostgres.integration.test.ts | 5 |
| tests/vendorBillCalendarSummary.test.tsx | 5 |
| tests/vendorBillingIdentityLabel.test.ts | 1 |
| tests/vendorBillsEquipmentHire07b.test.tsx | 6 |
| tests/vendorIdentityTipper.test.ts | 4 |
| tests/vendorPayablesPreview.test.ts | 4 |
| tests/vendorTripOnlyPull.test.ts | 0 |
| client/src/__tests__/dprManagement.test.tsx | 1 |
| client/src/components/permissions/model.test.ts | 2 |
| client/src/components/vendor-bills/hireBillTerms.test.ts | 2 |

## Release recommendation

The latest startup/reminder fixes have passed this regression comparison. A clean application-wide release gate has not passed: 122 pre-existing failures, the setup failure and 13 unhandled errors remain. Do not describe them as 122 confirmed live bugs, but do not dismiss them all as harmless tests either. No publication was performed.
