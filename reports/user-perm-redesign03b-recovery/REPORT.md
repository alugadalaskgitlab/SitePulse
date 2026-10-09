# INSTRUCTION 03B-RECOVERY-01 — completion evidence

## Scope and outcome

Development recovery implemented and verified. No publication, production
modification, heliumdb write, historical stock repair or attachment backfill
was performed. Ordinary operational posting, authentication, permission routes,
Site Requirements and other module permissions were not changed.

## Exact development schema operation

`schema-operation.json` contains the exact executed transactional SQL and
verified columns, indexes and foreign keys. It creates only
`public.attachment_links`, its serial primary-key sequence, primary-key index,
`attachment_links_attachment_target_unique` and
`attachment_links_target_lookup_idx`.

The operation verified `current_database() = 'sitelog_dev'`, absence of the
table, and integer parent primary keys on attachments/users before executing
the exact SQL from the FIX report, with a five-second local lock timeout.
The formerly failing attachment join passed. Existing-table digests matched
across DDL (`schema-before.json`, `schema-after.json`). The script fails closed
if rerun now that the table exists; it is not a general migration runner.

## Startup changes

Only `runBackgroundMigrations` in `server/index.ts` and `seedDatabase` in
`server/routes.ts` changed application behavior. Removed 33 automatic
historical repair/sequence-reset method calls and inline orphan-adjustment
ledger cleanup. `isolated.json` lists every retired method, including the
obsolete `fixLdoStockDeductionErrors`, the LDO reconciliation chain,
dispatch ledger rewrites, `resetAllSequences`, indirect DPR purchase/diesel
repairs, orphan-stock migration and balance corrections.

Storage repair implementations and operational endpoints remain unchanged.
`stock-repair-plan.mjs` is an offline inventory with no database connection
and no apply mode; `--apply` is rejected. Any repair execution requires a
separately reviewed plan and approval. No broad environment bypass was added.

Startup is **not entirely read-only**: existing non-stock initialization and
schema ensures remain. This change separates historical stock repairs, not
all legacy initialization.

## Verification and preservation

1. Isolated VM mocks/spies passed before the sole controlled restart.
   They exercise both startup paths, inspect transitive storage calls for
   ledger/balance writes and sequence resets, reject repair apply mode, and
   compare operational/permission routes to the prior implementation.
   Evidence: `isolated.json`.
2. One development restart only; immediate and settled snapshots retained.
   All 141 table counts/content digests compared. Only `user_devices` and
   `user_sessions` differed; no unexpected business changes.
   `app_settings_id_seq` advanced through existing initialization, rather
   than being reset. Do not interpret unchanged table content as proof that
   no SQL writes were attempted. Evidence: `restart-*.json`.
3. Build passed (`npm run build`). Four targeted regression files passed:
   dieselComparisonRoute, dieselPaymentStatus06mF, dieselReceiptPending06mC
   and permissionDelegation: **107/107 tests**. This was not a full-suite run.
4. Owner approved disposable administrator device 220 through normal
   development approval. Ordinary login succeeded. The disposable admin
   approved the disposable subject through the existing API; no sessions
   were fabricated and no authentication bypass was used.
5. **51/51 authenticated requests passed**, covering granular and legacy
   Diesel/Maintenance reads, own-site inclusion, other-site denials, denied
   mutations, all-off denials, administrator access and supporting reads.
   The previously failing Diesel attachment read returned 200; foreign-site
   attachment access remained denied. No historical attachment content was
   created or altered. Evidence: `after-api.json`.
6. Actual signed-in Chromium checks passed. Real pointer events selected
   Health and an assertion verified its active tab state. The screenshot
   visibly shows Health, the permitted machine's summary and no foreign
   machine. Diesel detail approval inputs were disabled. No HTTP failures
   were observed during this signed-in browser run.
   Evidence: `browser-results.json` and `screenshots/maintenance-health.png`,
   `maintenance-granular.png`, `diesel-granular.png`, `diesel-detail.png`.
7. Disposable sites, machines, reports, users, grants, devices and sessions
   were deleted; no disposable user-related rows remain. Private session
   files and browser profile were removed. Post-cleanup comparison again
   differs only in session/device tables; existing users, permissions,
   site assignments, stock ledger and balances match the baseline.
   Evidence: `cleanup.json`, `preservation-before.json`,
   `preservation-after.json`, `disposable-manifest.json`.
8. Genuine read-only Publish schema preview returned success, `hasDiff:false`,
   no statements and no destructive changes. Evidence: `publish-preview.json`.
   This does not apply the custom development DDL to another database.

## Remaining exceptions

- Existing equipment-master reachability without its dedicated View remains
  unchanged and is explicitly labelled inherited in the API evidence.
- Non-stock startup initializers remain; no claim of globally read-only
  startup or globally unchanged sequences is made.
- Git push to origin/main failed: GitHub rejected the configured authentication
  (“Invalid username or token”). Implementation is committed in `7fca52e6`;
  acceptance evidence is committed separately. No remote update succeeded.
  Nothing was published.

No follow-up tasks were created.
