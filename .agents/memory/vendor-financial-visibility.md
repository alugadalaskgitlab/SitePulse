---
name: Vendor financial visibility
description: Explicit financial-report access exception and recorded-only TDS display boundaries.
---

Owner always has Vendor Financials access; every other user, including Administrators, needs an explicit per-user grant. Do not hardcode named administrators or grant the permission through default administrator setup.

**Why:** The user explicitly requested Owner-only default access while preserving all ordinary bill-viewing, entry and approval permissions.

**How to apply:** Keep aggregate summaries, vendor statements, Taxes Register and reporting/export APIs behind the explicit grant. Honour selected financial site scope even for Administrators. Use the existing user permission matrix and save flow, not a parallel system or production backfill.

Taxes reporting must use recorded deduction amounts, not infer TDS deductions from a saved percentage.

**Why:** The user said not to invent deductions or correct historical financial data.

**How to apply:** Keep available GST reporting, label absent TDS amounts as unavailable, and distinguish frozen hire-statement evidence from a complete whole-bill deduction. The compact overview uses saved bills only; the separate visible Payables Preview was intentionally removed.
