# USER-ROLE-02 — Existing-user designation and reviewed permission saves

## Scope and approval

Inspected USER-ROLE-01 and PERM-BABU-01 before implementation. The old flow
persisted only template permissions, not the chosen business role. After
reporting that limitation, stopped and obtained approval for one nullable
`users.business_role` text column.

Applied the additive change to the running application's `sitelog_dev`
development database and the Publish-facing `heliumdb` development database.
No production writes, publishing, startup repair or new RBAC engine.
Existing accounts remain NULL / **Not designated**; no role inference/backfill.

## Delivered behavior

- **Select role → Review differences → Confirm → Save permissions.**
- Pending review visibly explains why Save is disabled. Confirmation stages
  the matrix and designation; it is not a server write.
- Stored and staged designations are separately labelled. Failed saves keep
  staged edits for retry. Query refreshes do not overwrite the working matrix.
- Cancel, Escape and dialog close ask before discarding unsaved work. Copy is
  disabled while work is unsaved; its existing immediate-persistence behavior
  is explicitly described when available.
- Edit User and the user list display the explicitly stored designation.
  Edit User opens the same reviewed permission flow, warning before leaving
  unsaved profile edits.
- Existing Administrator/Owner, permission-manager and unlock flags remain
  separate and visible. Applying an ordinary designation never changes flags.
- Add/Merge explicitly lists retained sensitive permissions, including existing
  Delete/Export/Notify and user/access/system-management grants. It does not
  suggest that choosing Full Operations removes those grants.
- Replacement explicitly lists removed permissions and requires confirmation
  and Save. Advanced matrix adjustments preserve the stored designation.
- New guided accounts persist their explicitly selected designation, including
  Custom. Clear designation is also reviewed and preserves the permission matrix.
- The staged notification that could cover Save was removed after real browser
  verification; the persistent unsaved message remains.

The Full Operations template is unchanged: no default Delete, user/permission
management, privileged system operations or Administrator/Owner flags.
Existing permission gates and delegation caps remain in place.

## Persistence contract

The existing permission-save endpoint retains compatibility with raw matrix
requests. A reviewed assignment uses `{matrix, businessRole}`; unknown
designations and extra account flags are rejected. Omitted designation preserves
the existing value. Explicit null clears only the designation.

Designation and permission replacement commit in the same transaction, with a
user-row lock serializing concurrent permission replacements. Authorization
still uses the existing matrix and account flags, never the business-role field.

## Real signed-in verification

`scripts/user-role02-verify.mjs` uses disposable development accounts, the
existing verification-password secret and ordinary login/device approval.
No authentication bypass or real-account privilege changes.

- Actual browser role selection displayed the differences and disabled-Save
  explanation; API read-back proved no preview write.
- Cancel preview left stored permissions/designation unchanged.
- Confirm staged changes only; API read-back remained unchanged.
- Save persisted Full Operations designation and merged permissions, retaining
  deliberately seeded Delete, Export, Notify and User Management Edit grants.
- Reopened Edit User and Permissions displayed the saved designation.
- Deliberate replacement with Viewer removed those sensitive matrix grants.
- A subsequent real matrix-only advanced API save retained Viewer designation.
- New ordinary Full Operations accounts remained non-admin/non-owner.
- Ordinary authenticated requests returned **403** for user listing, permission
  saves, trip deletion, branding writes and licensed-module writes.
- Invalid designation returned **400**, with no saved designation change.

Screenshots: `pending-review.jpg`, `confirmed-unsaved.jpg`,
`edit-user-designation.jpg`, `reopened-saved.jpg`.
Exact acceptance/read-back evidence: `acceptance.json`, `backend-denials.json`.
The generic screenshot tool reached the unauthenticated splash and is not used
as proof of this signed-in behavior.

## Preservation and cleanup

Before/after whole-row digests match for all six existing users (including
password hashes and flags), 371 permission rows, 11 site-assignment rows, sites,
BOQ projects/items, arrangements, material trips, vendors and vendor bill tables.
The newly added business-role field is excluded from the old-row digest and
separately verified NULL on every existing account after cleanup.
Only digests—not passwords, hashes or cookies—are stored in evidence.

Disposable accounts, permissions, assignments, devices and sessions were removed.
No business-record fixture or notification event was needed. Browser session
and temporary profile were closed/removed. No existing account, including
K V Babu, was deliberately edited or reclassified.

Unrelated billing, trips, DPR, equipment and inventory source files were not
changed. The ordinary app restart emitted an existing stock-ledger backfill
duplicate-key error and other legacy startup jobs ran. Those routines were not
modified; the application continued serving and role acceptance passed. The
preservation digests above do not claim to cover every legacy startup table.

## Genuine Publish preview

The current read-only platform preview reports exactly:

```sql
ALTER TABLE "users" ADD COLUMN "business_role" text;
```

No removals, truncations, structural data-loss flags or warnings.
See `publish-preview.json`. No SQL was applied to production. Not published.

## Final verification results

- Full suite: **4,714 passed, 48 failed, 3 skipped**, across **345 files**.
- Compared every failed test identity and file inventory with USER-ROLE-01:
  **no new failures, no missing baseline files**.
- Focused role, reviewed-save, matrix-preservation and delegation coverage:
  **85 passed, 0 failed**, drawn from the final full run.
- Production application build: **passed** (`build-output.txt`).
- `git diff --check`: passed.
- Frontend TypeScript inspection reported the same 494 repository diagnostics,
  none in the four changed frontend files. This is not a clean-repository
  typecheck claim.

The first full run caught two compatibility failures from unnecessarily
disabling no-change saves. Restored that existing behavior, strengthened the
new no-inference test to verify an actual unchanged save, and reran the complete
suite and build. Final figures above are from that corrected run.

## Changed implementation files

- `shared/schema.ts`
- `migrations/0046_user_business_role.sql`
- `server/auth.ts`
- `server/auth-routes.ts`
- `client/src/pages/UserManagement.tsx`
- `client/src/components/user-role-review.tsx`
- `client/src/lib/auth-context.tsx`
- Frontend/backend focused tests, development acceptance script, this evidence
  directory and the existing permission-preservation memory note.
