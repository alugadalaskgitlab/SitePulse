---
name: Equipment movement lifecycle
description: Durable integrity rules for onward equipment movement, receiving completion, DPR corrections, and diesel ownership.
---

Each physical work segment is a separate equipment-usage row. An onward move creates exactly one open successor with meter continuity and no movement diesel; it never reopens or repurposes the closed source.

**Why:** A split DPR/usage commit can leave a submitted report linked to an open segment with no canonical diesel owner. A preflight-only immutability check also has a race where a successor can be created before a DPR version commits.

**How to apply:** Final DPR submission/versioning must close or synchronize linked usage, materialize unlinked Site logs, and transfer diesel-ledger ownership inside the same database transaction. Lock linked rows, and if a successor exists, compare the new version against the original linked DPR log in that transaction before allowing an unchanged historical copy.

Unchanged equipment is not permission to skip missing-reference validation.
Investigate restoration before considering a one-record detach; an empty
development audit does not establish that a published reference is irrecoverable.

**Why:** The owner explicitly requires dangling links to continue blocking saves,
even when the requested correction changes only chainages.

**How to apply:** Keep any proposed no-op optimization separate from integrity
validation and obtain approval before implementing it. Never infer permission
to repair production from a development-only reproduction request.