---
name: Large database copy via CodeExecution
description: Reliable pagination, payload sizing, and callback lifetime for large read-only database copies.
---

For large read-only database transfers, keyset pagination must compare and order by qualified source-table primary-key columns, not projected text aliases. Casting values for explicit-column insertion is safe; using those projected text aliases as cursors can sort numeric identifiers lexicographically and skip rows.

Persist cursors and per-table progress outside the CodeExecution runtime, because large callback results can exceed its memory limit and reset the notebook. Keep query payloads bounded; combined table pages can be truncated even when the underlying SELECT succeeds, so split tables or reduce page sizes and validate the complete decoded payload before importing. Reconcile every candidate table count with both the copy-start and final source counts.

Define and invoke tool-calling runners in the same CodeExecution block with the current callback objects. Persisted runner functions that retain tool callbacks may fail after replay with `executeJs is not defined`.

**Why:** Large copies can encounter source-order mistakes, truncated scalar results, notebook resets, and callback replay failures even when each database operation is valid.

**How to apply:** For an approved read-only copy, use source-primary-key pages, explicit insert column lists, bounded payloads, workspace-persisted progress, and per-table count checks before promoting the candidate.
