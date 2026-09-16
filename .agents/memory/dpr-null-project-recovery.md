---
name: DPR null-project recovery
description: Preserve explicit project intent without permanently trapping old drafts outside their site's BOQ.
---

Treat a saved null project as unassigned, not proof that the user deliberately rejected BOQ work. Never auto-guess a replacement; allow explicit, confirmed same-site attachment only when the persisted report has no BOQ references.

**Why:** a live site had a populated BOQ while its newest draft retained a null project, leaving both Guided and Edit unable to offer BOQ work. Pinning null forever fixed accidental reassignment but prevented recovery.

**How to apply:** distinguish persisted evidence from newly selected incoming items: a confirmed attachment and first item must save together. Revalidate persisted evidence and site ownership under the transaction lock; positive pins stay immutable. Submitted versions need superseded-source rejection to prevent multiple recovery branches.

Capture planning-scope tokens before asynchronous validation, not immediately before storage.

**Why:** capturing after validation can accept a newer token even though validation used older scope.

**How to apply:** carry the original token into the target-project lock check. Preserve pending UI recovery intent through unresolved-to-resolved site loading, but invalidate genuine site changes.

Use one cross-operation lock order: sorted project rows before the DPR row, including draft replacement, clone, and version.

**Why:** source-first version locking conflicts with project-first clone locking and can deadlock concurrent operations on the same report.

**How to apply:** read the pin optimistically to find project locks, then reload the DPR under lock and reject changed pins rather than acquiring a newly discovered project while holding the DPR lock.

Version validation must preserve unchanged historical BOQ IDs when catalogue items were removed by deletion or replace-import.

**Why:** DPR links intentionally retain raw identity without catalogue foreign keys; treating every missing item as a new invalid selection blocks legitimate historical corrections.

**How to apply:** allow missing IDs only for the exact persisted source-child identity with the same link. Reject new missing IDs and every extant foreign-project ID; never apply this exception to null-project recovery.

Validate raw persisted-reference queries against real PostgreSQL, not solely transaction mocks or browser fetch fixtures.

**Why:** both mock layers passed while a UNION arm referenced a nonexistent column and every confirmed attachment failed on the real database.

**How to apply:** exercise empty and nested-reference reports plus actual route save/reopen in an isolated development schema; include a negative control proving the harness detects invalid SQL.