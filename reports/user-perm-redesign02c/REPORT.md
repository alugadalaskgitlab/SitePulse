# USER-PERM-REDESIGN-02C — Authenticated acceptance

Date: 9 October 2026

## Verdict

**Authenticated editor acceptance completed, with current-backend enforcement exceptions explicitly recorded below.** The tested editor saves existing grants, preserves site assignments, distinguishes preview-only overrides and respects restricted-manager controls. This is **not** a claim that every unchecked permission revokes backend access.

No implementation redesign, backend guard change, authentication change, database schema change or publish was performed. The legacy editor remains in place.

## GitHub synchronization

At the start of this acceptance run, live `git ls-remote origin refs/heads/main` returned `bf014ed00a023d7a173a82e20ae0d62083ca932d`, matching local main. An ancestry check confirmed that it contains `2a42318226d6`.

The earlier push command failed because GitHub rejected the credentials presented at that time. The commit subsequently reached GitHub. Available evidence does not establish who pushed it later or how credentials were corrected; the earlier failure was not a build/code rejection. This run did not need to repush Phase 2B.

## Normal development authentication

- Created a disposable Administrator in the development database, explicitly asserting `current_database() = sitelog_dev`.
- Normal login returned 202 and created pending device 215.
- The user approved that device using the application's ordinary Device Approvals workflow.
- Normal login then returned 200; `/api/auth/me` identified the disposable Administrator.
- Created the subject, restricted manager and limited target through the existing authenticated account-creation API.
- Subject and manager sign-ins first returned 202. The disposable Administrator approved their exact pending devices through the ordinary approval API, then normal sign-ins returned 200.
- No database device approvals, fabricated sessions, authentication bypasses, production credentials or real-person credentials were used.
- The browser used genuine login cookies and the running application's actual components and APIs. The testing-agent configuration was unavailable, so installed Chromium/DevTools was used directly. No mocked page or fixture screenshot was substituted.

## Signed-in evidence

The `screenshots/` directory contains **25 actual browser screenshots**, including:

| Area | Overview | Persisted controls |
|---|---|---|
| Site Operations | 02-site-operations.png | 02b-site-operations-controls.png |
| Diesel Requirements | 03-diesel-requirements.png | 03b-diesel-controls.png |
| IRNs | 04-irns.png | 04b-irn-controls.png |
| Purchase Indents | 05-purchase-indents.png | 05b-purchase-indent-controls.png |
| Material Trips | 06-material-trips.png | 06b-material-trip-controls.png |
| Equipment Maintenance | 07-equipment-maintenance.png | 07b-maintenance-controls.png |
| Vendor Bills | 08-vendor-bills.png | 08d-vendor-bill-controls.png |

Additional screenshots show legacy alternative access, proposed-only settings, reviewed save, reopening, template preview/staging/persistence, restricted-manager limits and Administrator bypass warnings.

## Editor acceptance results

1. **Existing grant save:** Unchecked `diesel_req_view.view` in the hierarchical editor while retaining `site_diesel.view`. A separate read before Save confirmed no implicit write.
2. **Review and save:** Confirmed actual legacy review and clicked Save. The application displayed “Existing permissions saved.” Browser network evidence showed the existing PUT and GET read-back; an independent GET matched the persisted matrix.
3. **Reopen:** The unchecked bit remained off after reopening.
4. **Legacy explanation:** With granular view off and broad legacy view on, the UI displayed “Still allowed on compatible OR paths,” identifying the retained source.
5. **Proposed-only settings:** Selected Allow and Deny and changed another proposal back to Inherit. The UI explicitly called these simulations and stated that backend access was unchanged. The PUT body contained only the legacy matrix—no override state. Reopening reset proposals to Inherit.
6. **Cancel/discard:** Changed the persisted-off bit back on, cancelled and accepted the discard confirmation. API state remained unchanged and reopening showed the bit still off.
7. **Role template:** Selecting Site Engineer did not save. Explicit confirmation only staged the matrix/designation. Review and Save persisted the designation; reopening showed Site Engineer.
8. **Site access:** The subject retained exactly its original selected site, with All Sites false and setup complete, through template application and all tested permission saves.
9. **Restricted manager:** The manager required the existing `permission_manager.view` route grant in addition to its partial-manager flag. Its own grant ceiling was retained; it was not made an Administrator.
10. **Out-of-scope preservation:** Opening a subject with grants beyond that manager's authority showed the preservation warning and disabled Save rather than silently stripping those grants.
11. **Allowed restricted save:** On a clean disposable target, the manager could toggle and save its own Diesel View List grant. The legacy Diesel grant was disabled and remained off in API read-back.
12. **Backend manager checks:** Attempting to change the disposable Administrator's permissions returned 403. An API attempt to grant an unowned Vendor Bills bit was capped to false, while the owned Diesel bit persisted. The existing backend returns 200 with a capped matrix, not a rejection for that case.
13. **Bypass disclosure:** The disposable Administrator's editor prominently displayed its bypass warning. No Owner account was edited or used for testing.

