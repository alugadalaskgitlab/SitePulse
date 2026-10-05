---
name: Vendor bill log evidence
description: Conservative source matching for display-only equipment facts on older saved bills.
---

Equipment log evidence must not alter bill quantities, rates, totals, candidate selection or rate-card write-back.

**Why:** The user requested display/export evidence only and explicitly required the standing-rate write-back to be reported, not changed.

**How to apply:** Reuse Site Report consumption semantics and omit unknown responsibility, readings and consumption rather than guessing them.

Legacy saved bills without persisted log identity may show current source evidence only when saved equipment, date, description and site identify one exact current candidate. Missing, changed or ambiguous matches must remain unavailable.

**Why:** Older bills omit operational source IDs, and matching equipment/date alone can attach another activity's readings to a financial record. Adding historical facts by inference would be worse than missing evidence.

**How to apply:** Prefer source-qualified identity; check actual source-site access even after the bill itself passes authorization. Never backfill a guessed link or present current matched evidence as a frozen historical snapshot.