---
name: Material Receipt cancel/delete stock reversal
description: Reversal-on-cancel/delete rules for stock-affecting Material Receipts — idempotency, sufficiency block, cancelled = terminal
---

# Material Receipt reversal safety (06M-D)

**Rule:** cancelling or hard-deleting a stock-affecting Material Receipt reverses the exact converted stock it added — once and only once — inside one transaction. Cancel writes a compensating ledger row `material_receipt_cancel_reversal` (original stock-IN row preserved); hard delete of an ACTIVE receipt reverses balance then deletes its ledger rows (pre-existing convention); delete of a CANCELLED receipt never reverses again (deletes IN + reversal rows, which net to zero).

**Why:** cancel used to only flag the receipt, leaving phantom stock; delete used to reverse blindly (could go negative) and double-reversal was possible after cancel→delete.

**How to apply:**
- Idempotency is two-layer: receipt row FOR UPDATE lock + isCancelled check, plus a reversal-ledger-row existence check. Repeat cancel → `ReceiptAlreadyCancelledError` (code RECEIPT_ALREADY_CANCELLED → 409).
- Sufficiency: reversal uses the 06M-B `_adjustStockBalance` guard (sources `material_receipt_cancel` / `material_receipt_delete`). Consumed stock → whole tx aborts, receipt stays active, route returns 409 `RECEIPT_REVERSAL_STOCK_UNAVAILABLE` with the "contact PM/Admin for reconciliation" message. Never partial-reverse (stock is pooled, no lot tracking — current balance at (material, party) scope is the safety check).
- **Cancelled receipts are terminal**: PUT edit is blocked 409 server-side and Edit/Cancel buttons hidden client-side. Editing a cancelled receipt would re-apply stock via updateMaterialReceipt's reverse-old/apply-new sync and break the zero-net guarantee (architect-caught bug).
- Cancellation also deletes the linked `ldo_flow_readings` row (same as delete) so cancelled tank Diesel/LDO stops counting in the LDO tracker.
- Conversion parity: reversal recomputes the same conversionFactor/from/to quantity the create path posted.
- Cancel reversal rows use the original receipt's resolved invoice date (entry-date fallback for historical nulls), never the cancellation date.
- After a successful cancel or hard delete commits, resequence the affected material's ledger balances immediately so later rows do not retain stale running totals.
- Edit stock sync (reverse-old/apply-new, unguarded) is pre-existing and untouched.
- Tx bodies are separated (`_cancelMaterialReceiptWithinTx`, `_deleteMaterialReceiptWithinTx`) so stub-tx tests can drive them without a live DB.
