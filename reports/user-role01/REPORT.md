# USER-ROLE-01 — Commercial user setup and roles

## Architecture and scope

Reused the existing section/action permission matrix, role-template application,
guided creation API, permission-save API, site-access editor, session/device
authentication and Admin/Owner checks. No parallel RBAC system, tenant columns,
new role table, automatic template migration or business-calculation changes.

Company isolation remains one independent deployment/database per company, as
confirmed by the owner. This is not a shared-database multi-tenant implementation.

## Standard roles

| Displayed role | Effective starting point |
| --- | --- |
| Owner / Administrator | Existing privileged Administrator creation path, visible only to an administrator. Does not create an Owner. Existing bypass semantics remain unchanged. |
| Operations Director / Project Head — Full Operations | Explicit allowlist for normal operational Create/View/Edit, operational approvals and report viewing. |
| Project Manager | Existing project-manager matrix retained. |
| Site Engineer | Existing engineer matrix retained, including no purchase-indent raising. Existing field-user behavior applies. |
| Site Supervisor | DPRs, site materials and internal requisition entry/edit; assigned-site plans and operational views; no commercial approvals. |
| Stores & Procurement | Union of the existing Stores and Procurement templates. Includes stores operations, internal requisition issue and purchase-indent/vendor-bill preparation. |
| Equipment & Fleet | Existing equipment/plant matrix retained under the requested label. |
| Accounts & Commercial | Existing billing/measurements matrix retained under the requested label. |
| Viewer / Read Only | Existing read-only matrix retained. No Create/Edit/Delete/Approve. |

The old Stores and Procurement identifiers still resolve for existing clients
and explicit retries, but are hidden from the standard role picker.

`role-mappings.json` contains all nine actual API-created permission matrices;
the acceptance script compares ordinary matrices against `applyRoleTemplate`
and Administrator against the existing `fullMatrix`. Templates do not set
Administrator, Owner, permission-manager or record-unlock flags.

### Full Operations

Normal write access includes site DPRs/materials, indents, IRNs, diesel
requirements, vendor bills, stores, plant operations, labour, BOQ, work
programmes, project scope, operational masters, rate cards, stock reconciliation
and RMC records. Operational approvals include DPRs, purchase indents, IRNs,
diesel requirements, bill verification/approval, scope and programme review.

Read access includes operational hubs, reports, stock monitoring, equipment
performance, planning references and calculators.

All Delete, Export and Notify bits remain off by default, consistent with
the existing explicit-grant policy. User/permission management, device/security
administration, system settings, sync, repair/backfill tools and privileged edit
request review are excluded. Existing correction, cancellation, revision and
segregation-of-duties rules remain authoritative.

## User experience

1. Details: existing name, contact/login, password and account options.
2. Role: standard business labels and short descriptions.
3. Site access: selected sites or an explicit All Sites grant.
4. Review: business-language capabilities/restrictions, site scope and expandable
   exact section/action detail. Confirming creates the account.
5. Advanced permissions: optional access to the existing matrix after successful
   creation; adjustments save separately.

Failed setup stays in review with a same-account retry. The existing no-site
audit banner and new incomplete badge explain blocked access. Custom/no-grant
review warns that site assignment alone is not operational access.

For existing users, role selection only previews differences. Additive merge
preserves individual grants by default. Replacement is explicit and lists exact
removals. Confirmation stages the matrix; only Save persists it. Passwords,
sites and privileged/account flags are not changed by applying a matrix.

Partial managers see capped proposals. Unowned existing grants are preserved in
the preview and unsafe saves/copies are blocked rather than silently clearing
them. Existing backend authority and caps remain unchanged.

## Authenticated acceptance

`scripts/user-role01-verify.mjs` uses disposable development users and two sites,
ordinary password login and approval of only their newly issued device records.
No production requests, auth bypass, or privilege changes to existing users.

- All nine starting matrices verified through the actual creation/read APIs.
- Full Operations created a trip (201), corrected its material-source label and
  linked an arrangement (200), read ordinary arrangement options (200), and
  previewed/applied a bulk link (200; one eligible row updated).
- Actual backend refusals (403): user listing/creation, permission changes,
  Delete, branding writes and licence-setting writes.
- Other-site trip creation refused; no-site and incomplete accounts returned
  no site data; explicit All Sites exposed the second fixture site.
- Signed-in browser completed the five-step flow and tested role preview,
  cancel, stage, Save, additive preservation and deliberate replacement.
- Signed-in warning screenshot covers no-site and incomplete setup.

Acceptance found two existing administrative writes protected only by login.
Branding and licence-setting POST handlers now use the existing `assertAdmin`
guard. The discovery request used an empty body and changed no setting.

The signed-in images in this directory are actual browser captures, not mockups.
The generic preview screenshot is unauthenticated and is not used as proof of
the signed-in interface or backend authorization.

## Preservation and cleanup

`integrity-before.json` and `integrity-after.json` match for users (including
password hashes/account flags), section permissions, site assignments, sites,
projects, BOQ items, arrangements, trips, vendors and vendor bill tables.
Only digests—not passwords or password hashes—are written to these files.

`removed.json` lists disposable users, sites, project/item/arrangement and trips
removed after acceptance. Their permissions, assignments, sessions and devices
were removed too. Automatic ID sequences advanced normally; they were not reset.
Test-specific outbound trip pushes were fenced and the original sender restored.

## Verification results

- Full suite: **4,692 passed, 48 failed, 3 skipped**, across **344 files**.
- The same 48 failed test identities appear in the existing baseline: no new
  failures, no missing baseline files (`regression-comparison.json`).
- Final focused permission/setup/regression run: **83 passed**, six files.
- Application production build: **passed** (`build.log`).
- Repository-wide TypeScript checking is not clean: the frontend implementation
  check reported 494 existing diagnostics, none in its changed frontend files.
  The application build is not being presented as a clean typecheck.
- `git diff --check`: passed.

The disposable trip-page check logged two attachment-read 500 responses.
Their cause was not established; attachment handling is outside this change.
These requests are not used as positive attachment verification.

## Genuine Publish preview

No migration is needed for this role/setup work. The platform's actual read-only
Publish schema preview nevertheless reports two pending additive columns from
the earlier arrangement-billing work:

```sql
ALTER TABLE "vendor_bill_items" ADD COLUMN "arrangement_pricing" jsonb;
ALTER TABLE "earthwork_arrangements" ADD COLUMN "billing_terms" jsonb;
```

No removals, truncations, structural data-loss flags or warnings were reported.
See `publish-preview.json`. No SQL was applied to production. Not published.

## Changed files

- `shared/permissions.ts`
- `client/src/pages/UserManagement.tsx`
- `client/src/components/user-role-review.tsx`
- `client/src/components/user-role-review.test.tsx`
- `server/routes.ts` (two existing administrative write guards)
- `tests/userRole01.test.ts`
- `scripts/user-role01-verify.mjs`
- This acceptance report/evidence directory and two existing memory notes.

Pre-existing unrelated generated/PDF changes are not part of this commit.
No feature scope has been deferred. Known baseline test/type errors are reported
separately rather than relabelled as passes.
