---
name: Vendor-bill payment accounts
description: Payment-account choices must be maintained as editable business master data.
---

## Rule
Payment-account choices are user-editable master data, never a hard-coded list.

**Why:** The payment-account setup is deliberately deferred; the company needs to maintain its own account choices without code changes.

**How to apply:** When adding payment-account selection or administration, persist editable records and load them from the application rather than embedding account names or IDs in UI or server code.
