---
name: Tipper daily hire from trips
description: Confirmed transport identity, original-trip preservation, and daily-hire financial safeguards.
---

Material ownership and transport ownership are independent. Own Source material
can arrive in an agency-hired tipper. Historical trip registration matches are
only suggestions, never permission to charge.

**Why:** The user requires billing from existing material trips without duplicate
DPR/equipment logs, fabricated hours/meters/diesel, or rewritten receipt history.

**How to apply:** Routine valid Master selections are confirmed atomically by the
ordinary trip Save, with an internal audit reason, not another mandatory review.
Conflicting or missing identities still use the authorised exceptional review.
**Why:** The user requires Search → Select → Save and no repeated confirmations;
normal selections must persist Master IDs rather than guessed name matches.
Preserve original vehicle, supplier and material facts in audit history when an
authorised ordinary edit corrects an unprotected trip. Never silently rewrite
billed or protected identity evidence. Confirmation is append-only audit evidence
with a source-identity fingerprint, not an in-house fleet association. Changes to
trip or master identity invalidate it for new bills. Audit retention must preserve
these confirmations because they are domain evidence, not disposable diagnostics.

Daily charges deduplicate equipment/business date across confirmed trips and
existing operational records. Trip counts are supporting evidence only. Use Master
terms, reasoned full/half/excluded-day review, existing bill approval and immutable
snapshots. Retain existing hire-period overlap guards and prevent ordinary equipment
lines from rebilling a saved daily-hire period.

**Why:** Reusing two evidence sources must not create two liabilities for one day.

**How to apply:** Reload confirmed source evidence under the same equipment lock
used by billing; check previously billed dates in both directions. Preserve monthly,
hourly and trip-rate calculations. No historical bills, stock, diesel or paid
accounting corrections are authorised by this feature.

Database helpers invoked inside a transaction must use its executor, including
read-only alias resolution.

**Why:** Real bill-save tests exposed a nested global-pool read stalling under a
single-connection PostgreSQL test runtime; independent reads also weaken consistency.

Reviewed bill-linked daily hire uses charged vehicle/dates, not a blanket period
reservation. An excluded date can be billed later, even within the same period.
Unknown legacy snapshot coverage stays conservatively blocked. Non-daily period
constraints remain unchanged.

**Why:** The user requires reasoned exclusions of existing billed days while
billing remaining dates; the old equipment/period uniqueness blocked this.

**How to apply:** Keep the partial period-unique index aligned in both development
database targets before publishing; no startup DDL or financial backfills.
Duplicate detection must read immutable payable-day snapshots under the equipment
lock, ignoring generated statement line dates as extra charges.

One-time free-text owners remain billable through an explicitly confirmed Hire
Billing Link without permanent Vendor Master registration. Reviewed associations
and conflicts still take precedence.

**Why:** The user explicitly requires the existing one-time vendor workflow.

Normal trip entry suggestions must come exclusively from active Vendor and
Equipment Masters, never historical or locally remembered names. The material
seller and transporter are independent; an explicit Other / Not in Master option
retains one-time free text without creating a master or implying a hire confirmation.

**Why:** The user explicitly requires Master-based search and selection, including
Own Source material transported by a separately hired party.

**How to apply:** Save selected IDs in the ordinary form transaction. Suggest the
confirmed hired-equipment owner only when the transporter is blank; do not overwrite
a deliberate transporter choice. Keep billing basis/rates in Vendor Bills only.
