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

New Vendor Bill hire groups must start from an exact valid Equipment Master basis: monthly, daily, hourly, or trip. Missing or unsupported terms are never relabeled or defaulted.

**Why:** A two-way display label and daily fallback made incomplete and hourly equipment appear monthly before changing behavior when added.

**How to apply:** Show incomplete linked equipment as disabled, constrain eligible periods to configured hire dates, and reject new groups whose basis differs from Equipment Master.

Vendor Bill edit, lifecycle transition, and deletion paths must all lock the bill row first and linked hire-statement rows second, then re-read and validate state.

**Why:** A preflight check outside the transaction allows concurrent edit/verify/delete requests to overwrite a frozen snapshot or remove a newly approved liability.

**How to apply:** Keep one lock order across all linked-hire mutations; omission of hire groups must never bypass reconciliation for a bill that already has linked statements.

Raw activity-derived Vendor Bill auto-lines must not coexist with a hire group for the same equipment and covered date; manual lines remain independent even when their equipment/date matches.

**Why:** Auto-lines and grouped hire charges represent the same operational activity and would double-bill it, while a manual line may represent a legitimate repair or adjustment.

**How to apply:** Match narrowly on auto source, equipment identity, and inclusive group period on both client and server; never infer that an unflagged manual line is hire activity.

HSD recovery uses period-net excess: max(0, total actual minus total expected). Daily signed variance remains audit evidence, so under-consumption offsets over-consumption within the same Hire Group.

**Why:** Refuelling and tank measurement timing can shift apparent consumption between dates; summing positive daily variances overstates recovery.

**How to apply:** Resolve a same-day/latest-prior rate for every actual-HSD date, never a future rate. Weight resolved rates by actual litres; partial gaps do not invalidate priced dates. Freeze daily evidence, rate sources, decisions, and results.

Stored positive expected HSD remains authoritative; blank or zero expected HSD may be derived read-only through the canonical equipment-usage calculator. If the activity or norm basis is unavailable, do not suggest automatic excess recovery.

**Why:** Legacy usage rows can retain valid meter readings and actual HSD while derived runtime and expected HSD are blank. Treating missing expected HSD as zero incorrectly recovers the entire actual quantity.

**How to apply:** Derive runtime and expected HSD without updating source operational records. Track expected-HSD availability separately, show a review warning when unavailable, and disable automatic recovery acceptance for that evidence.

Daily Diesel Requirement is the only purchase source with both quantity and rate. Equipment activity lacks a dependable site FK, so pricing scope remains company-wide rather than inferred from free-text labels.

Monthly equipment activity is evidence only and must never become a standalone ordinary Vendor Bill auto-line.

**Why:** A single daily log cannot represent a monthly contractual liability; exposing one line per day invites invalid and duplicate monthly charges.

**How to apply:** Review every calendar day inside the hire group as Worked, No activity, or Vendor breakdown. No activity is informational and never an automatic deduction; daily and trip ordinary auto-lines remain eligible.