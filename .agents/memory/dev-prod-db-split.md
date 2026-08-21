---
name: Dev/Prod Database Split
description: Architecture of the two-database setup — dev uses sitelog_dev, production uses heliumdb; how server/db.ts selects the connection.
---

# Dev/Prod Database Split

## The Rule
The dev server (`npm run dev`) connects to `sitelog_dev`; the production deployment connects to `heliumdb`. All bug-fixing and feature testing is done against the dev database only. Production only receives code changes via Publish.

**Why:** Previously both environments shared `heliumdb`, meaning every test run risked corrupting live data.

## How to Apply
- `server/db.ts` reads `process.env.DEV_DATABASE_URL || process.env.DATABASE_URL`.
- `DEV_DATABASE_URL` is set as a **development-scoped** env var (not shared, not a secret) pointing to `postgresql://...@helium:5432/sitelog_dev?sslmode=disable`.
- The production deployment does not have `DEV_DATABASE_URL` in its secrets, so it continues to use `DATABASE_URL` → `heliumdb`.
- On startup, if `DEV_DATABASE_URL` is active, the server logs: `[db] Using DEV_DATABASE_URL (development database)`.

## Database Details
| | Name | Used by |
|---|---|---|
| Production | `heliumdb` | Deployed app via Publish |
| Development | `sitelog_dev` | Dev server, testing |

Both databases live in the same PostgreSQL cluster on host `helium:5432` (postgres superuser). `sitelog_dev` was seeded from a clean pg_dump taken on 2026-07-18 after removing test sites SMOKE (id=15) and NH-167 (id=17).

## Backup Files
Located in `.local/backups/` (not committed to git — push manually to GitHub if needed):
- `production_full_20260718_105812.sql` — 2.6MB, 114 tables, pre-deletion snapshot
- `production_clean_seed_20260718_110523.sql` — 2.1MB, 114 tables, seed used for sitelog_dev

## Re-seeding sitelog_dev
If the dev database needs to be reset from a fresh production snapshot:
```bash
pg_dump "$DATABASE_URL" -Fp -f .local/backups/new_seed.sql
psql "${DATABASE_URL/heliumdb/sitelog_dev}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "${DATABASE_URL/heliumdb/sitelog_dev}" -f .local/backups/new_seed.sql
```
Then restart the dev server — startup migrations will self-correct any missing data.

## Startup Migration Behaviour on First Boot of a Restored Dev DB
Some `app_settings`-gated migrations correctly skip. A few data-condition migrations (not flag-gated) run once and self-correct:
- `backfillMissingDispatchLdoRows` — creates missing LDO ledger rows, 0 on subsequent boots
- `migrateDprPlantStockDieselToLedger` — creates diesel ledger entries, 0 on subsequent boots
- `migrateSupersededDprs` — re-flags superseded DPRs, idempotent

This is expected and correct. The second boot will show all of these as 0.

## Publish diff source (critical — Aug 2026 incident)
Replit Publishing diffs the **Replit-managed dev DB (heliumdb via workspace DATABASE_URL)** against production — NOT schema.ts and NOT sitelog_dev. Because all schema work goes to sitelog_dev, heliumdb silently drifts and Publish then generates destructive DROP COLUMN/TABLE statements against populated prod tables.
**Rule:** after any schema change to sitelog_dev, apply the same additive DDL to heliumdb ($DATABASE_URL) before the user publishes. To repair drift: diff information_schema columns of both DBs, then pg_dump -s missing tables from sitelog_dev into heliumdb + generated ADD COLUMN IF NOT EXISTS statements (never drizzle-kit push blindly — review first). Aug 2026 repair: 13 tables + 73 columns; scripts kept in .agents/outputs/schema-audit/.

## Publish migration drift trap (Aug 2026)
- Replit publishing diffs the built-in dev DB (DATABASE_URL) against production — but the dev server runs on sitelog_dev, so runtime startup `ensure*` ALTERs never reach DATABASE_URL. Result: publish proposed DROP COLUMN for prod columns "missing" in dev (nearly deleted earthwork_arrangements.scope_segment_ids data).
- **How to apply:** whenever a startup script adds a column, mirror it into DATABASE_URL too (or before publishing, apply the missing ADD COLUMNs there). Never approve a publish migration containing DROP without checking this drift first.
- Drift checks must compare column defaults and nullability as well as column presence. A runtime `DROP DEFAULT` can make sitelog_dev look correct while DATABASE_URL still carries a legacy default that Publish tries to restore in production.
- **Why:** Publish once proposed restoring an obsolete Stores default even though the Drizzle schema and production were correct; only the Publish-facing development database was stale.
- **How to apply:** keep default changes in the versioned schema/migrations, align DATABASE_URL to that source of truth, and remove runtime-only DDL that masks the mismatch.
