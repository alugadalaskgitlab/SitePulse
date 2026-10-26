---
name: Hire-bill tax base
description: Calculation and preservation rules for saved equipment-hire bill tax and net values.
---

# Rule
For saved VB10 equipment-hire bills, calculate GST/TDS using each linked statement's saved gross-minus-breakdown tax base. Keep cash net based on the item subtotal, then apply GST, TDS, and signed bill-level adjustments; the item subtotal already reflects advances and statement deductions. Do not add those deductions back by using the tax base as the net starting amount.

A non-null stored net on an approved bill remains frozen and must not be retroactively recalculated. New values may be persisted when a bill enters approval; do not backfill approved bills. Keep export formats, layouts, and schema unchanged unless separately requested.

For monthly hire, dates classified as Activity Not Recorded are informational; the hire amount is based on calendar-date overlap. Keep the bill-detail note low-key and do not change shared report/export wording.

**Why:** Hire line items already contain advances and other statement deductions. Replacing the cash net subtotal with gross-minus-breakdown would add those amounts back. Approved net amounts are frozen financial evidence, and the user requires no retroactive changes.

**How to apply:** Use statement tax bases only for tax calculations; keep net cash arithmetic on the bill item subtotal. Preserve approved stored nets and verify calculations with saved statement snapshots. Treat missing monthly activity as informational.
