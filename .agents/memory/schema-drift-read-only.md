---
name: Read-only schema drift checks
description: User restriction on database drift verification
---
Database drift checks must be read-only. Never add a temporary test column.

**Why:** The user explicitly restricted drift-check scope.

**How to apply:** Compare existing schema metadata only; do not perform schema-sync writes or test DDL.

For the transport rate-card expansion, do not run any migration until the user has seen and approved the Publish preview SQL. The user wants to publish the whole-bill export separately before transport-rate work starts.

**Why:** The user explicitly repeated this approval requirement.

**How to apply:** Keep preview/reporting read-only. An empty schema preview does not establish that the current application contains only the requested feature; disclose other application changes already present.