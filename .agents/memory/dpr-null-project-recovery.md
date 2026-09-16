---
name: DPR null-project recovery
description: Preserve explicit project intent without permanently trapping old drafts outside their site's BOQ.
---

Resolve projects silently from the site for new DPRs; do not expose a manual project picker, project-status panel, or attachment confirmation. Positive saved pins remain immutable; saved null is recoverable only with live BOQ evidence.

**Why:** on 2026-09-16 the user rejected manual project controls, then clarified that real live BOQ references must override a stale null across every editor, while genuinely BOQ-less reports stay null.

**How to apply:** new reports use existing site priority; null recovery requires a unique same-site project owning every live item. Revalidate ownership server-side and persist the corrected header. No-reference nulls remain null, and positive pins never re-guess. Empty saved-null drafts cannot expose a first-item picker under the strict no-reference rule; changing that needs an explicit decision.

Recovery eligibility must reflect evidence surviving the replacement, not every previously stored child. Resolve site identity unambiguously rather than accepting any same-named site.

**Why:** counting cleared progress as evidence can assign a project to a now-BOQ-less report; normalized site names are not unique and cannot alone authorize cross-project recovery.

**How to apply:** count incoming rows and genuinely preserved equipment children, reject ambiguous site identities, and revoke transient client recovery synchronously when the last live reference is removed before saving.

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