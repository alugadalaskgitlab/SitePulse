---
name: Vendor financial visibility
description: Explicit financial-report access exception and recorded-only TDS display boundaries.
---

Owner always has Vendor Financials access; every other user, including Administrators, needs an explicit per-user grant. Do not hardcode named administrators or grant the permission through default administrator setup.

**Why:** The user explicitly requested Owner-only default access while preserving all ordinary bill-viewing, entry and approval permissions.

The Previous Billing Summary on an individual bill is available to anyone who may view that bill. It is needed to finalise that bill's debits and credits; this does not widen access to aggregate summaries, the payables page, the Vendor Bills list financial summary, Taxes Register, or reporting/export APIs.

**Why:** The owner revised the earlier decision because whoever finalises a bill needs to see prior deductions and credits to avoid deducting an advance or recovery twice.

**How to apply:** Keep this exception limited to the single-bill Previous Billing Summary and its narrow previous-bill data path. Keep aggregate summaries, all-vendor statements, the payables page, the Vendor Bills list financial summary, Taxes Register and reporting/export APIs behind the explicit grant. Honour selected financial site scope even for Administrators. Use the existing user permission matrix and save flow, not a parallel system or production backfill.

Bulk bill linking in Vendor Master must use the existing financially guarded review endpoint for bill totals. If an Administrator lacks the existing financial grant, keep bulk bill linking unavailable to that user; do not bypass the guard, omit totals, add a permission key, or treat Administrator status as financial authorization. Bulk linking for trips, rate cards, and indents remains available.

**Why:** On 2026-10-11, the owner made View Vendor Financials an explicit grant that the Administrator shortcut deliberately does not satisfy; exposing bill totals without it would leak protected aggregate financial information.

**How to apply:** Require authorized bill totals before enabling the bulk bill action. Do not change the endpoint or permission matrix to make the action available; keep non-financial role workflows independent.

Taxes reporting must use recorded deduction amounts, not infer TDS deductions from a saved percentage.

**Why:** The user said not to invent deductions or correct historical financial data.

**How to apply:** Keep available GST reporting, label absent TDS amounts as unavailable, and distinguish frozen hire-statement evidence from a complete whole-bill deduction. The compact overview uses saved bills only; the separate visible Payables Preview was intentionally removed.

Unpaid is a payment-evidence scope, not a workflow-status filter. Keep missing-evidence bills Unconfirmed, include Paid bills when recorded payments leave a positive balance, and never offset credits against other bills.

**Why:** The user explicitly requires one identical selected bill set for the list, financial totals, category taxes and all three Excel sheets.

**How to apply:** Apply the existing filters within Unpaid/All; default to Unpaid. Preserve recorded partial TDS evidence as an incomplete subtotal. Do not invent category allocations for whole-bill TDS or treat hire-only snapshots as evidence for unrelated lines.
