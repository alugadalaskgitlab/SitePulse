---
name: Read-only schema drift checks
description: User restriction on database drift verification
---
Database drift checks must be read-only. Never add a temporary test column.

**Why:** The user explicitly restricted drift-check scope.

**How to apply:** Compare existing schema metadata only; do not perform schema-sync writes or test DDL.