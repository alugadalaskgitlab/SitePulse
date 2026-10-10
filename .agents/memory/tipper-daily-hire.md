---
name: Tipper daily hire from trips
description: Confirmed transport identity, original-trip preservation, and daily-hire financial safeguards.
---

Material ownership and transport ownership are independent. Own Source material
can arrive in an agency-hired tipper. Historical trip registration matches are
only suggestions, never permission to charge.

**Why:** The user requires billing from existing material trips without duplicate
DPR/equipment logs, fabricated hours/meters/diesel, or rewritten receipt history.

**How to apply:** Require an authorised, reasoned identity confirmation; conflicting
or missing identities need explicit acknowledgement. Keep the original vehicle,
supplier and material facts untouched. Confirmation is append-only audit evidence
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
