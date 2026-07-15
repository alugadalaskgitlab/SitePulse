---
name: Stock Ledger Locking
description: _adjustStockBalance helper pattern, numeric column migration, drizzle push workaround for interactive prompts.
---

## The rule
All stock balance read-then-write operations in `server/storage.ts` must go through `_adjustStockBalance(tx, materialId, partyId, delta, uom)`. This private helper uses `SELECT … FOR UPDATE` to lock the row before reading, preventing lost-update races under concurrent transactions.

**Why:** The old pattern (`select → compute newBalance → update`) allowed two concurrent transactions to both read the same stale balance, then both write their delta on top of it — causing one delta to be silently lost. This was identified as the root cause of stock balance drift.

**How to apply:**
- Any new function that touches `stockBalances` inside a `db.transaction()` must call `this._adjustStockBalance(tx, ...)` instead of writing its own SELECT + UPDATE/INSERT block.
- The helper returns `{ id, newBalance }`. Use `newBalance` for the `balanceAfter` column in the `stockLedger` insert that follows.
- Pass `null` for `uom` on reverse/restore operations (the helper will use the existing row's UOM or skip if no row exists).
- `deductFromSource` inside `createTruckDispatch` is a special case: it has UOM-mismatch logic, so only the initial SELECT was replaced with a FOR UPDATE raw query (`tx.execute(sql\`SELECT … FOR UPDATE\``)) rather than delegating to the helper.

## Numeric columns
`stock_balances.balance`, `stock_ledger.quantity_in / quantity_out / balance_after` are all `numeric(20,6)` in both the Drizzle schema and the live DB. Drizzle returns these as `string` when using `drizzle-orm/node-postgres` — always wrap with `Number(...)` or `parseFloat(...)` before arithmetic.

## drizzle-kit push workaround
`drizzle-kit push --force` does NOT bypass the "truncate table?" interactive prompt for unique-constraint additions. When push blocks, apply schema changes directly with `node -e` + the `pg` Pool and raw `ALTER TABLE … TYPE … USING …::numeric(20,6)` statements. This is safe and idempotent.

## RMC batch deduction
`_deductRmcMaterials(tx, batch, reverse)` matches `componentProportions` keys (cement/fineAgg/coarseAgg10/coarseAgg20) to `plantMaterials` by fuzzy name, computes Ton = kgPerM3 × totalVolumeM3 / 1000, and deducts via `_adjustStockBalance`. Transaction type `"rmc_batch"` is used in `stockLedger`. Material matches are best-effort (silently skipped if no plantMaterial name matches).

## Reconciliation check
After all migrations: `SELECT material_id, party_id, SUM(qty_in - qty_out) FROM stock_ledger GROUP BY …` vs `stock_balances.balance` — 0 discrepancies across 15 rows confirmed correct after the refactor.
