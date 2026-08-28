---
name: Hired Equipment Billing
description: Durable billing, exception, approval, and concurrency rules for hired equipment.
---

# Hired Equipment Billing

Use the existing Equipment Master and derive hire charges from existing equipment usage/DPR and maintenance records. Never introduce a duplicate attendance source.

**Why:** Usage and downtime already have operational records; a second entry path would create conflicting evidence and weaken the audit trail.

**How to apply:** Daily billing deduplicates equipment/date. Hourly and trip billing never infer missing values. Open usage stays unbilled and unreliable facts become explicit exceptions.

Monthly partial periods use the agreement's configured calendar-day, 30-day, or custom divisor. HLC idle/no-work days are not automatically deducted.

**Why:** These are commercial contract terms, not attendance assumptions.

**How to apply:** Constrain every statement to its hire dates and cap deductions at gross billing.

Breakdown downtime is informational until a reviewer selects full-day, half-day, no deduction, or a manual amount. If the agreement disables breakdown deductions, every decision type must produce zero deduction.

**Why:** Maintenance evidence does not by itself determine the commercial settlement, and a manual decision must not bypass the agreement.

**How to apply:** Manual exceptions must fall inside the active billed period. Statements with exceptions require review before approval; clean statements may go directly from draft to approved.

Approved statements snapshot both terms and calculations and must not be recomputed from later master edits.

**Why:** Historical vendor liabilities must remain reproducible.

**How to apply:** Serialize overlapping creation per equipment with a database advisory lock, reject overlaps, use client-supplied revisions plus row locks for mutable lifecycle actions, and create at most one linked Vendor Bill under a statement row lock.