Machine-readable evidence: `editor-results.json`, `manager-results.json`, `backend-results.json`.

## Current backend rules: real non-admin requests

These were authenticated GET requests made as the disposable non-admin subject, not simulated permission calculations. Permission matrices were saved using the existing API between cases.

| List endpoint | Every permission bit off | Broad legacy/supporting view grants |
|---|---|---|
| `/api/diesel-requirements` | 403 | 200 with `site_diesel.view` |
| `/api/purchase-indents` | 403 | 200 with `site_procurement.view` |
| `/api/maintenance/logs` | 403 | 200 with `plant_equipment.view` |
| `/api/irn` | 200; 6 records | 200 |
| `/api/site-material-trips` | 200; 6 records | 200 |
| `/api/vendor-bills` | 200; empty list | 200; empty list |

**Do not treat unchecked boxes as universal revocation.**

- Diesel additionally remained accessible with only `stores_inventory.view`, or only `diesel_req_raise.create`.
- `diesel_req_view.view` alone did **not** authorize the Diesel list API: it returned 403.
- `plant_maintenance.view` alone did **not** authorize Maintenance logs: the current API requires `plant_equipment.view`.
- `purchase_indents_view.view` alone did authorize the Purchase Indent list.
- IRN list code requires authentication rather than the displayed IRN matrix bit. Material Trips uses its existing site-scope filtering without requiring the displayed view bit for this list call. Existing Vendor Bills list logic also accepted the all-off matrix.
- The empty Vendor Bills response proves endpoint acceptance, **not** the ability to read any particular existing bill.
- A final all-off pass reproduced the 403/200 results, proving that the Diesel/PI/Maintenance revocations were enforced when their sources were removed.
- These findings concern the six tested list endpoints. No business create/edit/delete operations were attempted, and this report does not claim exhaustive enforcement verification for all 643 discovered API operations.

These are acceptance findings about existing guards. They were not repaired or redesigned under this instruction.

## Cleanup and preservation

Removed all four disposable accounts and their related rows:

| Removed object | Count |
|---|---:|
| Users | 4 |
| Sessions | 3 |
| Devices | 3 |
| Permission rows | 276 |
| Site assignments | 3 |

No business test records were created. No audit rows associated with the disposable actors remained. Post-cleanup queries found **zero** fixture users, sessions, devices, grants, assignments or actor audit rows. Chromium was stopped and its private profile/cookies were removed.

Before/after checks compared row counts and aggregate content digests for **140 development tables**:

- **138 tables matched exactly**, including all business tables, all 6 original users, all 371 original permission rows and all 11 original site assignments.
- The original `user_devices` and `user_sessions` table digests differed, with counts unchanged at 81 and 269. There was ordinary interactive approval/session activity during this run. Aggregate snapshots cannot identify every changed field or attribute every change; this is not represented as full auth-table equality.
- All disposable auth rows were explicitly checked absent. No existing device/session rows were repaired or reverted.
- Database sequences legitimately advance during inserts; they were not reset.
- No app restart was performed, avoiding the historical startup-repair issue from Phase 2B.
- No real user—including OWNER, sk@highlane.in or K V Babu—was edited. No production records or schema were modified.

Evidence: `preservation-before.json`, `preservation-after.json`, `cleanup.json`, `disposable-manifest.json`.

## Focused tests, build and genuine publishing preview

- **65/65 focused tests passed across 5 files.**
- Production build passed, with existing bundle-size warnings.
- This run added acceptance scripts and evidence only; no application implementation changes were made.
- The actual publishing schema-diff service returned `success: true`, `hasDiff: false`, an empty `statementsToExecute`, no destructive changes, no compatibility warning and no objects to remove.
- This was a genuine schema preview, not a source-only estimate. It is not a guarantee against unrelated runtime startup behavior.
- `publish-preview.json` preserves the returned result. No publishing was initiated.

**STOP: acceptance evidence delivered; existing backend exceptions remain explicitly documented.**
