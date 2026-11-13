---
name: Company settings in transactions
description: Keep company identity reads inside the transaction that generates a number or resolves an own-company party.
---
When storage code needs company identity inside a database transaction, read `company_name` and `company_short_name` through that transaction's executor. Do not use a setting helper that queries the global database connection.

**Why:** PGlite uses a single connection; querying the global connection while a transaction is open can hang. Using the same executor also keeps the identity snapshot consistent with the operation.

**How to apply:** Transaction-scoped number generation and own-party resolution should accept and pass the active executor into the company-identity reader.
