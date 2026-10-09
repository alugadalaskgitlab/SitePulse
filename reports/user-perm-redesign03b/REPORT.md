# USER-PERM-REDESIGN-03B — implementation and qualified acceptance

9 October 2026. **Core permission correction verified; full acceptance is NOT
clean. Do not publish on the strength of this report.**

## Verdict and exceptions

Granular Diesel and Maintenance reads work without broad grants. Legacy
alternatives remain recognized. View-only mutation probes are denied. Both
signed-in pages render the permitted site's fixtures. Build and 107 focused
regression tests passed.

**Two acceptance exceptions remain:**

1. Development has no `public.attachment_links` table. Diesel attachment reads
   return 500 for both the granular reader and the disposable Administrator.
   `getAttachments` joins that table. This is a supporting-read environment
   blocker, not a passing attachment test. No table was created: this instruction
   prohibits schema changes.
2. The single restart used to load backend changes ran existing startup repairs.
   Logs report 29 historical LDO dispatch-ledger rows created and balances
   recomputed. After cleanup, stock_ledger and stock_balances retain their original
   row counts but have different content digests. Therefore the requirement that
   **all existing business records remain unchanged did not pass**. No manual
   attempt was made to reverse or repair those changes.

## Exact application changes

| File | Change |
|---|---|
| server/routes.ts | Opt-in granular Diesel View for list, summary, detail, receipt status and Diesel attachment metadata/count reads; saved-site-ID scoping for those reads. Maintenance list/detail/health/count accept dedicated View OR Equipment View; narrowly projected equipment-options endpoint; maintenance attachment reads retain source scope. |
| client/src/pages/DieselRequirements.tsx | Avoid equipment/recent/material master requests for granular-only readers; approval quantity fields disabled without approval authority. |
| client/src/pages/PlantMaintenance.tsx | Accept dedicated View at the in-page gate; use restricted filter metadata for dedicated readers; do not fetch stores/stock for read-only users. |
| client/src/pages/Plant.tsx | Existing Maintenance tiles recognize dedicated Maintenance permission. |
| client/src/pages/EquipmentHub.tsx | Existing Maintenance tile recognizes dedicated permission when the user already has access to this hub. |
| client/src/components/HubShell.tsx | Direct Diesel/Maintenance links for dedicated readers lacking the relevant hub grants. No general navigation redesign or broad hub access grant. |
| tests/dieselReceiptPending06mC.test.ts | Missing requested Diesel record now expects 404 before receipt lookup rather than an empty successful map. |

Acceptance tooling: scripts/verification/permissions03b-{setup,runtime,fixtures,
api,browser,cleanup}.mjs. Evidence is in this report directory.

### Authorization details

- Diesel's old helper alternatives are retained: Admin/Owner, site_diesel
  view/create/edit, stores_inventory view, diesel_req_raise view/create/edit.
  `diesel_req_view.view` is added **only to record-oriented reads**.
- Dedicated Diesel View does not grant the legacy company-wide daily/comparison
  report endpoints, recent-equipment lookup, mutations, payments or exports.
  Those existing endpoint authorities remain unchanged.
- List/summary are filtered by explicit stored site_id. Detail, receipt status
  and attachment metadata/count requests refuse a foreign site. Restricted
  users cannot read an unassigned record; Admin/Owner and explicit All Sites
  retain unrestricted record visibility. No site is guessed or backfilled.
- This closes a real Diesel site gap: before this batch, legacy readers could
  read the second site's fixture. Thus legacy **permission alternatives** are
  preserved, but their out-of-site list/detail exposure is intentionally removed
  to satisfy the cross-site acceptance requirement.
- Maintenance mutations still use the original Equipment create/edit/delete or
  Administrator gates. Source-linked records continue to use their existing
  source/site resolver; foreign detail returns 403 and concealed attachments
  return 404. Unlinked legacy maintenance retains its existing coarse access
  behavior; this is not a claim to have assigned sites to legacy records.
- Dedicated Maintenance health output excludes equipment-master-only zero-event
  rows. Filter options return only id/name from readable maintenance history,
  not rates, commercial terms or full equipment master data.
- Attachment changes are limited to Diesel purchase and equipment
  maintenance/breakdown metadata/count reads. General document-content/object
  access enforcement was not redesigned or certified here.

## Actual authenticated requests

`before-api.json` and `after-api.json` contain 51 requests each, with method,
path, observed status and returned identifiers. They use normal login, current
server middleware and persisted disposable-user grants—not injected identities.
The `expected` column describes the target after-change behavior even in the
before file; use `status` for observed evidence.

