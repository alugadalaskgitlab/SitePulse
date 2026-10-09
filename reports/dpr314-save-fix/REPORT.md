# DPR 314 chainage-only correction

## Delivery boundary

Implemented, not published. No production writes were performed. The only
production operation in this batch was a read-only snapshot used to check that
the real SiteEdit mapping passes the new preservation guard.

## Application files

- `server/dpr314Correction.ts`: specific target/Administrator/confirmation guards,
  baseline comparison, unchanged-section comparison, row-preserving progress
  updates and atomic before/after audit.
- `server/routes.ts`: scoped endpoint with existing authentication, edit and site
  authorization, normal geometry, programme, quantity, outcome and overlap
  validation. Ordinary version route is unchanged.
- `client/src/pages/SiteEdit.tsx`: Administrator confirmation naming log 741 and
  missing usage 188, mandatory correction reason, isolated save path for DPR 314,
  and accurate success message.
- `tests/dpr314Correction.test.ts`: focused guard and transaction-write tests.

No schema changes, repair jobs, permission changes or financial mutations.

## Preservation

The correction updates progress rows in place and appends an audit entry with
the authenticated Administrator, database timestamp, correction reason,
progress before/after, log 741 and missing usage 188. DPR 314, equipment logs,
equipment usage, diesel, stock, movement, hire, bills and existing revision
history are neither replaced nor deleted. The historical missing usage link is
retained deliberately; it is not repaired or hidden by creating a usage.

Before writing, the transaction checks the missing usage/successor condition,
the paid bill 48 / line 438 / log 741 reference and original quantity/amount.
Header, equipment, labour, materials and purchase inputs must match stored
facts. Progress row identities and unrelated activity facts must match.
Stale progress baselines are rejected. No new photos or equipment attachments
are accepted through this UI operation.

## Verification

- `npx vitest run tests/dpr314Correction.test.ts tests/dprEqLink01.test.ts --maxWorkers=1`:
  **16 passed / 0 failed**, two files.
- Includes representative correction success; changed equipment, non-Admin,
  missing confirmation, stale baseline, wrong report and unrelated changes
  rejected; only progress and audit writes; validation failure before writes;
  existing normal version/finalizer paths retained.
- Transaction tests include a transaction double and an isolated PGlite
  PostgreSQL-compatible database: real SQL locks/guards/updates/inserts,
  retained log and paid-bill rows, zero new usage, an audit timestamp, and
  progress rollback when audit insertion fails. Its relational source read
  is fixture-supplied. These are not a live signed-in HTTP acceptance test.
- Actual SiteEdit mapping extracted from the current source was applied to a
  read-only production snapshot and passed the preservation guard with a
  synthetic correction reason across all six existing progress rows.
  This dry run performed no database writes and did not exercise live saving.
- One `npm run build`: **passed**, with the existing large-bundle warning.
  The final success-toast wording was adjusted afterward; no additional
  production build was run.
- Full TypeScript check is not clean: existing repository errors remain;
  no diagnostics were reported for the new helper or new integration lines.
- Development workflow restarted once and serves normally. Before/after
  row counts and content digests match for the ten checked preservation
  tables (DPR, progress, equipment logs/usage, ledger/balances, vendor
  bills/items, hire statements and audit).
- Signed-in correction UI was not browser-tested; the screenshot only reached
  the unauthenticated app shell. Production save was not attempted. Atomic
  failure was tested in PGlite rather than the live PostgreSQL database.

## Publish preview — not verified

The current available deployment/database guidance exposes no callable
read-only Publish-schema-preview operation. The prior batch's saved preview
was not reused as evidence for this batch. No current actual Publish preview
was obtained, so **destructive SQL clearance remains pending**.
There are no schema edits in this fix, but that does not prove a clean Publish
diff or isolate these changes from earlier unpublished workspace changes.
Do not approve destructive SQL or overwrite production data.

## Existing open form

The already-open tab runs the old save code and cannot show the new explicit
confirmation. It must load the new editor after approved publication.
SiteEdit already retains unsaved edits in sessionStorage under
`dpr_draft_314`, and attempts to restore them on reload. This specific live
tab's saved draft has not been inspected or verified. Keep the original tab
and a copy of the corrections until their restoration is confirmed; do not
assume a new independent tab shares its session draft.

Stopped for approval. No automatic publication or follow-up tasks.
