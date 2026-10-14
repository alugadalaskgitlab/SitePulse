---
name: Hire snapshot read consistency
description: Transaction boundary for canonical Equipment Performance rows saved with hire-bill snapshots.
---

**Rule:** When a new hire-bill snapshot includes canonical Equipment Performance evidence, query it through the bill's active transaction rather than opening an outer database query.

**Why:** A separate PGlite read while a write transaction was active stalled snapshot creation; passing the active executor avoided the lockup.

**How to apply:** Keep the report reader executor-aware. In test doubles, ensure awaited query builders return an awaitable result, including queries that need a trivial non-null predicate before awaiting.
