# PERMS-FIX-01

## What changed
- Added **Daily work log**, **Tests** and **Level sheets** under **Site work** in the existing feature permissions window.
- Daily work log has View, Add, Edit and **See everyone's day**. The last tick maps to `daily_work_log.view_reports`.
- Tests has View, Add, Edit, Cancel, **Verify / approve**, and Export. Verify / approve uses the existing single `lab_tests.approve` bit; Cancel maps to `delete`.
- Level sheets has View, Add, Edit, **Record department / consultant check**, and **Export / print**, mapped to the existing `level_sheets` permission bits.
- Connected the feature actions to the shared section checks and permission projection. View does not grant Add/Edit; checking does not grant saving.
- Preserved older explicit Tests grants. An explicit personal untick overrides them rather than allowing an old grant to return.
- Role defaults and existing stored permissions were not changed. New role ticks remain absent until explicitly granted. No manual database access, migration, data script, production access or publish.

## Files changed
- `shared/featureAccess.ts`
- `client/src/components/permissions/FeaturePermissionsDialog.tsx`
- Their tests: `tests/featureAccess.test.ts`, `tests/permission-map.test.ts` and `client/src/components/permissions/FeaturePermissionsDialog.test.tsx`.

## Checks
- Focused tests: **29 passed in 3 files**.
- Rendered the permissions window and checked its labels, unticked defaults, save payload and preservation of unrelated permissions/role assignments.
- Passed that payload through the shared permission projection and section guards: Daily Add and Team access remain separate; Level sheets View cannot save; its check tick controls approval; Tests Add is independently enforced.
- Linked-person rules and the operational screens were not changed. Tests used in-memory permission fixtures and mocked permission saves, not real user accounts.
- `npm run build`: **passed**.
- Development restart: **passed**; read-only startup readiness reported `ready: true`, with **2,558 columns checked**.
- Full suite ran **once**: **6,128 passed, 1 failed, 3 skipped** across **514 passed files, 1 failed file and 2 skipped files** (363.13 seconds).
- The only failure was the old catalog expectation in `tests/permission-map.test.ts`: 29 features instead of the deliberately requested 32. Updated that count and the expected action list to include the Daily work log Team action; added a check that only Daily work log exposes that action.
- Final affected-test run: **33 passed in 4 files, 0 failed**. No unresolved failures remain. Application code did not change after the full run; the full suite was not repeated after this test-only correction, as instructed.
- No screenshots or whole-project TypeScript check.
