# Full-suite publication verification — 2026-10-13

## Current verification result

The final controlled full suite passes: **5,156 passed, 0 failed, 3 skipped**
out of **5,159 cases across 385 discovered files**. File inventories match the
preceding controlled run exactly: no files were removed or added.

The preceding run had 5,137 passed, 17 failed and 5 skipped, plus a route-collector
setup failure. All 17 failures are resolved. The repaired collector now executes
its two previously skipped billing cases; this explains the reduction from five
skips to three. The remaining skips are explicit opt-ins:

- Two native PostgreSQL labour tests require `LABOUR01_PG_TEST=1`.
- The standalone browser HTTP/storage fixture requires `VB23B_BROWSER_FIXTURE=1`
  and intentionally does not run as a normal suite test.

A fresh **production build passes**. The bundler reports large-chunk warnings,
not build failures. Application behavior, Vendor Bills application code,
Production data and schema were not changed, and no publishing was performed.
Changes are limited to test fixtures/assertions, the development-only browser
verification helper, documentation and verification lessons.

Positive billing checks still exercise actual saves/reloads, operational
DPR/equipment evidence, Master-aligned new-bill terms, reviewed vendor identity,
overlap/duplicate protection and frozen historical snapshots. Material delivery
history remains audit/review evidence; it is not converted into daily hire.
Tests also retain deliberate source-removal suppression in the current draft
rather than restoring the withdrawn re-pull expectation.

Tests used a disposable native PostgreSQL instance, with all four test database
URLs redirected and two workers. PostgreSQL and Vitest ran in one long-lived
shell; the disposable server was confirmed stopped afterward. No application
database was used for suite fixtures. The build ran separately.

Full-suite evidence: `/tmp/deployment-readiness-final.json` and
`/tmp/deployment-readiness-final.log`. Build evidence:
`/tmp/deployment-readiness-build-final.log`.

## Signed-in development browser check and limits

The documented ordinary development verification account successfully signed
in through the normal login and device-approval flow. No authentication bypass,
password reset, grant expansion or privileged account flags were used.

The signed-in account screen, Vendor Bills list and new-bill form rendered.
Protected Vendor Bills and DPR read APIs returned HTTP 200. The field-specific
DPR dashboard rendered its permission-denied screen for this account. Shared
API access is not proof that the account can use a differently gated field route.

No business mutations were sent by the browser check. The blank bill form was
closed without saving; the session was logged out, the newly approved disposable
device removed and Chromium/profile cleaned up. Evidence is in
`/tmp/deployment-readiness-browser/result.json` and its screenshots. The helper
is `scripts/verification/deployment-readiness-browser.mjs`; it consumes the
existing secret only inside normal login and never logs credentials or cookies.

**Automated suite and build gates pass.** The separate isolated check below
extends acceptance to one material bill's save/edit path. DPR edit/save,
billing approval/payment/export, other bill types and the published app remain
outside this acceptance check. This is not blanket deployment clearance.

## Isolated signed-in Vendor Bill save/edit verification

**Passed.** A disposable sibling database was created on the development
PostgreSQL host using a **schema-only** dump. No business rows were copied.
The existing production build ran separately on port 5099 against that database;
the running application was not repointed and workflow configuration was not
changed.

All fixtures were synthetic: one active site, one material-trip receipt and a
new ordinary account with only Vendor Bills view/create/edit grants and access
to that site. The account remained non-admin/non-owner, without permission
management or all-sites access. Ordinary login returned HTTP 200 after approval
of only that login's pending device inside the disposable database. An unused
synthetic administrator satisfied the application's startup prerequisite; it
was never used to sign in or perform the bill test.

Through the real signed-in UI, the account selected the site, pulled the
synthetic material receipt, entered a rate and saved a draft:

| Check | Verified result |
|---|---|
| Create | HTTP 201; 2.5 MT × ₹100 = ₹250 persisted |
| Reopen/edit | Saved bill opened through its detail screen and Edit action |
| Update | HTTP 200; rate changed to ₹120 and total to ₹300 |
| Persisted evidence | Updated note, original site and draft status retained |
| Integrity | Exactly one bill and one source-linked item; original quantity retained |
| Rendered readback | Updated detail screen showed ₹300 and the edited note |

Direct database readback confirmed these values; this was not mocked API
success or browser-only fixture interception. Storage assigned its normal bill
number rather than retaining the suggested form number. No verify/approve/pay,
delete or export action was taken.

The temporary application and browser were stopped, the browser profile was
removed, and database deletion was verified. A final catalogue check found
**zero** remaining databases created by this bill-verification helper, including
earlier diagnostic attempts. Shared development received no bill or permission
writes; Production data/schema, Vendor Bills application behavior and
publication settings were untouched. Nothing was published.

The repeatable helper is `scripts/verification/vendor-bill-isolated.mjs`.
Successful-run evidence is `/tmp/vendor-bill-isolated/result.json` and
`/tmp/vendor-bill-isolated/edited-detail.jpg`; temporary evidence is not a durable
artifact. The helper keeps generated passwords and session/device cookies in
memory and excludes them from evidence. Its first-tab browser waits for the
startup splash to finish before starting unsaved form interactions.

