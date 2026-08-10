---
name: Publish migration drop trap (runtime startup DDL)
description: Why the publish flow proposes DROP TABLE for tables created by startup ensure* DDL, and how to prevent it.
---

- **Rule:** never create tables via runtime startup DDL (`ensure*` methods with CREATE TABLE). New tables must exist in the workspace `DATABASE_URL` database (the one Replit's publish diff compares against) via the normal schema push, AND in `shared/schema.ts`.
- **Why:** the dev server runs on `DEV_DATABASE_URL`, so startup DDL created `road_geometry_profiles` in production but never in the `DATABASE_URL` database. The publish diff saw a prod-only table and generated `DROP TABLE ... CASCADE`. User rule: never drop anything from the live DB.
- **How to apply:** when adding a table, push schema to BOTH `DEV_DATABASE_URL` and `DATABASE_URL` databases. Before any publish, if the preview shows a DROP, compare `information_schema.tables` between `psql "$DATABASE_URL"` and production (read-only via production SQL) and align by creating the missing structure — never by approving the drop.
- **Watch out:** many other legacy `ensure*` startup DDL functions still exist in server startup (stock reconciliation, material requirements, service completions, etc.). Any of them can reproduce this trap for a new table; the same alignment fix applies.
- Fresh environments now require a schema push before geometry routes work — startup no longer bootstraps that table.
