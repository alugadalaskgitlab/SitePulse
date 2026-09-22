---
name: Purchase indent delivery progress
description: Delivery history must survive destination corrections and reconcile both receipt paths.
---

Reconcile delivery evidence across plant receipts and site trips rather than treating the current destination or last receipt pointer as the full delivery history.

**Why:** Partial bulk deliveries can span both destinations; switching destination must not erase earlier arrivals. Historical overwritten receipt pointers without preserved metadata cannot be safely reconstructed by guesswork.

**How to apply:** Preserve receipt linkage history, reconcile edits/cancellations/deletions within source transactions, and exclude incompatible units with visible warnings instead of assuming density. Use application-owned reconciliation, not custom database triggers that the managed schema publishing path may omit.

No blanket historical quantity backfill was authorized. Recoverable linked evidence can inform read-time progress; unrecoverable historical links need a separate decision.

**Why:** A fabricated historical total would be worse than an explicit gap.