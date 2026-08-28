---
name: Startup stock-ledger backfill race
description: Transient primary-key collisions can appear when the development workflow is restarted repeatedly in quick succession
---

**Rule:** Do not attribute a one-off stock-ledger primary-key collision during a rapid development restart to the feature under test without checking a settled restart and the changed paths.

**Why:** Legacy startup backfills delete, reseed, and recreate ledger rows asynchronously. Closely spaced workflow restarts can overlap that work, producing one reported duplicate-key row while the application still reaches its serving state.

**How to apply:** Avoid unnecessary consecutive restarts. Check whether the server is serving and whether a later settled startup completes the backfill with zero errors. Treat a persistent collision as separate stock-ledger migration work rather than silently folding it into an unrelated feature.