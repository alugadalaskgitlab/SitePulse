---
name: Physical Stock Reconciliation
description: Rules and traps behind the batch stock reconciliation feature (plant stock adjustments)
---

# Physical Stock Reconciliation (built Aug 2026)

**Rule:** `toFiniteNumber` (calc-safe, null for invalid — never 0) and `formatQty` (display-safe, "—" for invalid) in shared/stockReconciliation.ts are the only sanctioned way to consume stock NUMERIC values; never call .toFixed directly on an API/DB-sourced field, and never register a global pg type parser to "fix" this.
**Why:** pg returns NUMERIC columns as strings ("0.000000"); direct .toFixed crashed the PSR page, and `Number(x) || 0` on the server silently posted adjustments against a zero balance. Zero-vs-missing must stay distinguishable.
**How to apply:** normalise at point of consumption; malformed values must block calculations (BALANCE_INVALID on server, `balanceInvalid` blocked row on client) or render "—" — totals null-propagate rather than summing around bad rows. Draft posting persists ONLY ready rows before POST, because the server reconstructs the entire saved draft and one bad row rolls back the whole batch.

- Server is the source of truth: `postStockReconciliation` recomputes conversion + adjustment against a row-locked balance; client figures (shared/stockReconciliation.ts) are preview-only. Keep both sides on the shared module.
- Conversion uses ONLY the material's configured factor (plant_materials conversion_factor/from/to, either direction). Missing conversion → 422 CONVERSION_NOT_CONFIGURED, never invented.
- Idempotency: unique index on sessions.client_request_id; duplicate confirm returns the existing session (alreadyPosted). Route is POST /api/plant-module/stock-reconciliation.
- **Why lock order matters:** items are sorted by (materialId, partyId) before FOR UPDATE to prevent deadlocks between concurrent sessions; balance locks use `ORDER BY id LIMIT 1` because stock_balances has NO unique constraint on (material_id, party_id) — see follow-up task about enforcing one.
- Legacy POST /stock-correction is now ledger-backed too (writes an 'adjustment' stock_ledger row), so rebuild-from-ledger preserves corrections.
- Permission: new section key `stock_reconciliation`; posting = admin/owner or its create action; page + report GET intentionally also open to plant_stock viewers (draft-only).
- Draft/approval workflow (Aug 2026): sessions carry status draft→submitted→posted|rejected; the SAVED draft rows are the authoritative posting payload when draftId is supplied (caller items ignored) — client must re-save before posting edits. Status transitions use conditional UPDATE ... WHERE status IN ('draft','submitted') so a posted session can never be overwritten. Draft edits enforce preparer ownership unless approver.
- Variance warnings + acknowledgment: server recomputes computeVarianceWarnings after locking balances and throws WARNINGS_NOT_ACKNOWLEDGED unless acknowledgeWarnings=true; ratio rules skip zero/negative balances. Rounding tolerance is UOM-aware via toleranceForUom (countable units ≈ zero tolerance).
- Tables created idempotently at startup (`ensureStockReconciliationTables`) so prod gets them on publish without manual migration.
- **API login tip:** /api/auth/login expects `identifier` (not `email`); fresh device returns 202 device_pending — approve via dev-DB user_devices UPDATE.
