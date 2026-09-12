---
name: Vendor import integrity
description: Partial-import recovery and type-safe retry boundaries for exported vendor bills.
---

Treat vendor bills and dependent hire records as one import unit; a prior import's row count is not proof of newly inserted records.

**Why:** The old importer upserted tables independently, so a missing child-table column could leave headers updated before items failed. Without the original export, aggregate counts cannot establish what was restored or overwritten.

**How to apply:** Preserve existing data, require the original JSON to reconcile recovery, and reject divergent ID collisions rather than silently overwrite. Old exports with linked hire IDs may lack their dependent statements; do not remove those links to force an import.

Normalize import timestamps by schema type, not by string appearance, and advance every imported serial sequence.

**Why:** ISO-looking audit strings stored as text are not timestamp columns. Generic coercion breaks exact retries; imported explicit IDs otherwise collide with future generated IDs.

**How to apply:** Test real JSON round-trips and transaction rollback, including text audit dates, timestamp fields, numeric strings, JSON snapshots and dependent hire sequences.