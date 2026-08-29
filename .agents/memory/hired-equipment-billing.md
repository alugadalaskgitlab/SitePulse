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

Integrated Vendor Bills may contain adjacent non-overlapping Month, Day, and Trip groups, each with its own frozen basis and rate. Equipment Master values are defaults only.

**Why:** One commercial bill may span a contract-basis change, and later master edits must not rewrite historical liability.

**How to apply:** Recalculate only draft groups from server-loaded operational facts. Before verification, require explicit treatment for every generated exception and any positive HSD-recovery suggestion.

Vendor Bill edit, lifecycle transition, and deletion paths must all lock the bill row first and linked hire-statement rows second, then re-read and validate state.

**Why:** A preflight check outside the transaction allows concurrent edit/verify/delete requests to overwrite a frozen snapshot or remove a newly approved liability.

**How to apply:** Keep one lock order across all linked-hire mutations; omission of hire groups must never bypass reconciliation for a bill that already has linked statements.

Raw activity-derived Vendor Bill auto-lines must not coexist with a hire group for the same equipment and covered date; manual lines remain independent even when their equipment/date matches.

**Why:** Auto-lines and grouped hire charges represent the same operational activity and would double-bill it, while a manual line may represent a legitimate repair or adjustment.

**How to apply:** Match narrowly on auto source, equipment identity, and inclusive group period on both client and server; never infer that an unflagged manual line is hire activity.