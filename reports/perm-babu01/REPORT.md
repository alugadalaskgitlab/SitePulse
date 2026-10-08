# PERM-BABU-01

## Finding

An Edit tick is not a site grant: an ordinary user without an assigned site is
correctly refused. But that is **not the whole problem**. Two ordinary-user
pickers incorrectly depended on unrelated permissions: vendor/transporter
selection fetched the protected Vendor Master, and single-trip arrangement
selection fetched a Work Programme-only endpoint. Thus the right Edit tick
and site access could allow the save API while leaving the UI unable to select
its values. Administrator bypassed both unrelated read guards.

The development Babu record already has Site Materials Received View/Edit,
site 16, and completed setup. It is not the reported currently-administrator
configuration. We did not inspect production permissions or historical account
state, so cannot say which refusal his earlier device actually encountered.
Both the configuration failure and the UI defects were established in development.

## Changes — no permission restructuring

- `client/src/pages/SiteMaterialTrips.tsx`: trip editors use a site-keyed
  operational vendor picker rather than requiring Vendor Master access.
- `server/routes.ts`: that picker returns only vendor ID/name/active state,
  with **site_materials Edit AND assertTripSiteAccess**. No sensitive vendor
  fields, activity, bills, master-management access or mutations.
- `server/tripArrangementLink.ts`: existing arrangement options include project
  and item identity, including multi-item allocations.
- `client/src/components/ReceiptWorkContext.tsx`: manual correction uses the
  existing Edit/site-guarded trip options, filtered to the selected project/item,
  rather than the Work Programme-only read. It does not fetch unused programme
  allocations in manual mode.
- Diagnostic harness, two regression tests, existing behavioral-test fixture
  updated to the new site-keyed picker, report/evidence, and relevant memory.

All existing Edit, site, admin/owner and master/Work Programme guards remain
unchanged. No new section, role, flag or grant was introduced. Existing
non-editor vendor-query behavior remains unchanged.

## Exact owner steps

Once this code has been published **by the owner**, for the account in that app:

1. Open **User Management**, find Mr Babu and click **Permissions**.
2. Find **Site Materials Received**. This is also the permission row for
   **Material Trips**; the label currently does not say Material Trips.
   Retain/tick **View** and **Edit**, then **Save Permissions**.
   Do not use a role template or grant-all button.
3. In the same Permissions dialog, expand **Site Access**.
4. Under **Permitted sites**, select each site he should work on and press
   **Save Site Access**. Prefer those specific sites. Use **All sites (explicit
   company-wide grant)** only if company-wide access is genuinely intended.
   Saving a non-empty grant here also completes an incomplete site setup.
5. Keep Delete, Export, Notify and management access unchanged.
6. Only the owner should then use the account's **Edit** dialog, switch off its
   Administrator setting and save. Sign out/in and use the ordinary account.

The Site Access panel already says “No sites selected — this user will not see
any site data until sites are granted here.” No extra label/warning behavior
was needed for the setting to be findable. While Administrator is on, the
screen explicitly warns that permissions/site restrictions are bypassed.
Nothing in this batch altered Mr Babu or another real account.

## Signed-in proof

One disposable ordinary account, normal login and device approval. No auth
mock, admin session, permission bypass or site-scope bypass.

| Check | Exact outcome |
|---|---|
| P1: Edit, setup complete, no sites | Role PATCH, single-link PATCH, options, preview and bulk: **403**, `{"message":"Access denied for this site"}` |
| P2: add only site 16 | Role save, single link and bulk **200**; real UI saves and SQL read-back prove persistence |
| A4: all-sites only instead of a selected site | Same operations **200** |
| A4: incomplete setup, with selected site OR all-sites | All operations **403**, same site message |
| A4: change only setup_complete to true, retaining the selected site | All operations **200** |
| P3 | isAdmin, isOwner, isFieldEngineer, canManagePermissions **false** throughout P2 |
| P4: User/Permission Management APIs | **403** `{"error":"forbidden","section":"user_management","action":"view"}`; management page denied |
| P4: trip DELETE | **403** `{"error":"admin_required"}` |
| P5: remove site access again | **403**, `Access denied for this site`; screenshot of failed save |
| P6: keep site but remove Edit | **403** `{"error":"forbidden","section":"site_materials","action":"edit"}`; screenshot of failed save |

The vendor-options endpoint was also tested for allowed-site 200, no-site 403,
incomplete-setup 403 and no-Edit 403.

P2 UI evidence includes **Our own source + Another transporter**, persisted
source description and transporter name, single arrangement 2, and one bulk
link to arrangement 2. The existing API deliberately omits vendor-review IDs
from editable payloads; this test verifies operational names/roles, not a
new master-association workflow.

Screenshots: `P2-role-editor.jpg`, `P2-role-saved.jpg`,
`P2-single-editor.jpg`, `P2-single-saved.jpg`, `P2-bulk-saved.jpg`,
`P1-P5-site-denied.jpg`, `P6-edit-denied.jpg`,
`P4-user-management-denied.jpg`.
Exact HTTP results and stored rows are in the corresponding JSON files and
`browser-responses.json`.

## Integrity and cleanup

- Z1: original **6 users, 371 permission rows and 11 user-site rows** retained
  identical whole-row SHA-256 checksums. All **5 arrangement rows** unchanged.
  Original vendor table also unchanged. See `integrity.json`.
- Z2: full suite **4,648 passed, exactly 48 baseline failures, 3 skipped**,
  across 341 test files; no new failures or setup failures. Detailed baseline
  comparison: `tests.json`. Two new tests
  cover the manual arrangement picker’s endpoint/item filtering and denied
  reads. Existing role tests retain their assertions; fixtures now provide
  the same vendor catalogue under the new site-keyed URL.
  The initial run exposed eight outdated picker-fixture failures; the updated
  fixture retained all save assertions, passed all 27 focused tests, and the
  subsequent full suite returned to exactly the baseline.
- Z3: **build passed, exit 0**, `build.log`.
- Z4: removed disposable account/permission/site-access row **1900000300**,
  vendor **1900000300**, trips **1900000301–303**, their audit rows and sessions,
  and devices **171–179** across retries. Removed the temporary vehicle
  association **BABU011** pointing only to the disposable transporter.
  Closed the browser and inspector; removed its profile. See `removed.json`.

## Notifications and limits

No test notification reached a real device. A temporary in-memory transport
wrapper blocked **only** “Trip #1900000301/302/303 updated” test payloads before
network delivery. Everything else retained its original sender. This did not
change any account, grant, subscription or application file. Every run restored
the original sender in `finally`; final restoration is recorded in
`notification-fence.json`. Save proof uses real HTTP responses and stored rows,
not a simulated notification response.

The UI also emitted unrelated attachment 500s and a denied optional DPR
programme-bar read; these did not prevent the three requested saves and were
not modified. Standard development restarts were required to load the fixes;
existing startup jobs were neither investigated nor changed.

No publication or 02B work. A genuine Publish preview is not exposed through
the available controls; no settings screen is substituted for it.
