# FIX-SPDP-01 — Allow supply-order outbox rows

## Constraint found

Both development databases had the constraint named `dispatchpro_outbox_operation_check`, originally allowing only `create`, `patch`, and `cancel`:

- `sitelog_dev`
- `heliumdb` (Publish-facing development database)

Both had zero existing outbox rows before the change.

## Migration

Added and applied `migrations/0067_dispatchpro_outbox_order_operation.sql` to both development databases. Its complete SQL is:

```sql
ALTER TABLE dispatchpro_outbox
  DROP CONSTRAINT IF EXISTS dispatchpro_outbox_operation_check;

ALTER TABLE dispatchpro_outbox
  ADD CONSTRAINT dispatchpro_outbox_operation_check
  CHECK (operation IN ('create', 'patch', 'cancel', 'order'));
```

The Drizzle schema now declares the same named check. Only the outbox operation constraint changed in the databases; no rows or other tables changed, and truck-sending code was untouched. The constraint was verified on both development databases after migration; existing outbox row counts remained zero.

## Tests and checks

- Real-schema PGlite test applies the shipped DispatchPro migrations, calls the actual order queue function, and verifies that `order`, `create`, `patch`, and `cancel` rows all insert.
- Focused DispatchPro tests: **15 passed** across 3 files.
- Full suite: **6,016 passed, 3 skipped, 0 failed** (505 files passed; 2 skipped).
- `npm run build`: passed.
- Development app restarted; read-only startup readiness reported `ready: true` with 2,445 columns checked.

No production database was accessed, and nothing was published.
