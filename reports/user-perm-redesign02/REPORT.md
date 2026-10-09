# USER-PERM-REDESIGN-02 — Implementation and verification

## Status

Phase 2B frontend implementation is complete. Automated verification and build pass within the baseline described below. **Authenticated editor acceptance remains blocked.** No publishing was performed. This is not an unconditional release sign-off.

The implementation was committed locally. `git push origin main` failed because
GitHub rejected the configured username/token. No credential was displayed,
replaced or requested in chat. The commit has **not been pushed**.

## Delivered

- Reusable hierarchical permissions workbench integrated into User Management.
- Hub → module → function → actions, expandable navigation, search, stored-grant Allowed/Denied filters, Changed and Conflicts.
- Shared canonical state across repeated navigation locations.
- Existing grant editing separated from **proposed-only** Inherit / Allow / Deny settings.
- Current/staged grants, compatible legacy alternatives, conditional authority, business restrictions and privileged-account explanations.
- Explicit template preview/application; template selection alone neither saves nor applies grants.
- Separate actual-change and proposed-only review. Existing save payloads exclude all proposed overrides.
- Existing permission PUT followed by existing GET read-back before success. An accepted write with failed read-back is reported as unverified and blocks blind retry.
- Existing site/account workflows retained. Owner status remains informational; no promotion mechanism.
- Legacy editor retained as a fallback using the same draft.
- Creation uses the same explorer for template review. Individual persisted customization continues through the existing post-create Advanced permissions step; no new arbitrary-matrix creation API was introduced.

## Coverage

| Inventory | Count |
|---|---:|
| Canonical discovery nodes | 364 |
| Display hubs | 18 |
| Hub/module locations | 186 |
| Frontend route declarations | 130 |
| Page files, including legacy/unreachable classifications | 125 |
| Hub tile declarations mapped | 92 |
| Permission sections / standard cells | 92 / 736 |
| UI control declarations | 2,995 |
| Backend HTTP operations | 643 |
| Proposed capability identities | 734 |
| Workflow-specific proposed capabilities | 91 |
| API-only/legacy-only operation nodes | 80 |
| Navigation configuration objects / links | 43 / 351 |
| Frontend API call provenance entries | 2,010 |
| Background / notification call sites | 106 / 191 |

Counts indicate evidence coverage, not that every discovery item is an independently enforced capability. In particular, 1,281 dynamic control labels retain source provenance instead of executing source expressions. Unresolved and compound operation guards remain conditional; a union of observed references is not presented as a proven authorization OR.

Compact frontend metadata excludes raw API handler bodies, JSX, event expressions and request bodies. Inventory-source hashes support reproducibility.

## Verification

### Focused tests

**65/65 passed** across five affected files, including 34 new tests. Coverage includes:

- All inventory rows and original permission sections accounted for.
- Hidden/inactive grants preserved; unavailable controls inert.
- Partial-manager grant ceilings and protected targets.
- Shared function/proposal identities.
- Opening, draft edits, cancellation and template preview without writes.
- Explicit template application before continuing creation.
- Payload compatibility and proposed-state exclusion from saves.
- Save read-back success/failure and retry safety.
- Legacy fallback contract and original alias/Notify preservation assertions.

These use real application components, matrix types and existing API response shapes, with isolated API fixtures. **They are not authenticated live-save proof.**

### Full-suite comparison

The baseline was run from an immutable pre-change checkout. Both full runs used the same configured client/server discovery and two workers.

| | Baseline | Final |
|---|---:|---:|
| Test files | 347 | 350 |
| Tests | 4,804 | 4,838 |
| Passed | 4,752 | 4,787 |
| Failed | 49 | 48 |
| Skipped/pending | 3 | 3 |

**No new failing test identities. No baseline files omitted.** Three new test files account for the added tests. The suite is not globally green: 48 existing failures remain.

An intermediate run found failures in older tests expecting the previous UI sequence. Those tests now explicitly enter the retained legacy grid where appropriate, apply template previews, confirm reviews and mock the existing read-back response. Original cases and security assertions were retained, not deleted or skipped. Detailed comparison is in `test-comparison.json`.

### Build and runtime

- Final production build succeeded; existing bundle-size warnings remain.
- Development application restarted once and serves port 5000.
- Unauthenticated `/admin/users` screenshot captured the application splash with a 401, **not the signed-in editor**.
- The ordinary development account's normal login returned **202, pending device approval**. No device approval, permission elevation, password reset, Owner promotion or alternate authentication was attempted.
- The documented ordinary verification account also lacks permission-management authority. Signed-in editor screenshots and a real permission-save/read-back therefore remain unverified under this instruction's restrictions.

## Preservation evidence

Read-only checks against the application development database compared aggregate row counts and content digests before and after:

| Table | Rows | Result |
|---|---:|---|
| users | 6 | Identical |
| user_permissions | 371 | Identical |
| user_site_access | 11 | Identical |

This includes existing passwords, flags, Owner status and site assignments within those rows. Evidence stores only counts/digests, not credentials or personal records.

No changes were made to backend/shared permission definitions, guards, authentication, device approval code, schema, navigation, operational workflow code or deployment configuration.

### Important development-restart exception

The existing application startup runs database maintenance automatically. The verification restart's logs reported:

- 124 DPRs marked superseded.
- 67 historical DPR equipment/diesel ledger entries rebuilt.
- 3 LDO stock balances fixed.
- 29 missing dispatch LDO ledger rows created and balances recomputed.

These routines were not added or changed by this implementation. Nevertheless, the reported writes mean **historical development data preservation cannot be claimed**. There was no complete historical-record snapshot for comparing their net effects. No reversal, repair or further restart was attempted.

The permission-preservation startup marker separately reported zero changed permission rows, consistent with the before/after checks.

Normal sign-in attempts may record pending-device/login audit activity; they did not approve a device. No production database query or write was performed for this implementation.

## Publish impact preview

This is a **source-change impact preview, not Replit's actual Publish/schema-diff screen**:

- User Management frontend, display metadata/styles and focused tests.
- No backend guards, schema, new override storage or navigation changes.
- Existing save APIs remain authoritative.
- Proposed denials do not become enforced denials.
- No deployment settings changed; no publish initiated.

An actual Publish preview was not generated. Signed-in acceptance is incomplete, so the report does not recommend publishing yet.

## Remaining acceptance boundary

An appropriately authorized development session/device is required for real editor screenshots and live save verification. The current instruction does not permit making the account/device changes needed to obtain one. Retain the legacy editor until that acceptance is complete.
