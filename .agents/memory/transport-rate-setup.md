---
name: Transport rate setup compatibility
description: Why the new transport pricing basis must remain separate from legacy flat-rate identity.
---

Transport setup must preserve the existing flat rate, saved unit and item identity. A derived TRIP label is display-only; it must not rewrite an MT/KM/hourly card into a per-trip card.

**Why:** The user approved setup separately from bill-pricing integration. Replacing a legacy flat rate with a derived trip figure before updating its consumers can multiply lead or quantity twice. Existing NULL-basis cards must remain unchanged, and payload 30 is only an editor default, not a database default.

**How to apply:** Pricing consumers must explicitly opt into the saved basis. Keep ordinary bill-to-standing-rate write-back semantics unchanged unless separately authorized; callers omitting basis fields must not clear them. Do not infer approval to implement bill-pricing integration from approval of rate setup.