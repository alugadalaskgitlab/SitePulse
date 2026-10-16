---
name: Payables vs prior statement
description: Keep aggregate vendor liability distinct from the previous-bill statement's prior-only date and ID ordering.
---

Aggregate payables include every linked bill that qualifies under the existing financial-review helpers. The previous-bill summary applies its own prior-only date/ID rule; a later same-date bill is excluded there, but that exclusion must not remove it from aggregate liability. Bills without a vendor link stay visible under their exact typed name and outside linked-vendor totals.

**Why:** The user chose the existing eligibility calculation for aggregate payables while confirming that the previous-bill exclusion rule remains correct.

**How to apply:** Use the shared financial helpers for amounts. Keep statement filtering local to the previous-bill view, and explain excluded later or unlinked bills instead of changing identity or ordering rules.
