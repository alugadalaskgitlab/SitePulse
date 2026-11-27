# FIX-BIT-01

## Part 1 — bitumen tracker crash

The page treated `{ rows, canDecant }` as an array. It now reads `rows`, defaulting to an empty list. Ledger positions use the returned MT fields; screen/PDF/print/Excel show `—` for missing or non-numeric values. The existing route was not changed.

Focused tests: **29 passed (2 files)**, including rendered real-shape, missing/empty rows, malformed values and Excel output. Build passed. No migration or real data changes.

## Safety check

Read-only catalog checks found **no CHECK constraints on stock_ledger** in either `sitelog_dev` or development `heliumdb`. No production access.
