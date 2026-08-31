---
name: Diesel purchase receipt-pending control
description: Purchased ≠ Received for Daily Diesel purchases; linked Material Receipts, derived status, link validation rules
---

# Diesel purchase → Material Receipt linkage (06M-C)

**Rule:** a Daily Diesel Requirement purchase NEVER adds plant stock. Stock enters only through its explicitly linked physical receipt. Purchased/Received/Pending/Variance and receipt progress are ALWAYS derived, never stored. Purchase evidence remains purchase-owned and is reused in receipt context by reference, never copied.

**Why:** anti-pilferage — Purchased is the purchaser's claim, Received is an independent physical confirmation; storing receivedQty would go stale on receipt cancel/edit.

**How to apply:**
- Valid receipts = not cancelled AND not deleted. Over-receipt shows as explicit +variance, never clamped. Cancelled linked receipts are excluded from received totals and set `cancelledReceiptCount`.
- Create and correction paths must both enforce the active canonical DIESEL/HSD material and Liters ledger UOM. UI locks are only guidance; server enforcement is mandatory because receipt quantities are aggregated as litres.
- Deep links must carry material, remaining quantity, supplier, and UOM so the receipt opens with the same physical-stock assumptions used by the purchase.
- New and historical linked receipts must resolve the same qualifying purchase evidence without duplicating it. Multiple reference paths must still display and count one document once.
- Referenced evidence cannot expose a receipt-context delete action or be physically removed while another transaction depends on it.
- Approved edits to final-submitted receipts must remain active until the save succeeds; consuming approval when the form opens makes the correction flow race or fail.
- Stores visibility is read-only for diesel purchases; recording a physical receipt still requires receipt-create authority.

## PI bypass (06M-C-HF)
`shared/dieselReceiptSource.ts` is the single decision seam for diesel-sourced receipts (linkedDieselRequirementId != null): PI block/warning hidden, PI auto-select skipped entirely (even with a coincidental Diesel PI/indent), submit PI validation bypassed, regularise notice suppressed. Hard guards: payload forces indentRef null in diesel mode, PI close-loop PATCH gated on no diesel link, entering diesel mode (deep-link or edit) clears indentRef/selectedPendingPiItemId. **Why:** stale drafts, combined URL params, and edit-dialog restore could otherwise attach a PI to a diesel-sourced receipt (architect-caught).
