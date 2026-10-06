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