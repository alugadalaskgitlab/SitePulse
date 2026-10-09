---
name: Startup stock-ledger backfill race
description: Transient primary-key collisions can appear when the development workflow is restarted repeatedly in quick succession
---

**Rule:** Do not attribute a one-off stock-ledger primary-key collision during a rapid development restart to the feature under test without checking a settled restart and the changed paths.

**Why:** Legacy startup backfills delete, reseed, and recreate ledger rows asynchronously. Closely spaced workflow restarts can overlap that work, producing one reported duplicate-key row while the application still reaches its serving state.

**How to apply:** Avoid unnecessary consecutive restarts. Check whether existing startup work has settled; serving HTTP does not mean the asynchronous repairs have finished. Treat a persistent collision as separate stock-ledger migration work rather than silently folding it into an unrelated feature.

**User instruction:** Do not add any flag or switch that disables data repairs. For verification, take the before snapshot, run verification, and take the after snapshot without restarting between them. If a restart is genuinely unavoidable, take a third snapshot immediately after the restart and before the batch work, and show all three.

**Why:** The user explicitly rejected disabling repairs; startup work can otherwise be mistaken for changes caused by the feature being verified.

**How to apply:** Plan verification without a restart. If one is unavoidable, separate its effects from the batch and establish the verification baseline only after asynchronous startup repairs settle.

Even one ordinary restart can rewrite historical dispatch ledger contents and
recompute balances without changing table row counts. Count equality is not
preservation proof; compare content digests and never label the run clean when
they differ.

**Why:** Permission acceptance encountered legacy startup repairs that reported
recreated LDO rows; post-cleanup stock ledger/balance counts matched but hashes did
not. Do not reverse real historical changes as if they were test fixtures.

**Rule:** Individual data-condition or completion-marker guards do not establish
idempotency of a startup chain when an earlier repair undoes a later one's work.

**Why:** The previous automatic chain's older dip-accounting repair deleted dispatch consumption; the newer
dispatch migration skipped on its completed marker, and the final missing-row
backfill recreated dispatch rows. Also inspect asynchronous seeding launched by
route registration, not only the main startup runner, before certifying safety.

**Rule:** Historical stock repairs belong outside ordinary startup; keep normal
operational posting intact. Maintenance tooling must default to read-only
planning, with execution requiring a separately reviewed plan and approval.

**Why:** The user approved this separation after conflicting historical models
rewrote the ledger on routine restarts. This is a permanent startup boundary,
not an environment-variable bypass to make verification appear clean.

**How to apply:** Test startup with isolated spies and inspect transitive seed
helpers before restarting. Compare business-content digests across the restart;
sequence advancement from normal upserts is distinct from sequence resetting.