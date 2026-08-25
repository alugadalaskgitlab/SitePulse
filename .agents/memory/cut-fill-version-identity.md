---
name: Cut/fill version identity
description: Non-obvious source-resolution and validation rules for DPR-driven reusable excavation reconciliation.
---

Stable progress-entry keys intentionally repeat when a DPR is versioned. For cut/fill source resolution, rows inserted in the current transaction are authoritative over older rows with the same key; prior-source lookup must consider only active submitted DPRs.

**Why:** Resolving a same-DPR source by key across every historical row can attach the new fill consumption to the soon-to-be-superseded excavation row, making valid physical capacity disappear from the active ledger.

**How to apply:** Whenever a DPR ledger links rows by stable key, separate local/current keys from prior lookups and overwrite any historical map entry with the current transaction row. Keep drafts tuple-lenient, but validate complete material outcomes and explicit quantities on final submission.