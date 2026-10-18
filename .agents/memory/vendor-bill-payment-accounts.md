---
name: Vendor-bill payment accounts
description: Payment-account choices must be maintained as editable business master data.
---

## Rule
Payment-account choices are user-editable master data, never a hard-coded list.

**Why:** The payment-account setup is deliberately deferred; the company needs to maintain its own account choices without code changes.

**How to apply:** When adding payment-account selection or administration, persist editable records and load them from the application rather than embedding account names or IDs in UI or server code.

Vendor-bill funding attribution is explicit evidence: HLC company, ALPS paying on HLC's behalf, or a named personal payer. The selected account's `own` / `third_party` source must match the payer. Existing bills must not be backfilled or inferred; owners set their sources manually. Diesel remains company/personal and its shared account endpoint keeps the original own-account response unless vendor bills explicitly opt into third-party accounts.

**Why:** Historical bill rows do not establish who funded them, and broadening the shared selector would change the separate diesel workflow.

**How to apply:** Keep funding-source validation and reporting additive, and only include recorded ALPS-funded amounts. Preserve the default diesel endpoint's account shape; use an explicit vendor-bill-only opt-in for third-party accounts.
