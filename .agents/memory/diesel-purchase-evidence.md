---
name: Diesel Purchase Evidence (06M)
description: Diesel purchase bill/QR attachments + PI-style payment fields; diesel stock chain findings
---

- Diesel purchase uses dedicated `diesel_requirements` table with a real distinct `purchased` status (storage forces it in updateDieselPurchase) — NOT the generic site_requirements queue.
- Attachments: moduleType `diesel_purchase`, docType `bill` vs `payment_evidence`; AttachmentGallery now has an optional `docType` client-side filter prop.
- PI has NO "Payment Status" field — only `paymentMode` (cash/credit/advance/upi/cheque/rtgs) and `paidBy` ("company" or payer name/"PERSONAL"). Any future "payment status" ask needs a new model, not PI reuse.
- storage.updateDieselPurchase uppercases supplier/billNo/purchaseRemarks only — `paidBy: "company"` must stay lowercase (summary UI matches on it).
- **Stock chain (investigated, NOT fixed):** marking diesel purchased writes only diesel_requirements — no stock/ledger increase. Consumption paths (DPR equipment log ≥2026-02-01, Equipment & Fleet usage) deduct HLC `stock_balances` only for dieselSource=plant_stock; direct_purchase writes in+out ledger rows with no balance change; contractor = nothing. So purchased→stock→consumption is NOT a closed loop today.
- `/api/attachments` GET/POST/DELETE require only login, no per-module/site authz — pre-existing for all moduleTypes (vendor_bill, pi_purchaser_action too). Known gap, flagged Aug 2026.
- **06M-F (Aug 2026):** Payment Evidence UI removed for good (historical `payment_evidence` rows untouched — never surface, never delete). Diesel now HAS an explicit `paymentStatus` (pending/paid) + paidAt + paymentRecordedBy on diesel_requirements — NEVER inferred from paymentMode/paidBy; only the dedicated `/payment-status` route flips it. Pending→paid write is atomic (`WHERE payment_status IS DISTINCT FROM 'paid'`) so paidAt/recordedBy are set exactly once; post-paid mode/paidBy corrections never reset them (mirrors vendor-bill /payment-details). vendor_bills gained paymentRecordedBy, set in updateVendorBillStatus paid branch. `currentUserName(req)` reads `authUser.fullName` (mocks must set fullName, not just username).

**Why:** avoids re-investigating the diesel stock chain and prevents inventing a payment-status field that PI never had.
**How to apply:** any diesel-stock linkage batch starts from the broken chain above; any attachment-security batch must cover ALL moduleTypes, not just diesel.
