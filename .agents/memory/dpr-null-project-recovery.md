---
name: DPR null-project recovery
description: Preserve explicit project intent without permanently trapping old drafts outside their site's BOQ.
---

Resolve projects silently from the site for new DPRs; do not expose a manual project picker, project-status panel, or attachment confirmation in the DPR forms. Preserve saved positive and explicit-null project pins on reopen and autosave restore.

**Why:** on 2026-09-16 the user rejected the manual recovery panel as an unwanted step and explicitly required silent site resolution while retaining saved-project stability and unscheduled item selection.

**How to apply:** use existing automatic priority for new/multi-project sites. Do not silently repair old saved-null records or reintroduce a chooser; that needs a separate decision. The server still supports explicit confirmed same-site recovery only without persisted BOQ references; preserve its transaction/site guards and superseded-source checks even though normal forms no longer expose it.

Capture planning-scope tokens before asynchronous validation, not immediately before storage.

**Why:** capturing after validation can accept a newer token even though validation used older scope.

**How to apply:** carry the original token into the target-project lock check. Preserve stable project intent through unresolved-to-resolved site loading, but invalidate genuinely changed site context where allowed.

Use one cross-operation lock order: sorted project rows before the DPR row, including draft replacement, clone, and version.

**Why:** source-first version locking conflicts with project-first clone locking and can deadlock concurrent operations on the same report.

**How to apply:** read the pin optimistically to find project locks, then reload the DPR under lock and reject changed pins rather than acquiring a newly discovered project while holding the DPR lock.

Version validation must preserve unchanged historical BOQ IDs when catalogue items were removed by deletion or replace-import.

**Why:** DPR links intentionally retain raw identity without catalogue foreign keys; treating every missing item as a new invalid selection blocks legitimate historical corrections.

**How to apply:** allow missing IDs only for the exact persisted source-child identity with the same link. Reject new missing IDs and every extant foreign-project ID; never apply this exception to null-project recovery.

Validate raw persisted-reference queries against real PostgreSQL, not solely transaction mocks or browser fetch fixtures.

**Why:** both mock layers passed while a UNION arm referenced a nonexistent column and every confirmed attachment failed on the real database.

**How to apply:** exercise empty and nested-reference reports plus actual route save/reopen in an isolated development schema; include a negative control proving the harness detects invalid SQL.