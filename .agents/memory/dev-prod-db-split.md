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
