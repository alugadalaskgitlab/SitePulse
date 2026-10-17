---
name: Vendor bill read-only review
description: Financial overview and informational vendor statement boundaries; saved calendars must remain historical.
---

The user authorizes a read-only vendor-wise statement, not automatic running-account settlement.

**Why:** This explicitly expands the earlier per-bill-only display scope while keeping all financial records and payment behavior unchanged.

**How to apply:** Match parties through confirmed Vendor Master identity, never similar names. Restrict history to permitted sites. In compact Bill Detail, show missing financial evidence as a neutral dash, not fabricated zero or repeated warning badges. Distinguish recorded transactions, provisional bills and calculated movement. Never consume advances or offset credits automatically.

Saved bill calendar review must use historical evidence, including for approved and paid bills; incomplete legacy snapshots are not permission to substitute current operational records.

**Why:** The user requires historical review without changing snapshots, bills, operational data or independent export formats.

**How to apply:** Show available saved information and explicit gaps, retain separate Bill and Calendar exports, and do not backfill or add schema without approval. Financial overviews follow the visible list filters; positive payable amounts and credits remain separate.

For saved statements, preserve the category and reason actually stored. A manually entered `otherDebit` from before VB-HIRE-07 remains an Other debit even if its reason mentions driver unavailability; never convert it into an operational exception or infer dates/decisions absent from the snapshot.

**Why:** The user explicitly confirmed that historical bills must show only the evidence saved at the time and preserve their figures.

**How to apply:** Render the saved amount under its persisted adjustment kind, display its recorded reason, and label missing date/decision evidence as not recorded.

The approved bill presentation uses one expandable calendar and billing row per calendar month, per equipment, with existing SitePulse navigation and styling. Mockup amounts are illustrative only. Use “Idle Days (Work Not Available)” and “Breakdown / Opr. Unavailable Days”.

**Why:** The user explicitly approved the compact single-month and multi-month references and prohibited further redesign or changes to commercial calculations.

**How to apply:** Keep Worked Days distinct from commercially payable Days Billed; absent operational evidence is unknown, never inferred idle. Preserve frozen totals when a legacy monthly split cannot be established, and disclose missing allocation rather than silently apportioning it.

The user bills month by month. Multi-month hire billing is an occasional exception that has not yet occurred in Production; its absence must not prevent verification.

**Why:** The user explicitly requires synthetic multi-month checks without creating, altering, or publishing Production bills to manufacture an example.

**How to apply:** Persist synthetic spanning hire bills only in a disposable development/test database, verify monthly rows and Activity Calendars against stored totals, and check real single-month bills read-only.

Unknown cumulative payments are never zero. If a bill has no recorded paid amount, the export must show paid and balance as “Unknown”; aggregate paid and balance show only a known subtotal beside the count of bills with unknown payment evidence.

**Why:** The user explicitly confirmed unknown paid amounts must never be treated as zero in the export or its verification.

**How to apply:** Keep unknown bill-level values explicit, report known-only subtotals and unknown counts, and do not infer a payment or balance from the bill’s net amount.

For payables reconciliation, use the existing shared bill-review helpers. A frozen hire statement’s presentation gross may differ from the saved bill total used as payables-basis gross; expose both rather than replacing either or recalculating the snapshot.

**Why:** The saved bill total and frozen hire gross can intentionally differ after deductions, and raw database aggregation can produce a different currency display from the shared calculation path.

**How to apply:** Compare export totals with the payables page through the shared helpers, label presentation and payables-basis gross separately, and preserve frozen snapshots unchanged.
