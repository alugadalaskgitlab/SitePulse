---
name: Labour worker name preservation
description: Optional names must survive parent replacement without changing aggregate headcount or overwriting in-flight edits.
---

Count remains authoritative; names are optional supplementary detail, including when their number exceeds Count. Do not introduce a roster or automatic deduplication.

**Why:** The approved feature serves both contractor crews and one-off local labour without requiring a complete attendance list.

**How to apply:** Show an excess-name warning only. Leave readiness and headcount calculations unchanged.

For existing identified rows, omission preserves names and an explicit empty list clears them. New rows send an explicit empty list when no names were entered. Reject ambiguous legacy replacement of named rows rather than guessing by category, contractor, or position.

**Why:** Parent replacement can silently cascade-delete children, while treating every omitted field as deletion breaks older clients. Distinguishing new-row intent also prevents a legitimate new unnamed row from being mistaken for ambiguous legacy input.

**How to apply:** Preserve identities in every full and section save, copy names onto new parent IDs in versions/copies, and retain optional-field presence until persistence.

After a save regenerates parent IDs, adopt returned identities without overwriting in-flight names or other fields.

**Why:** Testing only save/reload missed stale identities on the next save of the same mounted form. Replacing the full local row with the response would instead discard edits made while saving.

**How to apply:** Test two consecutive saves with rotating server IDs, plus edits/additions/deletions during the first request. Fixture responses must model replacement, not unrealistically retain IDs.