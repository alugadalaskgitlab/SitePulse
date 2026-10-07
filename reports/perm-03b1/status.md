# PERM-03B-1 — completed

## Scope and files

This narrow batch changed no application code, permission grants, section keys,
labels, tooltips, route guards or user flags. Existing workspace changes from
earlier work were left as found; they are not changes made by this batch.

Changed/added in this batch:
- `tests/scopeConfirmedReachEditBatch03.test.tsx`
- `scripts/permission03b1-signin.mjs`
- `reports/dev-verification-account.md`
- `reports/perm-03b1/` — test results, comparison, sign-in proof, screenshot, this report
- `.agents/memory/development-browser-verification.md` — replace obsolete credential fallback guidance

## Three regressions

1. **Account notification synchronization: PASS.** The permission batch added
   a DeleteGate dependency, but this test's auth mock lacked `sectionCan`,
   causing rendering to fail rather than displaying push status. The existing
   fixture correction supplies that helper. Synchronization and no-permission-
   prompt assertions remain unchanged.
2. **PushNotificationSetup synchronization: PASS.** DeleteGate previously called
   the strict auth hook outside a provider. The existing missing-provider fix
   fails closed rather than crashing; the real provider-boundary regression
   passes, as does the widget suite. Ordinary required-auth use remains strict.
3. **Draft working-reach editing: PASS.** The new DeleteGate exposed the scope
   test's missing auth context; the page failed to render, not because Edit was
   intentionally revoked. Its existing fixture correction remains. This batch
   additionally proves that with Delete denied, Delete draft is absent while
   Edit draft opens the populated form, Save changes remains present and no
   revision note appears. No original assertion was weakened or removed.

All four targeted files: **19 passed, 0 failed**. No test expectation was
changed to accept a hidden Edit control.

## Full suite

| Run | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| Original pre-existing baseline | 328 | 4,575 | 4,524 | 48 | 3 |
| Previously reported PERM-03 regression | 329 | 4,604 | 4,550 | 51 | 3 |
| Last completed run before this batch | 330 | 4,606 | 4,555 | 48 | 3 |
| Fresh run after this batch | 330 | 4,607 | 4,556 | 48 | 3 |

**Exactly the same 48 baseline failure identities; zero new failures and zero
missing baseline test files.** The extra passing test is the Delete-denied
draft-editing regression. The suite still exits nonzero because of those
pre-existing failures. No claim is made that it is all-green or that existing
type errors are new.

Evidence: `focused-tests.json`, `full-tests.json`, `test-comparison.json`.
Unrelated PDFs rewritten by the full suite were restored to their original
bytes; no parked-module behavior was investigated.

## Development sign-in

The existing `DEV_VERIFICATION_PASSWORD` secret was present. Reused verification
account 16 after asserting `current_database() = sitelog_dev`, reset its password
from that secret, and approved only its own login-created device 101.

- Ordinary `POST /api/auth/login`: **200** after normal device approval.
- Protected `GET /api/auth/me`: **200**.
- Protected `/account`: **200**, actual account details visibly rendered in
  `signed-in-account.jpg`.
- Ordinary user: `isAdmin`, `isOwner`, `isFieldEngineer`,
  `canManagePermissions` are all **false**. No admin bypass.
- Permission-table checksum unchanged. No second account or permission grants
  created; no production connection variable read or used.

Exact repeatable steps are in `reports/dev-verification-account.md`.
No password, session cookie or token is stored in these reports.

Nothing remains blocked within this narrow instruction. Nothing published;
no other PERM-03B work or follow-up tasks started.
