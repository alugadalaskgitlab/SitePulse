---
name: Diesel purchase receipt-pending control
description: Purchased ≠ Received for Daily Diesel purchases; linked Material Receipts, derived status, link validation rules
---

# Diesel purchase → Material Receipt linkage (06M-C)

**Rule:** a Daily Diesel Requirement purchase NEVER adds plant stock. Stock enters only via a Material Receipt carrying `material_receipts.linked_diesel_requirement_id` (single additive nullable column; startup ensure + index exist). Purchased/Received/Pending/Variance and Receipt Pending / Partly / Fully Received are ALWAYS derived via `shared/dieselReceiptStatus.ts` — never stored.

**Why:** anti-pilferage — Purchased is the purchaser's claim, Received is an independent physical confirmation; storing receivedQty would go stale on receipt cancel/edit.

**How to apply:**
- Valid receipts = not cancelled AND not deleted. Over-receipt shows as explicit +variance, never clamped. Cancelled linked receipts set `cancelledReceiptCount` → UI must show the "Plant Stock may not have been automatically reversed" note (cancelMaterialReceipt flags only; it does NOT reverse stock — pre-existing, deliberate).
- POST material-receipts validates the link: requirement must exist, be `purchased` with qtyPurchased, and the receipt material must be canonical DIESEL/HSD. The link is immutable on the normal PUT edit path (stripped server-side).
- Deep link into the receipt form: `/plant/material-receipts?autoOpen=1&dieselReqId=&materialId=&qty=&supplier=&uom=`. The `uom` param matters — programmatic materialId set bypasses the Select onChange that applies defaultUom, so litres would otherwise save as the reset default "Ton".
- Derived state endpoint: `GET /api/diesel-requirements/receipt-status?ids=` (must stay registered BEFORE `/:id`). No per-site filter — parity with the unfiltered diesel list route.
- Pushes reuse sendPushToSection: purchase → `plant_materials` (receipt authority); partial/full receipt → `site_diesel` (added to PUSH_ACTIVE_SECTIONS; the push-sections-sync test enforces that set).
- Client Record Receipt gating must match the server gate (`plant_materials` create), not `plant_stock`.
- No historical auto-linking — old purchases just show Receipt Pending with zero linked records.

## PI bypass (06M-C-HF)
`shared/dieselReceiptSource.ts` is the single decision seam for diesel-sourced receipts (linkedDieselRequirementId != null): PI block/warning hidden, PI auto-select skipped entirely (even with a coincidental Diesel PI/indent), submit PI validation bypassed, regularise notice suppressed. Hard guards: payload forces indentRef null in diesel mode, PI close-loop PATCH gated on no diesel link, entering diesel mode (deep-link or edit) clears indentRef/selectedPendingPiItemId. **Why:** stale drafts, combined URL params, and edit-dialog restore could otherwise attach a PI to a diesel-sourced receipt (architect-caught).
