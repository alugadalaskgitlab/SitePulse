---
name: Three database targets
description: Dev runtime, Publish comparison source, and managed production are distinct database targets that must not be conflated.
---

# Three Database Targets

## The Rule
Treat the dev runtime database, Replit's managed development database used by Publish, and managed production as three distinct targets. Never infer one target's schema from another.

**Why:** The dev app was correctly using its isolated database while the managed Publish comparison database missed additive migrations. Publish therefore proposed deleting populated production columns and a history table to match stale development schema.

## How to Apply
- `server/db.ts` reads `process.env.DEV_DATABASE_URL || process.env.DATABASE_URL`.
- `DEV_DATABASE_URL` is set as a **development-scoped** env var (not shared, not a secret) pointing to `postgresql://...@helium:5432/sitelog_dev?sslmode=disable`.
- The production deployment does not select `DEV_DATABASE_URL`; Replit supplies its managed production connection.
- On startup, if `DEV_DATABASE_URL` is active, the server logs: `[db] Using DEV_DATABASE_URL (development database)`.

## Database Roles
| Role | Name | Used by |
|---|---|---|
| App development | `sitelog_dev` | Dev server and testing |
| Publish comparison source | `heliumdb` | Replit's managed development schema |
| Managed production | platform production database | Deployed app and production read-only query path |

**How to apply:** verify the dev workflow connection, the development SQL callback target, and the production read-only SQL target separately. Before Publish, align additive schema in both development targets and require a zero-drop schema preview.

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

## Live production DATA is NOT heliumdb (observed Aug 2026)
The deployed app's runtime database is the Replit-managed production DB, reachable read-only via the production-environment SQL query path — its contents differ from workspace `$DATABASE_URL` (heliumdb): different bar ids, different project rows. heliumdb is only the Publish-facing schema-diff source. **How to apply:** to inspect or verify live prod data, query environment=production (read-only); to fix prod data, ship an idempotent startup backfill and have the user publish — never assume a psql write to heliumdb touched production.

## Publish diff source (critical — Aug 2026 incident)
Replit Publishing diffs the **Replit-managed dev DB (heliumdb via workspace DATABASE_URL)** against production — NOT schema.ts and NOT sitelog_dev. Because all schema work goes to sitelog_dev, heliumdb silently drifts and Publish then generates destructive DROP COLUMN/TABLE statements against populated prod tables.
**Rule:** after any schema change to sitelog_dev, apply the same additive DDL to heliumdb ($DATABASE_URL) before the user publishes. To repair drift: diff information_schema columns of both DBs, then pg_dump -s missing tables from sitelog_dev into heliumdb + generated ADD COLUMN IF NOT EXISTS statements (never drizzle-kit push blindly — review first). Aug 2026 repair: 13 tables + 73 columns; scripts kept in .agents/outputs/schema-audit/.

## Publish migration drift trap (Aug 2026)
- Replit publishing diffs the built-in dev DB (DATABASE_URL) against production — but the dev server runs on sitelog_dev, so runtime startup `ensure*` ALTERs never reach DATABASE_URL. Result: publish proposed DROP COLUMN for prod columns "missing" in dev (nearly deleted earthwork_arrangements.scope_segment_ids data).
- **How to apply:** whenever a startup script adds a column, mirror it into DATABASE_URL too (or before publishing, apply the missing ADD COLUMNs there). Never approve a publish migration containing DROP without checking this drift first.
- Drift checks must compare column defaults and nullability as well as column presence. A runtime `DROP DEFAULT` can make sitelog_dev look correct while DATABASE_URL still carries a legacy default that Publish tries to restore in production.
- **Why:** Publish once proposed restoring an obsolete Stores default even though the Drizzle schema and production were correct; only the Publish-facing development database was stale.
- **How to apply:** keep default changes in the versioned schema/migrations, align DATABASE_URL to that source of truth, and remove runtime-only DDL that masks the mismatch.
- A development-environment database callback can update the Publish-facing `DATABASE_URL` database rather than the custom `DEV_DATABASE_URL` used by the running app. For additive schema work, verify both connections explicitly and confirm the restarted app logs no missing-column errors.
