---
name: PostgreSQL identifier limits
description: Drizzle-generated constraint names can exceed PostgreSQL's stored identifier limit.
---

PostgreSQL stores identifiers up to 63 bytes. Longer generated foreign-key or index names can be silently truncated even when schema metadata reports the full name.

**Why:** a reviewed schema migration appeared to miss one foreign key during verification because the expected name was longer than PostgreSQL's stored name.

**How to apply:** when verifying migrations, query `pg_constraint` and `pg_indexes` for the actual stored names rather than assuming the generated name is preserved verbatim.
