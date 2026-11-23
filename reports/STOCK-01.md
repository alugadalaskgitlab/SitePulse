# STOCK-01 — Stock reconciliation and Plant Stock page

## Part 1 — Dust balance mismatch

The mismatch was caused by posting from a stale `stock_balances` snapshot instead of the ledger balance shown on the screen. The supplied live figures show the difference:

- Screen / ledger before posting: **−58.178 MT**.
- Stale stored row read during posting: **−72.818 MT**.
- Expected adjustment for a 20 MT count: **+78.178 MT**.
- Adjustment actually posted from the stale row: **+92.818 MT**.
- The ledger then totals **34.640 MT**; a later rebuild restored that value to the stored summary. The ledger row's `balanceAfter = 20` was only a snapshot and did not make the ledger total 20.

Posting now calculates the current balance from the ledger using the same stock-unit conversion as the balances screen. It checks that this still matches the balance shown in the preview while holding the balance lock. If it changed, posting is refused with a “reopen the reconciliation preview” message. It then uses that same figure for the adjustment and stored balance. Duplicate stored balance rows block posting instead of selecting one ambiguously.

### Read-only development check

On `sitelog_dev`, the read-only stored-vs-ledger check returned:

| Party | Material | Unit | Stored balance | Ledger balance | Stored − ledger |
|---|---|---:|---:|---:|---:|
| HIGH LANE CONSTRUCTIONS (1) | DUST | MT | −58.177510 | −58.177513 | +0.000003 |

No other material/party rows were listed. This rounding-sized difference is not the large live mismatch above. No stock, ledger or reconciliation records were changed.

### Proposal for the Owner — not applied

For **DUST / HIGH LANE CONSTRUCTIONS (party 1)**, physical count **20.000 MT** dated **31 October 2026**:

`ledger balance −58.178 MT → physical balance 20.000 MT; adjustment +78.178 MT`

This is based on the balance in the supplied incident description. Reopen the preview against the current live ledger before posting; nothing was applied by this batch.

## Part 2 — Bitumen and emulsion packed receipts

Skipped. The requested packed-unit and decant fields require schema changes, but no Part A schema proposal was listed first. No migration, schema change or receipt feature was added.

## Part 3 — Plant Stock page

- Replaced the separate export buttons with one **Export** menu containing Excel, PDF and Print.
- Moved Reconcile Data, Fix Phantom Balances, Reassign Ledger and Rebuild Ledger into a closed **Advanced (Owner only)** section. Each asks for a typed confirmation and describes the action's effect; the corresponding maintenance routes now enforce Owner access.
- Added an Owner-only, read-only stored-balance-versus-ledger comparison. It lists each difference in the material's stock unit and does not repair anything.
- The negative-stock banner and current balance views remain ledger-based. The summary now accounts for each ledger row's exact in/out quantities, including negative adjustments; when the summary period ends today, a warning identifies any closing/current difference.
- Added a visible filter summary, a Reset action and the “As of today, all dates” note on Current Balances.

No new menu item, schema change or migration was added.

## Verification

- Focused stock tests: **68 passed** across 4 files.
- Full suite: **5,947 passed, 3 skipped, 0 failed** (494 test files; 2 skipped).
- `npm run build`: passed.
- Development startup readiness: passed (`ready: true`, 2,288 columns checked).
- `npm run check` still exits with TypeScript diagnostics across the project (471 diagnostics); the production build and test suite pass.
- No production database or replica was queried. No stock reconciliation, ledger repair, rebuild or data change was run. No publish was performed.
