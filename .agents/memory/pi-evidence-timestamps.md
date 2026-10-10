---
name: PI evidence timestamps
description: Historical PI timeline evidence, missing times, and local display constraints.
---

PI lifecycle history must use recorded events and their actual actors. An
unrecoverable historical time is **Time not recorded**, never updatedAt, the
current time, a presumed midnight, or the latest child's action time. Business
receipt/purchase dates and the time an action was recorded are separate facts.

**Why:** the user requires a trustworthy historical PI timeline without rewriting
historical dates to repair display.

**How to apply:** display instants explicitly in Asia/Kolkata regardless of browser
timezone. Respect existing offsets; determine the source convention before
parsing timezone-naive records. A purchase-order approval does not prove physical
ordering, and draft-GRN creation does not prove receipt/finalization.
