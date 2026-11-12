# HOTFIX-01 — DPR correction history and stale app chunks

## Changes

- `DprCorrectionHistory` and its `CorrectionRequest` row now both receive `onWithdraw` from their props. The requester’s “Withdraw request” action therefore works instead of throwing a `ReferenceError` while correction history renders.
- Vite lazy-chunk preload failures now trigger an automatic page reload. A per-tab `sessionStorage` timestamp limits automatic reloads to once per minute. If another chunk failure happens inside that window, the app shows an update/reload recovery message instead of the generic “This screen couldn’t be loaded” fallback.
- Reviewed the SOIL-VALUE-01 changes for the same missing-prop/value pattern. The two `onWithdraw` destructuring omissions were the only such issue found.

## Verification

- Focused DPR edit/correction and app-recovery tests: **56 passed across 8 files**. Coverage includes mixed pending and Owner-corrected history, requester withdrawal, chunk-failure auto-reload and the one-minute guard.
- `npm run build`: passed. The build still prints the existing large-chunk and stale Browserslist-data warnings.
- A fresh TypeScript check reports **468 repository-wide diagnostics**, including type errors in several modules. No unresolved-name diagnostics were reported in the audited SOIL-VALUE files; the TypeScript check is not green.

## Scope

- No schema, database, or business data changes; no data scripts.
- Development code only. The app was not published.