## Additional unchanged observation

In the isolated route harness, requesting the removed
`/api/vendor-bills/trip-hire-eligibility` URL matched the generic bill-detail
route and returned HTTP 500 rather than 404. The collector now checks that the
literal retired route is absent instead of expecting its old response. This
invalid-path handling was not changed because Vendor Bills application changes
are outside this instruction. It is not a verified Production finding.

## Earlier verification history

The previous controlled comparison had 5,115 passed, 37 failed and 5 skipped.
Subsequent DPR presentation, trip-editor and permission fixture repairs passed
200 tests across 16 files; with the earlier correction group, focused checks
covered 287 passing tests across 23 files. An earlier attempted run had database
setup failures and 33 skips and is retained only as diagnostic evidence.

The sections below describe earlier results and do not override the final
full-suite result above.

## DPR draft, correction, and version-route verification — focused pass

87 tests pass across dpr07VersionValidation, guidedDprReliability,
initialScopeCorrectionRoutes, dprCorrections.integration,
siteEditDispatch06XHF6, fieldHomeDprResponseGuard and
uppercaseBusinessTextMigration. No failures or skips in this focused run.
This is not a new full-suite result.

The migrated SiteEdit cases exercise the real correction planner as well as
the review-required route response. Existing row identities, required approvals
and source references are asserted; adding or removing submitted evidence is
explicitly blocked. Invalid opening/closing pairs are not restored as successful
Administrator corrections.

The production route's actual semantic-validator callback is exercised without
replacing its behavior. Invalid changed quantity sources, programme links and
material outcomes are rejected. Untouched historical rows survive a labour-only
change. Changed chainages reset review facts, while override reasons cannot
bypass quantity validation. These tests complement, rather than replace, the
isolated PGlite service/persistence tests.

Draft fixtures now use the saved aggregate and real section-token calculations,
preserving the production token guards. Explicit stale tokens are not replaced
by the harness, and a negative case checks rejection with no submission or
saved-draft mutation. Scope-token handoff still reaches the final storage call;
a concurrent scope correction still rejects submission without a notification.

Positive unlinked-BOQ quantity-correction coverage is exercised through the
real correction service with isolated PGlite, review, submission and separate
Administrator approval. Row/equipment identities and the unlinked programme
reference are preserved. Fresh-DPR all-row validation cases remain active.

Only tests changed in this focused pass. Production and application behaviour
are unchanged. Startup assertions require read-only readiness before serving
traffic and explicitly reject the removed automatic backfills. Deployment
clearance and signed-in UI verification are still outstanding.
Evidence: /tmp/dpr-round2.json and /tmp/dpr-round2.log.

## Repair pass — previous full baseline

**Deployment is not yet cleared.** The repair pass resolves 42 of the previous
122 failed cases, but 80 failures across 29 files remain. The production build
passes. This is a partial repair, not completion of the deployment-readiness
request.

| Measure | Before repair | After repair |
|---|---:|---:|
| Passed | 5,025 | 5,067 |
| Failed | 122 | 80 |
| Skipped | 5 | 5 |
| Files discovered | 385 | 385 |
| Failing files | 38 | 29 |

The run exited 1. Comparison by file and test name found no new failures.
No files were excluded, and the setup-blocked vendorTripOnlyPull cases remain
visible rather than being treated as harmless skips.

The permission editor now includes persisted sections absent from its older
discovery snapshot, including vendor_financials, without fabricating route
evidence or changing grants or server enforcement. Test repairs update missing
mock exports, synthetic schema columns, saved-draft submission fixtures,
financial-review API fixtures, explicit rate-card units/vendor identity, and
saved-calendar presentation expectations. Vendor Bills implementation and
calculations were not changed.

Remaining failures include:

- Submitted-DPR tests calling the old version flow without the mandatory
  correction review; draft tests lacking current saved-section prerequisites.
- Tests requiring the deliberately removed bill-owned terms and material-trip
  daily-hire integration. Restoring these to satisfy tests would contradict
  the approved Vendor Bills recovery.
- Source-string/layout assertions, including tests expecting startup backfills
  that were deliberately removed.
- Supporting-read, trip-update, and grouped activity-pull assertions that still
  need review. The grouped billing UI file is not fully passing.

These categories are triage findings, not a blanket determination that every
remaining failure is harmless. Do not publish on the strength of this report.

Evidence: /tmp/deployment-readiness-current.json and
/tmp/deployment-readiness-current.log; build log:
/tmp/deployment-readiness-build.log. Tests used the disposable PostgreSQL
instance with all four test database URLs redirected and two workers. It was
stopped afterward. The production build ran separately. No Production data,
schema, or published application was modified.

Development restarted successfully with read-only readiness reporting 2,061
checked columns. The unauthenticated screenshot rendered the branded startup
screen; signed-in permissions and billing screens were not browser-verified.
Generated PDFs and the test-added port mapping were restored to their pre-run
state.

The sections below retain the earlier comparison as historical evidence.

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
