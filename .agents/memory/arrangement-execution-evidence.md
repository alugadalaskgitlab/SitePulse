---
name: Arrangement execution evidence
description: Durable rules for per-bar DPR/trip evidence, historical corrections, and status-event quantity overrides.
---

Execution Arrangement evidence must be calculated from the current valid DPR progress and canonical Material Trip rows whenever it is requested. Never snapshot incomplete historical linkage or require a rebuild after users correct source records.

**Why:** Historical DPRs and trips are corrected gradually. A persisted classification would leave old BOQ/bar contributions behind or double-count corrected records.

**How to apply:** Prefer exact programme-bar and arrangement IDs, use conservative geometry only when defensible, and show an incomplete/review state rather than guessing. Count each canonical trip ID once; receipt representations without immutable trip linkage are not additional quantity.

`programme_bar_outcome_events.actualQuantity` is an exceptional PM/Admin quantity attached to one immutable status event. It requires a reason, remains visible beside derived DPR/trip evidence, and is not a commercial or Vendor Bill payable quantity.

**Why:** The status event records a management decision without rewriting physical source records or prematurely deciding future billing policy.

**How to apply:** Keep official status user-controlled and append-only. Derived quantities may provide hints but must never silently change status or become payable quantity.