| Test | Before | After |
|---|---:|---:|
| diesel_req_view.view alone: list / own-site detail | 403 / 403 | 200 / 200 |
| site_diesel.view alone: list / own-site detail | 200 / 200 | 200 / 200 |
| stores_inventory.view alone: list / own-site detail | 200 / 200 | 200 / 200 |
| diesel_req_raise.create alone: list / own-site detail | 200 / 200 | 200 / 200 |
| Diesel legacy alternatives: foreign detail | 200 | 403 |
| plant_maintenance.view alone: list / own-site detail | 403 / 403 | 200 / 200 |
| plant_equipment.view alone: list / own-site detail | 200 / 200 | 200 / 200 |
| Maintenance foreign source detail with Equipment View | 403 | 403 |
| Granular Maintenance foreign source detail | 403 (permission) | 403 (site) |
| All authorizing bits off: Diesel/Maintenance lists | 403 | 403 |
| Administrator list/summary-support checks | 200 | 200 |
| Diesel granular create/edit/delete/approve/reject/purchase/payment | 403 | 403 |
| Maintenance granular create/edit/delete/cancel/parts-add | 403 | 403 |
| Granular Diesel summary / own receipt status | 403 | 200 |
| Granular Diesel foreign receipt / attachment metadata | 403 | 403 |
| Granular Diesel daily/comparison reports | 403 | 403 |
| Granular Diesel own attachment metadata | 403 | **500: missing development table** |

After-state request expectations: **50/51 match**. The single remaining mismatch
is the attachment read. This is not a claim of 51 passing tests.

The equipment master GET returned 200 before AND after despite the dedicated
reader lacking Equipment View. That inherited endpoint reachability was not
introduced by this change. The new Maintenance screen does not call that endpoint
for dedicated readers. Its broader enforcement is outside this batch and was not
tightened. Stores item access remains denied for the dedicated reader.

Two fixture sites, two machines, two source-linked maintenance logs, two usage
records and two Diesel requirements were used. Fixtures were inserted directly
in a transaction after asserting sitelog_dev; they did not post stock or send
business notifications. All tested authorization requests were real HTTP calls.

## Signed-in browser evidence

Normal login for the disposable Administrator initially returned 202. The owner
approved its exact pending development device through ordinary Device Approvals.
The disposable Administrator subsequently approved the ordinary subject's device
through the existing authenticated API. No fabricated session or device bypass.

Chromium used those genuine login cookies and the real application:

- screenshots/diesel-granular.png — permitted-site list and direct navigation.
- screenshots/diesel-detail.png — real clicked record, read-only approval inputs.
- screenshots/maintenance-granular.png — own machine present, foreign machine absent.
- screenshots/maintenance-health.png — real Health tab; own machine present,
  foreign machine absent.

The browser subject had only the two dedicated View grants together, with one
selected site and no hub/broad/mutation grants. Individual-grant isolation is
proved separately by the API matrix. No failed network requests were observed in
these captured screen paths. This does NOT override the separately observed
attachment 500; the pending Diesel screen did not exercise purchase attachments.

## Administrator discrepancy — separate investigation

Fresh read-only checks confirm user ID 3 is active/Admin in production and
active/non-admin in development. Development also has field-engineer=true where
production has false. These are different environment states; the observations
are compatible, not proof of a promotion during verification. Numeric IDs alone
do not prove cross-environment identity. No explanation of when/why the databases
diverged is claimed. See account-discrepancy.md.

## Cleanup and preservation

Cleanup removed 2 users, 16 disposable sessions, 2 devices, 92 permission rows,
1 site assignment, 2 test sites, 2 machines, 2 usage rows, 2 maintenance logs,
2 Diesel headers and 2 Diesel items. Explicit remaining counts for disposable
users/sessions/devices/grants/site assignments/audit rows are zero. Browser
profile and private cookie files were deleted; sequences were not reset.

Of 140 table count/content digests, **136 match**. Original users, permission
matrices, site assignments and the fixture business tables match exactly after
cleanup. Exceptions:

- stock_ledger: 360 rows before/after, different digest.
- stock_balances: 18 rows before/after, different digest.
- user_devices: 81 before/after, different digest.
- user_sessions: 269 before/after, different digest.

The startup logs establish that historical repairs ran, but aggregate digests
do not identify every changed field. Session/device activity also occurred during
the owner's approval and interactive use. No full equality is claimed for these
four tables. A separate immediate post-restart snapshot was not captured; this
limits attribution. Preservation failed for the two stock tables.

No production writes or existing user flag/grant changes were made. No schema
changes were authored or manually applied; the existing startup routines still
ran. Override storage, Site Requirements workflows, authentication architecture,
and IRN/Vendor Bill/Material Trip enforcement were not changed.

## Regression and Publish preview

- `npm run build`: passed, existing bundle-size warnings.
- Four focused Vitest files: **107/107 passed** using bounded workers.
  Diesel comparison, payment status, receipt status and permission delegation.
- One existing receipt-status assertion was updated for the new explicit
  nonexistent-record 404; the initial run's failure was not hidden.
- Actual publishing schema preview: success=true, hasDiff=false, empty statements,
  no destructive or compatibility warnings. See publish-preview.json.
  This compares managed publishing databases, NOT sitelog_dev; it does not
  contradict the missing attachment_links table in the app's development DB.
- No publishing was initiated.

**Stop:** core code is built and permission-tested, but attachment acceptance and
unchanged-business-data certification remain blocked. No rollout recommendation.
